package uk.dentsuite.dentstaff;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@ApplicationScoped
public class KeycloakAdminClient {
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Inject
    ObjectMapper objectMapper;

    @ConfigProperty(name = "dentsuite.keycloak.internal-url")
    String keycloakUrl;

    @ConfigProperty(name = "dentsuite.keycloak.realm")
    String realm;

    @ConfigProperty(name = "dentsuite.keycloak.admin-username")
    String adminUsername;

    @ConfigProperty(name = "dentsuite.keycloak.admin-password")
    String adminPassword;

    public String createUser(
            String username,
            String email,
            String password,
            String accountType,
            boolean practiceManager) {
        String token = getAdminToken();
        String userUrl = realmUrl() + "/users";
        Map<String, Object> user = Map.of(
                "username", username,
                "email", email,
                "enabled", true,
                "credentials", List.of(Map.of(
                        "type", "password",
                        "value", password,
                        "temporary", false)));
        HttpResponse<String> response = sendJson("POST", userUrl, token, user);
        if (response.statusCode() != 201) {
            throw new KeycloakException(response.statusCode(), "Keycloak could not create this account.");
        }

        String location = response.headers().firstValue("Location")
                .orElseThrow(() -> new KeycloakException(502, "Keycloak did not return the account identifier."));
        String userId = URI.create(location).getPath();
        userId = userId.substring(userId.lastIndexOf('/') + 1);

        try {
            String roleUrl = realmUrl() + "/roles/" + encode(accountType);
            HttpResponse<String> roleResponse = send("GET", roleUrl, token, null);
            if (roleResponse.statusCode() != 200) {
                throw new KeycloakException(roleResponse.statusCode(), "Keycloak account role is unavailable.");
            }
            Map<String, Object> role = objectMapper.readValue(
                    roleResponse.body(), new TypeReference<>() {
                    });
            List<Map<String, Object>> roles = new java.util.ArrayList<>();
            roles.add(role);
            if (practiceManager) {
                HttpResponse<String> managerRoleResponse = send(
                        "GET", realmUrl() + "/roles/" + encode("PRACTICE_MANAGER"), token, null);
                if (managerRoleResponse.statusCode() != 200) {
                    throw new KeycloakException(
                            managerRoleResponse.statusCode(), "Keycloak practice manager role is unavailable.");
                }
                roles.add(objectMapper.readValue(managerRoleResponse.body(), new TypeReference<>() {
                }));
            }
            HttpResponse<String> mappingResponse = sendJson(
                    "POST",
                    realmUrl() + "/users/" + encode(userId) + "/role-mappings/realm",
                    token,
                    roles);
            if (mappingResponse.statusCode() != 204) {
                throw new KeycloakException(
                        mappingResponse.statusCode(), "Keycloak could not assign the account roles.");
            }
        } catch (IOException exception) {
            deleteUser(userId, token);
            throw new KeycloakException(502, "Keycloak returned an invalid role response.", exception);
        } catch (RuntimeException exception) {
            deleteUser(userId, token);
            throw exception;
        }
        return userId;
    }

    public void deleteUser(String userId) {
        deleteUser(userId, getAdminToken());
    }

    private void deleteUser(String userId, String token) {
        HttpResponse<String> response = send(
                "DELETE",
                realmUrl() + "/users/" + encode(userId),
                token,
                null);
        if (response.statusCode() != 204 && response.statusCode() != 404) {
            throw new KeycloakException(response.statusCode(), "Keycloak could not roll back the new account.");
        }
    }

    private String getAdminToken() {
        String form = "client_id=admin-cli"
                + "&grant_type=password"
                + "&username=" + encode(adminUsername)
                + "&password=" + encode(adminPassword);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(keycloakUrl + "/realms/master/protocol/openid-connect/token"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        HttpResponse<String> response = send(request);
        if (response.statusCode() != 200) {
            throw new KeycloakException(503, "Den Suite could not connect to the identity service.");
        }
        try {
            Map<String, Object> token = objectMapper.readValue(
                    response.body(), new TypeReference<>() {
                    });
            Object accessToken = token.get("access_token");
            if (!(accessToken instanceof String value) || value.isBlank()) {
                throw new KeycloakException(502, "Identity service returned no access token.");
            }
            return value;
        } catch (IOException exception) {
            throw new KeycloakException(502, "Identity service returned an invalid access token response.", exception);
        }
    }

    private HttpResponse<String> sendJson(String method, String url, String token, Object body) {
        try {
            return send(
                    method,
                    url,
                    token,
                    objectMapper.writeValueAsString(body));
        } catch (IOException exception) {
            throw new KeycloakException(500, "Could not prepare the identity service request.", exception);
        }
    }

    private HttpResponse<String> send(String method, String url, String token, String body) {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + token);
        if (body == null) {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            request.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        return send(request.build());
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new KeycloakException(503, "Identity service request was interrupted.", exception);
        } catch (IOException exception) {
            throw new KeycloakException(503, "Den Suite could not reach the identity service.", exception);
        }
    }

    private String realmUrl() {
        return keycloakUrl + "/admin/realms/" + encode(realm);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    public static class KeycloakException extends RuntimeException {
        private final int status;

        public KeycloakException(int status, String message) {
            super(message);
            this.status = status;
        }

        public KeycloakException(int status, String message, Throwable cause) {
            super(message, cause);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }
}
