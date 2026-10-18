package uk.dentsuite.dentstaff;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
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
import java.time.Instant;
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
                    try (PreparedStatement statement = connection.prepareStatement(
                            "SELECT COUNT(*) FROM practices WHERE practice_group_id = ?")) {
                        statement.setObject(1, groupId);
                        try (ResultSet result = statement.executeQuery()) {
                            result.next();
                            if (result.getLong(1) > 1) {
                                connection.rollback();
                                return error(Response.Status.CONFLICT,
                                        "Remove extra practice locations before changing this group to a single-practice license.");
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

    public record UpdateLicenseRequest(String practiceSetup) {
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
