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
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
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
import java.util.regex.Pattern;

@ApplicationScoped
@Path("/api/v1/admin/employer-invitations")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("DENTSUITE_ADMIN")
public class EmployerInvitationResource {
    private static final Logger LOG = Logger.getLogger(EmployerInvitationResource.class);
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$");
    private static final Pattern ORGANIZATION_NAME_PATTERN = Pattern.compile("[^\\p{Cntrl}]{2,160}");
    private static final int DEFAULT_EXPIRATION_DAYS = 7;
    private static final int MAX_EXPIRATION_DAYS = 30;

    @Inject
    DataSource dataSource;

    @Inject
    SecurityIdentity identity;

    @Inject
    Mailer mailer;

    @ConfigProperty(name = "dentsuite.public-web-url")
    String publicWebUrl;

    @GET
    public Response listInvitations() {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT invite_id, issued_by, created_at, expires_at, used_at, redeemed_by, "
                                + "employer_email, organization_name, practice_setup, "
                                + "revoked_at, revoked_by, "
                                + "CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' "
                                + "WHEN used_at IS NOT NULL THEN 'USED' "
                                + "WHEN expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED' "
                                + "ELSE 'ACTIVE' END AS status "
                                + "FROM registration_codes "
                                + "WHERE account_type = 'EMPLOYER' AND is_bootstrap = FALSE "
                                + "ORDER BY created_at DESC")) {
            try (ResultSet result = statement.executeQuery()) {
                List<EmployerInvitationSummary> invitations = new ArrayList<>();
                while (result.next()) {
                    invitations.add(new EmployerInvitationSummary(
                            result.getObject("invite_id", UUID.class).toString(),
                            result.getString("issued_by"),
                            result.getTimestamp("created_at").toInstant().toString(),
                            result.getTimestamp("expires_at").toInstant().toString(),
                            result.getString("employer_email"),
                            result.getString("organization_name"),
                            result.getString("practice_setup"),
                            toInstant(result.getTimestamp("used_at")),
                            result.getString("redeemed_by"),
                            toInstant(result.getTimestamp("revoked_at")),
                            result.getString("revoked_by"),
                            result.getString("status")));
                }
                return Response.ok(invitations).build();
            }
        } catch (SQLException exception) {
            LOG.error("Could not load employer invitations.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Employer invitations could not be loaded.");
        }
    }

    @POST
    public Response createInvitation(CreateInvitationRequest request) {
        Response validationError = validateRequest(request);
        if (validationError != null) {
            return validationError;
        }
        String email = request.email().trim().toLowerCase(java.util.Locale.ROOT);
        String organizationName = request.organizationName().trim();
        String practiceSetup = request.practiceSetup().trim().toUpperCase(java.util.Locale.ROOT);
        int expirationDays = request.expiresInDays() == null
                ? DEFAULT_EXPIRATION_DAYS
                : request.expiresInDays();

        String code = RegistrationCodeSupport.generateCode();
        UUID invitationId = UUID.randomUUID();
        Instant expiresAt = Instant.now().plus(expirationDays, ChronoUnit.DAYS);
        String issuer = identity.getPrincipal().getName();

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO registration_codes "
                                + "(invite_id, code_hash, account_type, issued_by, expires_at, "
                                + "employer_email, organization_name, practice_setup) "
                                + "VALUES (?, ?, 'EMPLOYER', ?, ?, ?, ?, ?)")) {
            statement.setObject(1, invitationId);
            statement.setString(2, RegistrationCodeSupport.hash(code));
            statement.setString(3, issuer);
            statement.setTimestamp(4, Timestamp.from(expiresAt));
            statement.setString(5, email);
            statement.setString(6, organizationName);
            statement.setString(7, practiceSetup);
            statement.executeUpdate();
        } catch (SQLException exception) {
            LOG.error("Could not create employer invitation.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "An employer invitation could not be created.");
        }

        try {
            sendInvitationEmail(email, organizationName, practiceSetup, code, expiresAt);
            return Response.status(Response.Status.CREATED)
                    .entity(new EmployerInvitationCreated(
                            invitationId.toString(), email, organizationName, practiceSetup, expiresAt.toString(), code))
                    .build();
        } catch (RuntimeException exception) {
            LOG.errorf(exception, "Could not deliver employer invitation %s.", invitationId);
            if (!disableUndeliveredInvitation(invitationId, issuer, exception)) {
                return error(Response.Status.INTERNAL_SERVER_ERROR,
                        "Email delivery failed and the invitation could not be disabled. Contact support.");
            }
            return error(Response.Status.BAD_GATEWAY,
                    "The invitation email could not be sent. The code has been disabled; please try again.");
        }
    }

    @PUT
    @Path("/{invitationId}")
    public Response editInvitation(
            @PathParam("invitationId") String invitationIdValue,
            CreateInvitationRequest request) {
        UUID previousInvitationId;
        try {
            previousInvitationId = UUID.fromString(invitationIdValue);
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid employer invitation.");
        }

        Response validationError = validateRequest(request);
        if (validationError != null) {
            return validationError;
        }

        String email = request.email().trim().toLowerCase(java.util.Locale.ROOT);
        String organizationName = request.organizationName().trim();
        String practiceSetup = request.practiceSetup().trim().toUpperCase(java.util.Locale.ROOT);
        int expirationDays = request.expiresInDays() == null ? DEFAULT_EXPIRATION_DAYS : request.expiresInDays();
        String code = RegistrationCodeSupport.generateCode();
        UUID replacementInvitationId = UUID.randomUUID();
        Instant expiresAt = Instant.now().plus(expirationDays, ChronoUnit.DAYS);
        String issuer = identity.getPrincipal().getName();

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT invite_id FROM registration_codes "
                                + "WHERE invite_id = ? AND account_type = 'EMPLOYER' AND is_bootstrap = FALSE "
                                + "AND active = TRUE AND used_at IS NULL AND revoked_at IS NULL "
                                + "AND expires_at > CURRENT_TIMESTAMP FOR UPDATE")) {
                    statement.setObject(1, previousInvitationId);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) {
                            connection.rollback();
                            return error(Response.Status.CONFLICT,
                                    "Only active, unused employer invitations can be edited.");
                        }
                    }
                }
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, revoked_by = ? "
                                + "WHERE invite_id = ?")) {
                    statement.setString(1, issuer);
                    statement.setObject(2, previousInvitationId);
                    if (statement.executeUpdate() != 1) {
                        connection.rollback();
                        return error(Response.Status.CONFLICT,
                                "This invitation changed while it was being edited. Reload and try again.");
                    }
                }
                insertInvitation(
                        connection, replacementInvitationId, code, issuer, expiresAt,
                        email, organizationName, practiceSetup);
                connection.commit();
            } catch (SQLException exception) {
                rollback(connection, exception);
                LOG.error("Could not replace employer invitation.", exception);
                return error(Response.Status.INTERNAL_SERVER_ERROR, "The employer invitation could not be updated.");
            }
        } catch (SQLException exception) {
            LOG.error("Could not access invitation data while editing.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The employer invitation could not be updated.");
        }

        try {
            sendInvitationEmail(email, organizationName, practiceSetup, code, expiresAt);
            return Response.ok(new EmployerInvitationCreated(
                    replacementInvitationId.toString(),
                    email,
                    organizationName,
                    practiceSetup,
                    expiresAt.toString(),
                    code)).build();
        } catch (RuntimeException exception) {
            LOG.errorf(exception, "Could not deliver replacement employer invitation %s.", replacementInvitationId);
            if (!disableUndeliveredInvitation(replacementInvitationId, issuer, exception)) {
                return error(Response.Status.INTERNAL_SERVER_ERROR,
                        "Email delivery failed and the replacement invitation could not be disabled. Contact support.");
            }
            return error(Response.Status.BAD_GATEWAY,
                    "The updated invitation email could not be sent. The replacement code has been disabled; issue a new invitation.");
        }
    }

    @POST
    @Path("/{invitationId}/revoke")
    public Response revokeInvitation(@PathParam("invitationId") String invitationId) {
        UUID parsedId;
        try {
            parsedId = UUID.fromString(invitationId);
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, "Choose a valid employer invitation.");
        }

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, revoked_by = ? "
                                + "WHERE invite_id = ? AND account_type = 'EMPLOYER' AND is_bootstrap = FALSE "
                                + "AND active = TRUE AND used_at IS NULL AND revoked_at IS NULL "
                                + "AND expires_at > CURRENT_TIMESTAMP")) {
            statement.setString(1, identity.getPrincipal().getName());
            statement.setObject(2, parsedId);
            if (statement.executeUpdate() != 1) {
                return error(Response.Status.CONFLICT,
                        "This invitation is already used, revoked, expired, or unavailable.");
            }
            return Response.noContent().build();
        } catch (SQLException exception) {
            LOG.error("Could not revoke employer invitation.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The employer invitation could not be revoked.");
        }
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static Response validateRequest(CreateInvitationRequest request) {
        if (request == null || request.email() == null || request.organizationName() == null
                || request.practiceSetup() == null) {
            return error(Response.Status.BAD_REQUEST, "Enter the employer email and practice details.");
        }
        String email = request.email().trim().toLowerCase(java.util.Locale.ROOT);
        String organizationName = request.organizationName().trim();
        String practiceSetup = request.practiceSetup().trim().toUpperCase(java.util.Locale.ROOT);
        if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid employer email address.");
        }
        if (!ORGANIZATION_NAME_PATTERN.matcher(organizationName).matches() || organizationName.isBlank()) {
            return error(Response.Status.BAD_REQUEST, "Practice or group name must be between 2 and 160 characters.");
        }
        if (!practiceSetup.equals("SINGLE") && !practiceSetup.equals("MULTIPLE")) {
            return error(Response.Status.BAD_REQUEST, "Choose single or multiple practices.");
        }
        int expirationDays = request.expiresInDays() == null ? DEFAULT_EXPIRATION_DAYS : request.expiresInDays();
        if (expirationDays < 1 || expirationDays > MAX_EXPIRATION_DAYS) {
            return error(Response.Status.BAD_REQUEST, "Choose an expiry between 1 and 30 days.");
        }
        return null;
    }

    private static void insertInvitation(
            Connection connection,
            UUID invitationId,
            String code,
            String issuer,
            Instant expiresAt,
            String email,
            String organizationName,
            String practiceSetup) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO registration_codes "
                        + "(invite_id, code_hash, account_type, issued_by, expires_at, "
                        + "employer_email, organization_name, practice_setup) "
                        + "VALUES (?, ?, 'EMPLOYER', ?, ?, ?, ?, ?)")) {
            statement.setObject(1, invitationId);
            statement.setString(2, RegistrationCodeSupport.hash(code));
            statement.setString(3, issuer);
            statement.setTimestamp(4, Timestamp.from(expiresAt));
            statement.setString(5, email);
            statement.setString(6, organizationName);
            statement.setString(7, practiceSetup);
            statement.executeUpdate();
        }
    }

    private void sendInvitationEmail(
            String email, String organizationName, String practiceSetup, String code, Instant expiresAt) {
        mailer.send(Mail.withText(
                email,
                "Welcome to Den Suite - complete your practice registration",
                "Welcome to Den Suite!\n\n"
                        + "You have been invited to register " + organizationName + " as a "
                        + (practiceSetup.equals("SINGLE") ? "single practice." : "multiple-practice group.")
                        + "\n\nYour one-use employer registration code is:\n"
                        + code
                        + "\n\nRegister at " + publicWebUrl
                        + " and choose Register, then I'm an employer. Create your owner account using this "
                        + "code and this email address. After signing in, add your practice name and address. "
                        + "Your Den Suite license is for "
                        + (practiceSetup.equals("SINGLE") ? "one practice location." : "multiple practice locations.")
                        + " This invitation expires on " + expiresAt
                        + ".\n\nIf you were not expecting this invitation, you can ignore this email."));
    }

    private boolean disableUndeliveredInvitation(UUID invitationId, String issuer, RuntimeException originalException) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "UPDATE registration_codes SET active = FALSE, revoked_at = CURRENT_TIMESTAMP, revoked_by = ? "
                                + "WHERE invite_id = ? AND used_at IS NULL")) {
            statement.setString(1, issuer);
            statement.setObject(2, invitationId);
            statement.executeUpdate();
            return true;
        } catch (SQLException revokeException) {
            originalException.addSuppressed(revokeException);
            LOG.errorf(revokeException, "Could not disable undelivered employer invitation %s.", invitationId);
            return false;
        }
    }

    private static void rollback(Connection connection, SQLException originalException) {
        try {
            connection.rollback();
        } catch (SQLException rollbackException) {
            originalException.addSuppressed(rollbackException);
        }
    }

    private static Response error(Response.Status status, String message) {
        return Response.status(status).entity(Map.of("message", message)).build();
    }

    public record CreateInvitationRequest(
            String email,
            String organizationName,
            String practiceSetup,
            Integer expiresInDays) {
    }

    public record EmployerInvitationCreated(
            String id,
            String email,
            String organizationName,
            String practiceSetup,
            String expiresAt,
            String code) {
    }

    public record EmployerInvitationSummary(
            String id,
            String issuedBy,
            String createdAt,
            String expiresAt,
            String email,
            String organizationName,
            String practiceSetup,
            Instant usedAt,
            String redeemedBy,
            Instant revokedAt,
            String revokedBy,
            String status) {
    }
}
