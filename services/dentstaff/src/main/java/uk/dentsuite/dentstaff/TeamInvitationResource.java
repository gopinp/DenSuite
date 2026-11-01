package uk.dentsuite.dentstaff;

import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.jwt.JsonWebToken;
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
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Lets owners and practice managers list, edit, resend and revoke the codes they issued. */
@ApplicationScoped
@Path("/api/v1/accounts/team-invitations")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed({"EMPLOYER", "PRACTICE_MANAGER"})
public class TeamInvitationResource {
    private static final Logger LOG = Logger.getLogger(TeamInvitationResource.class);
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$");
    private static final Set<String> EMPLOYEE_JOB_ROLES = StaffRoles.EMPLOYEE_ROLES;

    @Inject
    DataSource dataSource;

    @Inject
    SecurityIdentity identity;

    @Inject
    JsonWebToken accessToken;

    @Inject
    CodeVault codeVault;

    @Inject
    Mailer mailer;

    @ConfigProperty(name = "dentsuite.public-web-url")
    String publicWebUrl;

    @GET
    public Response list() {
        try (Connection connection = dataSource.getConnection()) {
            Scope scope = findScope(connection);
            if (scope == null) {
                return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
            }
            String query = """
                    SELECT rc.invite_id, rc.practice_manager, rc.invite_email, rc.job_role, rc.employee_number,
                           rc.code_encrypted, rc.issued_by, rc.created_at, rc.expires_at, rc.used_at,
                           rc.redeemed_by, p.name AS practice_name,
                           CASE WHEN rc.revoked_at IS NOT NULL THEN 'REVOKED'
                                WHEN rc.used_at IS NOT NULL THEN 'USED'
                                WHEN rc.expires_at IS NOT NULL AND rc.expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
                                ELSE 'ACTIVE' END AS status
                    FROM registration_codes rc
                    LEFT JOIN practices p ON p.id = rc.practice_id
                    WHERE rc.account_type = 'EMPLOYEE' AND rc.is_bootstrap = FALSE
                      AND rc.practice_group_id = ?
                      AND (CAST(? AS uuid) IS NULL OR (rc.practice_id = CAST(? AS uuid) AND rc.practice_manager = FALSE))
                    ORDER BY rc.created_at DESC
                    """;
            try (PreparedStatement statement = connection.prepareStatement(query)) {
                UUID onlyPractice = scope.owner() ? null : scope.practiceId();
                statement.setObject(1, scope.groupId());
                statement.setObject(2, onlyPractice);
                statement.setObject(3, onlyPractice);
                try (ResultSet result = statement.executeQuery()) {
                    List<TeamInvitation> invitations = new ArrayList<>();
                    while (result.next()) {
                        invitations.add(new TeamInvitation(
                                result.getObject("invite_id", UUID.class).toString(),
                                result.getBoolean("practice_manager") ? "MANAGER_CODE" : "EMPLOYEE_CODE",
                                result.getString("practice_name"),
                                result.getString("invite_email"),
                                result.getString("job_role"),
                                result.getString("employee_number"),
                                result.getString("issued_by"),
                                result.getTimestamp("created_at").toInstant(),
                                toInstant(result.getTimestamp("expires_at")),
                                toInstant(result.getTimestamp("used_at")),
                                result.getString("redeemed_by"),
                                result.getString("status"),
                                codeVault.decrypt(result.getString("code_encrypted"))));
                    }
                    return Response.ok(invitations).build();
                }
            }
        } catch (SQLException exception) {
            LOG.error("Could not list team invitations.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Invitations could not be loaded.");
        }
    }

    /** Replaces an unused code with a new one, optionally changing the email, role or employee number. */
    @PUT
    @Path("/{inviteId}")
    public Response replace(@PathParam("inviteId") String inviteIdValue, UpdateRequest request) {
        UUID inviteId = parseId(inviteIdValue);
        if (inviteId == null) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid invitation.");
        }
        String requestedEmail = request == null || request.email() == null
                ? null : request.email().trim().toLowerCase(Locale.ROOT);
        String requestedRole = request == null || request.jobRole() == null || request.jobRole().isBlank()
                ? null : request.jobRole().trim().toUpperCase(Locale.ROOT);
        String requestedNumber;
        try {
            requestedNumber = EmployeeNumbers.cleanCustom(request == null ? null : request.employeeNumber());
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, exception.getMessage());
        }
        if (requestedEmail != null
                && (requestedEmail.length() > 254 || !EMAIL_PATTERN.matcher(requestedEmail).matches())) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid email address.");
        }

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Scope scope = findScope(connection);
                if (scope == null) {
                    connection.rollback();
                    return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
                }
                Existing existing = lockOwned(connection, scope, inviteId);
                if (existing == null) {
                    connection.rollback();
                    return error(Response.Status.NOT_FOUND, "That invitation was not found.");
                }
                if (existing.used()) {
                    connection.rollback();
                    return error(Response.Status.CONFLICT, "This code has already been used.");
                }

                String email = requestedEmail != null ? requestedEmail : existing.email();
                if (email == null) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST, "Enter the email address for this invitation.");
                }
                String jobRole = existing.practiceManager() ? "PRACTICE_MANAGER"
                        : requestedRole != null ? requestedRole : existing.jobRole();
                if (!existing.practiceManager() && !EMPLOYEE_JOB_ROLES.contains(jobRole)) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST,
                            "Choose Dentist, Dental nurse or Dental receptionist.");
                }

                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, "
                                + "revoked_by = ? WHERE invite_id = ? AND used_at IS NULL AND revoked_at IS NULL")) {
                    statement.setString(1, identity.getPrincipal().getName());
                    statement.setObject(2, inviteId);
                    statement.executeUpdate();
                }

                String employeeNumber = requestedNumber != null ? requestedNumber : existing.employeeNumber();
                if (jobRole.equals("HEAD_NURSE") && StaffRoles.headNurseExists(connection, existing.practiceId())) {
                    connection.rollback();
                    return error(Response.Status.CONFLICT,
                            "This practice already has a head nurse (or a pending head nurse invitation).");
                }
                if (employeeNumber != null
                        && EmployeeNumbers.isTaken(connection, scope.groupId(), employeeNumber)) {
                    connection.rollback();
                    return error(Response.Status.CONFLICT,
                            "That employee number is already in use in your group.");
                }
                if (employeeNumber == null) {
                    EmployeeNumbers.Format format =
                            EmployeeNumbers.readFormat(connection, existing.practiceId(), true);
                    EmployeeNumbers.Allocation allocation =
                            EmployeeNumbers.nextAvailable(connection, scope.groupId(), format);
                    employeeNumber = allocation.number();
                    EmployeeNumbers.saveNextCounter(connection, existing.practiceId(), allocation.nextCounter());
                }

                String code = RegistrationCodeSupport.generateCode();
                Instant expiresAt = Instant.now().plus(7, ChronoUnit.DAYS);
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO registration_codes "
                                + "(code_hash, code_encrypted, account_type, practice_group_id, practice_id, issued_by, "
                                + "expires_at, practice_manager, invite_email, job_role, employee_number) "
                                + "VALUES (?, ?, 'EMPLOYEE', ?, ?, ?, ?, ?, ?, ?, ?)")) {
                    statement.setString(1, RegistrationCodeSupport.hash(code));
                    statement.setString(2, codeVault.encrypt(code));
                    statement.setObject(3, scope.groupId());
                    statement.setObject(4, existing.practiceId());
                    statement.setString(5, identity.getPrincipal().getName());
                    statement.setTimestamp(6, Timestamp.from(expiresAt));
                    statement.setBoolean(7, existing.practiceManager());
                    statement.setString(8, email);
                    statement.setString(9, jobRole);
                    statement.setString(10, employeeNumber);
                    statement.executeUpdate();
                }
                connection.commit();
                boolean emailed = sendCodeEmail(email, code, expiresAt);
                return Response.ok(new ReplaceResponse(code, expiresAt.toString(), email, employeeNumber, emailed))
                        .build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                throw exception;
            }
        } catch (SQLException exception) {
            LOG.error("Could not replace the invitation code.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The invitation could not be updated.");
        }
    }

    @POST
    @Path("/{inviteId}/revoke")
    public Response revoke(@PathParam("inviteId") String inviteIdValue) {
        UUID inviteId = parseId(inviteIdValue);
        if (inviteId == null) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid invitation.");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Scope scope = findScope(connection);
                if (scope == null) {
                    connection.rollback();
                    return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
                }
                Existing existing = lockOwned(connection, scope, inviteId);
                if (existing == null) {
                    connection.rollback();
                    return error(Response.Status.NOT_FOUND, "That invitation was not found.");
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, "
                                + "revoked_by = ? WHERE invite_id = ? AND active = TRUE AND used_at IS NULL "
                                + "AND revoked_at IS NULL")) {
                    statement.setString(1, identity.getPrincipal().getName());
                    statement.setObject(2, inviteId);
                    if (statement.executeUpdate() != 1) {
                        connection.rollback();
                        return error(Response.Status.CONFLICT, "This invitation is already used or revoked.");
                    }
                }
                connection.commit();
                return Response.noContent().build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                throw exception;
            }
        } catch (SQLException exception) {
            LOG.error("Could not revoke the invitation.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The invitation could not be revoked.");
        }
    }

    /** Locks the code if the caller may manage it: owners any in their group; managers non-manager codes in their practice. */
    private static Existing lockOwned(Connection connection, Scope scope, UUID inviteId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT practice_id, practice_manager, invite_email, job_role, employee_number, used_at "
                        + "FROM registration_codes WHERE invite_id = ? AND practice_group_id = ? "
                        + "AND account_type = 'EMPLOYEE' AND is_bootstrap = FALSE FOR UPDATE")) {
            statement.setObject(1, inviteId);
            statement.setObject(2, scope.groupId());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                UUID practiceId = result.getObject("practice_id", UUID.class);
                boolean manager = result.getBoolean("practice_manager");
                if (!scope.owner() && (manager || !practiceId.equals(scope.practiceId()))) {
                    return null;
                }
                return new Existing(
                        practiceId, manager, result.getString("invite_email"), result.getString("job_role"),
                        result.getString("employee_number"), result.getTimestamp("used_at") != null);
            }
        }
    }

    private Scope findScope(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT practice_group_id, practice_id, account_type FROM accounts WHERE keycloak_user_id = ?")) {
            statement.setString(1, accessToken.getSubject());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                boolean owner = result.getString("account_type").equals("EMPLOYER");
                UUID practiceId = result.getObject("practice_id", UUID.class);
                if (!owner && practiceId == null) {
                    return null;
                }
                return new Scope(result.getObject("practice_group_id", UUID.class), practiceId, owner);
            }
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

    private static void rollback(Connection connection, Exception original) {
        try {
            connection.rollback();
        } catch (SQLException rollbackException) {
            original.addSuppressed(rollbackException);
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

    public record UpdateRequest(String email, String jobRole, String employeeNumber) {
    }

    public record ReplaceResponse(
            String code, String expiresAt, String email, String employeeNumber, boolean emailed) {
    }

    public record TeamInvitation(
            String id,
            String kind,
            String practiceName,
            String email,
            String jobRole,
            String employeeNumber,
            String issuedBy,
            Instant createdAt,
            Instant expiresAt,
            Instant usedAt,
            String redeemedBy,
            String status,
            String code) {
    }

    private record Scope(UUID groupId, UUID practiceId, boolean owner) {
    }

    private record Existing(
            UUID practiceId,
            boolean practiceManager,
            String email,
            String jobRole,
            String employeeNumber,
            boolean used) {
    }
}
