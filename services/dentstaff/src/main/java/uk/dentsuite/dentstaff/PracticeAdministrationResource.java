package uk.dentsuite.dentstaff;

import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;

@ApplicationScoped
@Path("/api/v1/admin/practices")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("DENTSUITE_ADMIN")
public class PracticeAdministrationResource {
    private static final Logger LOG = Logger.getLogger(PracticeAdministrationResource.class);

    @Inject
    DataSource dataSource;

    @Inject
    SecurityIdentity identity;

    @Inject
    CodeVault codeVault;

    @Inject
    Mailer mailer;

    @ConfigProperty(name = "dentsuite.public-web-url")
    String publicWebUrl;

    @GET
    public Response listOnboardedPractices() {
        String query = """
                SELECT pg.id, pg.name, pg.practice_setup, pg.created_at,
                       COUNT(DISTINCT p.id) AS practice_count,
                       COUNT(DISTINCT a.id) AS account_count,
                       MIN(a.username) FILTER (WHERE a.account_type = 'EMPLOYER') AS employer_username,
                       MIN(a.email) FILTER (WHERE a.account_type = 'EMPLOYER') AS employer_email
                FROM practice_groups pg
                JOIN accounts a ON a.practice_group_id = pg.id
                LEFT JOIN practices p ON p.practice_group_id = pg.id
                GROUP BY pg.id, pg.name, pg.practice_setup, pg.created_at
                ORDER BY pg.created_at DESC
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(query);
                ResultSet result = statement.executeQuery()) {
            List<OnboardedPracticeGroup> practiceGroups = new ArrayList<>();
            while (result.next()) {
                UUID id = result.getObject("id", UUID.class);
                practiceGroups.add(new OnboardedPracticeGroup(
                        id.toString(),
                        result.getString("name"),
                        result.getString("practice_setup"),
                        result.getString("employer_username"),
                        result.getString("employer_email"),
                        result.getLong("practice_count"),
                        result.getLong("account_count"),
                        result.getTimestamp("created_at").toInstant(),
                        "PROFILE_CREATED"));
            }
            return Response.ok(practiceGroups).build();
        } catch (SQLException exception) {
            LOG.error("Could not load onboarded practice groups for the administrator.", exception);
            return Response.serverError()
                    .entity(Map.of("message", "Onboarded practices could not be loaded."))
                    .build();
        }
    }

    @PUT
    @Path("/{groupId}/license")
    public Response updatePracticeLicense(
            @PathParam("groupId") String groupIdValue,
            UpdateLicenseRequest request) {
        UUID groupId;
        try {
            groupId = UUID.fromString(groupIdValue);
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice group.");
        }
        if (request == null || request.practiceSetup() == null) {
            return error(Response.Status.BAD_REQUEST, "Choose a practice license.");
        }
        String setup = request.practiceSetup().trim().toUpperCase(Locale.ROOT);
        if (!setup.equals("SINGLE") && !setup.equals("MULTIPLE")) {
            return error(Response.Status.BAD_REQUEST, "Choose single or multiple practices.");
        }

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT practice_setup FROM practice_groups WHERE id = ? FOR UPDATE")) {
                    statement.setObject(1, groupId);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) {
                            connection.rollback();
                            return error(Response.Status.NOT_FOUND, "Practice group was not found.");
                        }
                    }
                }
                if (setup.equals("SINGLE")) {
                    List<UUID> practiceIds = new ArrayList<>();
                    try (PreparedStatement statement = connection.prepareStatement(
                            "SELECT id FROM practices WHERE practice_group_id = ? ORDER BY created_at")) {
                        statement.setObject(1, groupId);
                        try (ResultSet result = statement.executeQuery()) {
                            while (result.next()) {
                                practiceIds.add(result.getObject(1, UUID.class));
                            }
                        }
                    }
                    if (practiceIds.size() > 1) {
                        UUID keep = parseId(request.keepPracticeId());
                        if (keep == null || !practiceIds.contains(keep)) {
                            connection.rollback();
                            return error(Response.Status.CONFLICT,
                                    "Choose which practice location to keep before switching to a single-practice license.");
                        }
                        for (UUID other : practiceIds) {
                            if (other.equals(keep)) {
                                continue;
                            }
                            for (String table : new String[] {"accounts", "registration_codes"}) {
                                try (PreparedStatement statement = connection.prepareStatement(
                                        "UPDATE " + table + " SET practice_id = ? WHERE practice_id = ?")) {
                                    statement.setObject(1, keep);
                                    statement.setObject(2, other);
                                    statement.executeUpdate();
                                }
                            }
                            try (PreparedStatement statement = connection.prepareStatement(
                                    "DELETE FROM practices WHERE id = ?")) {
                                statement.setObject(1, other);
                                statement.executeUpdate();
                            }
                        }
                    }
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE practice_groups SET practice_setup = ? WHERE id = ?")) {
                    statement.setString(1, setup);
                    statement.setObject(2, groupId);
                    statement.executeUpdate();
                }
                connection.commit();
                return Response.ok(Map.of("id", groupId.toString(), "practiceSetup", setup)).build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                throw exception;
            }
        } catch (SQLException exception) {
            LOG.error("Could not update the practice group license.", exception);
            return Response.serverError()
                    .entity(Map.of("message", "The practice license could not be updated."))
                    .build();
        }
    }

    @GET
    @Path("/{groupId}/practices")
    public Response listLocations(@PathParam("groupId") String groupIdValue) {
        UUID groupId = parseId(groupIdValue);
        if (groupId == null) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice group.");
        }
        String query = """
                SELECT p.id, p.name, COUNT(a.id) AS account_count
                FROM practices p LEFT JOIN accounts a ON a.practice_id = p.id
                WHERE p.practice_group_id = ?
                GROUP BY p.id, p.name, p.created_at
                ORDER BY p.created_at
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(query)) {
            statement.setObject(1, groupId);
            try (ResultSet result = statement.executeQuery()) {
                List<PracticeLocation> locations = new ArrayList<>();
                while (result.next()) {
                    locations.add(new PracticeLocation(
                            result.getObject("id", UUID.class).toString(),
                            result.getString("name"),
                            result.getLong("account_count")));
                }
                return Response.ok(locations).build();
            }
        } catch (SQLException exception) {
            LOG.error("Could not load practice locations.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Practice locations could not be loaded.");
        }
    }

    public record PracticeLocation(String id, String name, long accountCount) {
    }

    @GET
    @Path("/{groupId}/codes")
    public Response listCodes(@PathParam("groupId") String groupIdValue) {
        UUID groupId = parseId(groupIdValue);
        if (groupId == null) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice group.");
        }
        String query = """
                SELECT rc.invite_id, rc.account_type, rc.practice_manager, rc.invite_email, rc.code_encrypted,
                       rc.employer_email, rc.issued_by, rc.created_at, rc.expires_at, rc.used_at,
                       rc.redeemed_by, rc.revoked_at, rc.revoked_by, p.name AS practice_name,
                       CASE WHEN rc.revoked_at IS NOT NULL THEN 'REVOKED'
                            WHEN rc.used_at IS NOT NULL THEN 'USED'
                            WHEN rc.expires_at IS NOT NULL AND rc.expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
                            ELSE 'ACTIVE' END AS status
                FROM registration_codes rc
                LEFT JOIN practices p ON p.id = rc.practice_id
                WHERE rc.is_bootstrap = FALSE
                  AND (rc.practice_group_id = ?
                       OR (rc.account_type = 'EMPLOYER' AND rc.redeemed_by IN (
                            SELECT username FROM accounts
                            WHERE practice_group_id = ? AND account_type = 'EMPLOYER')))
                ORDER BY rc.created_at DESC
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(query)) {
            statement.setObject(1, groupId);
            statement.setObject(2, groupId);
            try (ResultSet result = statement.executeQuery()) {
                List<PracticeCode> codes = new ArrayList<>();
                while (result.next()) {
                    String accountType = result.getString("account_type");
                    String kind = accountType.equals("EMPLOYER")
                            ? "EMPLOYER_INVITATION"
                            : result.getBoolean("practice_manager") ? "MANAGER_CODE" : "EMPLOYEE_CODE";
                    String status = result.getString("status");
                    codes.add(new PracticeCode(
                            result.getObject("invite_id", UUID.class).toString(),
                            kind,
                            result.getString("practice_name"),
                            accountType.equals("EMPLOYER")
                                    ? result.getString("employer_email")
                                    : result.getString("invite_email"),
                            result.getString("issued_by"),
                            result.getTimestamp("created_at").toInstant(),
                            toInstant(result.getTimestamp("expires_at")),
                            toInstant(result.getTimestamp("used_at")),
                            result.getString("redeemed_by"),
                            toInstant(result.getTimestamp("revoked_at")),
                            status,
                            codeVault.decrypt(result.getString("code_encrypted")),
                            !accountType.equals("EMPLOYER") && !status.equals("REVOKED"),
                            result.getString("code_encrypted") != null
                                    && status.equals("ACTIVE")
                                    && (accountType.equals("EMPLOYER")
                                            ? result.getString("employer_email") != null
                                            : result.getString("invite_email") != null)));
                }
                return Response.ok(codes).build();
            }
        } catch (SQLException exception) {
            LOG.error("Could not load registration codes for the administrator.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Shared codes could not be loaded.");
        }
    }

    @POST
    @Path("/{groupId}/codes/{inviteId}/reset")
    public Response resetCode(
            @PathParam("groupId") String groupIdValue,
            @PathParam("inviteId") String inviteIdValue) {
        UUID groupId = parseId(groupIdValue);
        UUID inviteId = parseId(inviteIdValue);
        if (groupId == null || inviteId == null) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid code to reset.");
        }
        String admin = identity.getPrincipal().getName();
        String code = RegistrationCodeSupport.generateCode();
        Instant expiresAt = Instant.now().plus(7, ChronoUnit.DAYS);

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                UUID practiceId;
                boolean practiceManager;
                String inviteEmail;
                String jobRole;
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT practice_id, practice_manager, invite_email, job_role FROM registration_codes "
                                + "WHERE invite_id = ? AND practice_group_id = ? AND account_type = 'EMPLOYEE' "
                                + "FOR UPDATE")) {
                    statement.setObject(1, inviteId);
                    statement.setObject(2, groupId);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) {
                            connection.rollback();
                            return error(Response.Status.CONFLICT,
                                    "Only employee or manager codes can be reset.");
                        }
                        practiceId = result.getObject("practice_id", UUID.class);
                        practiceManager = result.getBoolean("practice_manager");
                        inviteEmail = result.getString("invite_email");
                        jobRole = result.getString("job_role");
                    }
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, "
                                + "revoked_by = ? WHERE invite_id = ? AND used_at IS NULL AND revoked_at IS NULL")) {
                    statement.setString(1, admin);
                    statement.setObject(2, inviteId);
                    statement.executeUpdate();
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO registration_codes "
                                + "(code_hash, code_encrypted, account_type, practice_group_id, practice_id, issued_by, "
                                + "expires_at, practice_manager, invite_email, job_role) "
                                + "VALUES (?, ?, 'EMPLOYEE', ?, ?, ?, ?, ?, ?, ?)")) {
                    statement.setString(1, RegistrationCodeSupport.hash(code));
                    statement.setString(2, codeVault.encrypt(code));
                    statement.setObject(3, groupId);
                    statement.setObject(4, practiceId);
                    statement.setString(5, admin);
                    statement.setTimestamp(6, Timestamp.from(expiresAt));
                    statement.setBoolean(7, practiceManager);
                    statement.setString(8, inviteEmail);
                    statement.setString(9, jobRole);
                    statement.executeUpdate();
                }
                connection.commit();
                boolean emailed = inviteEmail != null && sendCodeEmail(inviteEmail, code, expiresAt);
                return Response.ok(new ResetCodeResponse(code, expiresAt.toString(), inviteEmail, emailed)).build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                throw exception;
            }
        } catch (SQLException exception) {
            LOG.error("Could not reset the registration code.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The code could not be reset.");
        }
    }

    @POST
    @Path("/{groupId}/codes/{inviteId}/resend")
    public Response resendCode(
            @PathParam("groupId") String groupIdValue,
            @PathParam("inviteId") String inviteIdValue) {
        UUID groupId = parseId(groupIdValue);
        UUID inviteId = parseId(inviteIdValue);
        if (groupId == null || inviteId == null) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid code to resend.");
        }
        String query = """
                SELECT rc.code_encrypted, rc.expires_at, COALESCE(rc.invite_email, rc.employer_email) AS email
                FROM registration_codes rc
                WHERE rc.invite_id = ? AND rc.is_bootstrap = FALSE AND rc.used_at IS NULL
                  AND rc.revoked_at IS NULL AND rc.expires_at > CURRENT_TIMESTAMP
                  AND (rc.practice_group_id = ? OR (rc.account_type = 'EMPLOYER' AND rc.redeemed_by IN (
                        SELECT username FROM accounts WHERE practice_group_id = ? AND account_type = 'EMPLOYER')))
                """;
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(query)) {
            statement.setObject(1, inviteId);
            statement.setObject(2, groupId);
            statement.setObject(3, groupId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return error(Response.Status.CONFLICT, "Only active, unused codes can be resent.");
                }
                String code = codeVault.decrypt(result.getString("code_encrypted"));
                String email = result.getString("email");
                if (code == null || email == null) {
                    return error(Response.Status.CONFLICT,
                            "This code has no stored text or recipient email. Reset it to issue a new one.");
                }
                if (!sendCodeEmail(email, code, result.getTimestamp("expires_at").toInstant())) {
                    return error(Response.Status.BAD_GATEWAY, "The email could not be sent.");
                }
                return Response.ok(Map.of("recipientEmail", email)).build();
            }
        } catch (SQLException exception) {
            LOG.error("Could not resend the registration code.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The code could not be resent.");
        }
    }

    private boolean sendCodeEmail(String email, String code, Instant expiresAt) {
        try {
            mailer.send(Mail.withText(
                    email,
                    "Your Den Suite registration code",
                    "Your Den Suite registration code is:\n" + code
                            + "\n\nRegister at " + publicWebUrl
                            + " using this code and this email address. It expires on " + expiresAt
                            + ".\n\nIf you were not expecting this email, you can ignore it."));
            return true;
        } catch (RuntimeException exception) {
            LOG.error("Could not email the registration code.", exception);
            return false;
        }
    }

    private static UUID parseId(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static Response error(Response.Status status, String message) {
        return Response.status(status).entity(Map.of("message", message)).build();
    }

    private static void rollback(Connection connection, Exception exception) {
        try {
            connection.rollback();
        } catch (SQLException rollbackException) {
            exception.addSuppressed(rollbackException);
        }
    }

    public record UpdateLicenseRequest(String practiceSetup, String keepPracticeId) {
    }

    public record PracticeCode(
            String id,
            String kind,
            String practiceName,
            String recipientEmail,
            String issuedBy,
            Instant createdAt,
            Instant expiresAt,
            Instant usedAt,
            String redeemedBy,
            Instant revokedAt,
            String status,
            String code,
            boolean canReset,
            boolean canResend) {
    }

    public record ResetCodeResponse(String code, String expiresAt, String recipientEmail, boolean emailed) {
    }

    public record OnboardedPracticeGroup(
            String id,
            String name,
            String practiceSetup,
            String employerUsername,
            String employerEmail,
            long practiceCount,
            long accountCount,
            Instant profileCreatedAt,
            String status) {
    }
}
