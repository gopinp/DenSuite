package uk.dentsuite.dentstaff;

import io.quarkus.runtime.StartupEvent;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import io.quarkus.security.identity.SecurityIdentity;
import org.eclipse.microprofile.jwt.JsonWebToken;

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
import java.util.UUID;
import java.util.regex.Pattern;

@ApplicationScoped
@Path("/api/v1/accounts")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AccountRegistrationResource {
    private static final Logger LOG = Logger.getLogger(AccountRegistrationResource.class);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("[a-zA-Z0-9._-]{3,80}");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$");
    private static final java.util.Set<String> EMPLOYEE_JOB_ROLES =
            java.util.Set.of("DENTIST", "DENTAL_NURSE", "DENTAL_RECEPTIONIST");
    private static final Pattern PRACTICE_NAME_PATTERN = Pattern.compile("[^\\p{Cntrl}]{2,160}");
    private static final Pattern ADDRESS_TEXT_PATTERN = Pattern.compile("[^\\p{Cntrl}]{1,160}");

    @Inject
    DataSource dataSource;

    @Inject
    KeycloakAdminClient keycloakAdminClient;

    @Inject
    SecurityIdentity identity;

    @Inject
    JsonWebToken accessToken;

    @Inject
    CodeVault codeVault;

    @ConfigProperty(name = "dentsuite.registration.employer-code", defaultValue = "")
    String employerCode;

    void seedEmployerCode(@Observes StartupEvent event) {
        try (Connection connection = dataSource.getConnection()) {
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE registration_codes SET active = FALSE "
                            + "WHERE account_type = 'EMPLOYER' AND is_bootstrap = TRUE")) {
                statement.executeUpdate();
            }
            if (employerCode == null || employerCode.isBlank()) {
                return;
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO registration_codes (code_hash, account_type, is_bootstrap, active) "
                            + "VALUES (?, 'EMPLOYER', TRUE, TRUE) "
                            + "ON CONFLICT (code_hash) DO UPDATE SET "
                            + "active = CASE WHEN registration_codes.used_at IS NULL THEN TRUE ELSE FALSE END")) {
                statement.setString(1, RegistrationCodeSupport.hash(employerCode));
                statement.executeUpdate();
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not initialize the employer registration code.", exception);
        }
    }

    @POST
    @Path("/register")
    public Response register(RegisterRequest request) {
        if (request == null || request.username() == null || request.email() == null
                || request.password() == null || request.joinCode() == null || request.accountType() == null) {
            return error(Response.Status.BAD_REQUEST, "Complete all required fields.");
        }

        String username = request.username().trim().toLowerCase(Locale.ROOT);
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        String accountType = request.accountType().trim().toUpperCase(Locale.ROOT);
        String joinCode = request.joinCode().trim();
        String firstName = request.firstName() == null ? "" : request.firstName().trim();
        String lastName = request.lastName() == null ? "" : request.lastName().trim();
        if (firstName.isEmpty() || firstName.length() > 80 || lastName.isEmpty() || lastName.length() > 80) {
            return error(Response.Status.BAD_REQUEST, "Enter your first name and last name.");
        }
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            return error(Response.Status.BAD_REQUEST,
                    "Username must be 3–80 characters and use letters, numbers, dots, underscores, or hyphens.");
        }
        if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid email address.");
        }
        if (request.password().length() < 12 || request.password().length() > 128) {
            return error(Response.Status.BAD_REQUEST, "Password must be between 12 and 128 characters.");
        }
        if (joinCode.length() < 6 || joinCode.length() > 200) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid registration code.");
        }
        if (!accountType.equals("EMPLOYER") && !accountType.equals("EMPLOYEE")) {
            return error(Response.Status.BAD_REQUEST, "Choose employer or employee registration.");
        }

        String createdKeycloakUserId = null;
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                RegistrationCode code = lockRegistrationCode(connection, RegistrationCodeSupport.hash(joinCode));
                if (code == null || !code.accountType().equals(accountType)) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST, "This registration code is invalid, expired, or already used.");
                }
                if (accountType.equals("EMPLOYER")
                        && code.employerEmail() != null
                        && !email.equals(code.employerEmail())) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST, "This owner invitation is tied to a different email.");
                }
                if (accountType.equals("EMPLOYEE")
                        && code.inviteEmail() != null
                        && !email.equals(code.inviteEmail())) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST,
                            "This practice manager code is tied to a different email address.");
                }
                if (accountExists(connection, username, email)) {
                    connection.rollback();
                    return error(Response.Status.CONFLICT, "That username or email address is already registered.");
                }

                UUID groupId;
                UUID practiceId = null;
                if (accountType.equals("EMPLOYER")) {
                    groupId = UUID.randomUUID();
                    String groupName = code.organizationName() == null || code.organizationName().isBlank()
                            ? username + " Practice Group"
                            : code.organizationName();
                    String practiceSetup = code.practiceSetup() == null ? "SINGLE" : code.practiceSetup();
                    createPracticeGroup(connection, groupId, groupName, practiceSetup);
                } else {
                    groupId = code.practiceGroupId();
                    practiceId = code.practiceId();
                    practiceName(connection, groupId, practiceId);
                    if (code.employeeNumber() != null
                            && EmployeeNumbers.usedByAccount(connection, groupId, code.employeeNumber())) {
                        connection.rollback();
                        return error(Response.Status.CONFLICT,
                                "The employee number on this code is already in use. Ask for a new code.");
                    }
                }

                createdKeycloakUserId = keycloakAdminClient.createUser(
                        username,
                        email,
                        firstName,
                        lastName,
                        request.password(),
                        accountType,
                        accountType.equals("EMPLOYEE") && code.practiceManager());
                saveAccount(
                        connection,
                        UUID.randomUUID(),
                        createdKeycloakUserId,
                        username,
                        email,
                        accountType,
                        groupId,
                        practiceId,
                        accountType.equals("EMPLOYEE") ? code.jobRole() : null,
                        accountType.equals("EMPLOYEE") ? code.employeeNumber() : null);
                consumeCode(connection, RegistrationCodeSupport.hash(joinCode), username);
                connection.commit();

                return Response.status(Response.Status.CREATED)
                        .entity(Map.of(
                                "username", username,
                                "email", email,
                                "accountType", accountType,
                                "message", "Account created. You can now sign in."))
                        .build();
            } catch (KeycloakAdminClient.KeycloakException exception) {
                rollback(connection, exception);
                deleteCreatedUser(createdKeycloakUserId, exception);
                if (exception.status() == 409) {
                    return error(Response.Status.CONFLICT, "That username or email address is already registered.");
                }
                LOG.error("Keycloak account registration failed.", exception);
                return Response.status(exception.status())
                        .entity(Map.of("message", exception.getMessage()))
                        .build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                deleteCreatedUser(createdKeycloakUserId, exception);
                if ("23505".equals(exception.getSQLState())) {
                    return error(Response.Status.CONFLICT, "That username or email address is already registered.");
                }
                LOG.error("Could not persist account registration.", exception);
                return error(Response.Status.INTERNAL_SERVER_ERROR, "Account registration could not be completed.");
            }
        } catch (SQLException exception) {
            LOG.error("Account registration database operation failed.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Account registration is temporarily unavailable.");
        }
    }

    @GET
    @Path("/practices")
    @RolesAllowed({"EMPLOYER", "PRACTICE_MANAGER"})
    public Response getPractices() {
        try (Connection connection = dataSource.getConnection()) {
            Account account = findAccount(connection);
            if (account == null) {
                return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
            }
            String setup;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT practice_setup FROM practice_groups WHERE id = ?")) {
                statement.setObject(1, account.practiceGroupId());
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        return error(Response.Status.FORBIDDEN, "Your practice group could not be found.");
                    }
                    setup = result.getString("practice_setup");
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT p.id, p.name, p.address_line1, p.address_line2, p.city, p.region, "
                            + "p.postcode, p.country, pg.practice_setup, p.employee_number_prefix, "
                            + "p.employee_number_separator, p.employee_number_digits, p.next_employee_number "
                            + "FROM practices p JOIN practice_groups pg ON pg.id = p.practice_group_id "
                            + "WHERE p.practice_group_id = ? AND (? IS NULL OR p.id = ?) ORDER BY p.name")) {
                UUID onlyPractice = account.accountType().equals("EMPLOYER") ? null : account.practiceId();
                statement.setObject(1, account.practiceGroupId());
                statement.setObject(2, onlyPractice);
                statement.setObject(3, onlyPractice);
                try (ResultSet result = statement.executeQuery()) {
                    List<PracticeSummary> practices = new ArrayList<>();
                    while (result.next()) {
                        EmployeeNumbers.Format format = new EmployeeNumbers.Format(
                                result.getString("employee_number_prefix"),
                                result.getString("employee_number_separator"),
                                result.getInt("employee_number_digits"),
                                result.getInt("next_employee_number"));
                        practices.add(new PracticeSummary(
                                result.getObject("id", UUID.class).toString(),
                                result.getString("name"),
                                result.getString("address_line1"),
                                result.getString("address_line2"),
                                result.getString("city"),
                                result.getString("region"),
                                result.getString("postcode"),
                                result.getString("country"),
                                result.getString("practice_setup"),
                                format.prefix(),
                                format.separator(),
                                format.digits(),
                                EmployeeNumbers.nextAvailable(connection, account.practiceGroupId(), format)
                                        .number()));
                    }
                    return Response.ok(new PracticeListResponse(setup, practices)).build();
                }
            }
        } catch (SQLException exception) {
            LOG.error("Could not load practices for the signed-in account.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "Practices could not be loaded.");
        }
    }

    @POST
    @Path("/practices")
    @RolesAllowed("EMPLOYER")
    public Response addPractice(AddPracticeRequest request) {
        Response validationError = validatePracticeDetails(request);
        if (validationError != null) return validationError;
        String formatError = EmployeeNumbers.validateFormat(
                request.employeeNumberPrefix(), request.employeeNumberSeparator(), request.employeeNumberDigits());
        if (formatError != null) return error(Response.Status.BAD_REQUEST, formatError);
        String ownerNumber;
        try {
            ownerNumber = EmployeeNumbers.cleanCustom(request.ownerEmployeeNumber());
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, exception.getMessage());
        }
        String name = request.name().trim();

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            Account account = findAccount(connection);
            if (account == null) {
                connection.rollback();
                return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
            }
            String license;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT practice_setup FROM practice_groups WHERE id = ? FOR UPDATE")) {
                statement.setObject(1, account.practiceGroupId());
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        connection.rollback();
                        return error(Response.Status.FORBIDDEN, "Your practice group could not be found.");
                    }
                    license = result.getString("practice_setup");
                    if (!"MULTIPLE".equals(license)) {
                        try (PreparedStatement countStatement = connection.prepareStatement(
                                "SELECT COUNT(*) FROM practices WHERE practice_group_id = ?")) {
                            countStatement.setObject(1, account.practiceGroupId());
                            try (ResultSet countResult = countStatement.executeQuery()) {
                                countResult.next();
                                if (countResult.getLong(1) >= 1) {
                                    connection.rollback();
                                    return error(Response.Status.FORBIDDEN,
                                            "Your single-practice license allows one location.");
                                }
                            }
                        }
                    }
                }
            }
            UUID practiceId = UUID.randomUUID();
            try {
                createPractice(connection, practiceId, account.practiceGroupId(), name);
                savePracticeAddress(connection, practiceId, request);
                String prefix = request.employeeNumberPrefix() == null || request.employeeNumberPrefix().isBlank()
                        ? "EMP" : request.employeeNumberPrefix().trim();
                String separator = request.employeeNumberSeparator() == null ? "-" : request.employeeNumberSeparator();
                int digits = request.employeeNumberDigits() == null ? 4 : request.employeeNumberDigits();
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE practices SET employee_number_prefix = ?, employee_number_separator = ?, "
                                + "employee_number_digits = ? WHERE id = ?")) {
                    statement.setString(1, prefix);
                    statement.setString(2, separator);
                    statement.setInt(3, digits);
                    statement.setObject(4, practiceId);
                    statement.executeUpdate();
                }
                // The owner gets their number when the first practice is set up.
                String assignedOwnerNumber = null;
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT employee_number FROM accounts WHERE keycloak_user_id = ?")) {
                    statement.setString(1, accessToken.getSubject());
                    try (ResultSet result = statement.executeQuery()) {
                        if (result.next() && result.getString(1) == null) {
                            assignedOwnerNumber = "";
                        }
                    }
                }
                if (assignedOwnerNumber != null) {
                    EmployeeNumbers.Format format = EmployeeNumbers.readFormat(connection, practiceId, true);
                    if (ownerNumber != null) {
                        if (EmployeeNumbers.isTaken(connection, account.practiceGroupId(), ownerNumber)) {
                            connection.rollback();
                            return error(Response.Status.CONFLICT, "That employee number is already in use.");
                        }
                        assignedOwnerNumber = ownerNumber;
                    } else {
                        EmployeeNumbers.Allocation allocation =
                                EmployeeNumbers.nextAvailable(connection, account.practiceGroupId(), format);
                        assignedOwnerNumber = allocation.number();
                        EmployeeNumbers.saveNextCounter(connection, practiceId, allocation.nextCounter());
                    }
                    try (PreparedStatement statement = connection.prepareStatement(
                            "UPDATE accounts SET employee_number = ? WHERE keycloak_user_id = ?")) {
                        statement.setString(1, assignedOwnerNumber);
                        statement.setString(2, accessToken.getSubject());
                        statement.executeUpdate();
                    }
                }
                EmployeeNumbers.Format saved = EmployeeNumbers.readFormat(connection, practiceId, false);
                String preview = EmployeeNumbers.nextAvailable(connection, account.practiceGroupId(), saved).number();
                connection.commit();
                return Response.status(Response.Status.CREATED)
                        .entity(new PracticeSummary(
                                practiceId.toString(), name, request.addressLine1().trim(),
                                request.addressLine2(), request.city().trim(), request.region(),
                                request.postcode().trim(), request.country().trim(), license,
                                saved.prefix(), saved.separator(), saved.digits(), preview))
                        .build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                if ("23505".equals(exception.getSQLState())) {
                    return error(Response.Status.CONFLICT, "A practice with that name already exists in this group.");
                }
                throw exception;
            }
        } catch (SQLException exception) {
            LOG.error("Could not add a practice to the signed-in employer's group.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The practice could not be added.");
        }
    }

    @PUT
    @Path("/practices/{practiceId}")
    @RolesAllowed("EMPLOYER")
    public Response updatePractice(
            @PathParam("practiceId") String practiceIdValue,
            AddPracticeRequest request) {
        UUID practiceId;
        try {
            practiceId = UUID.fromString(practiceIdValue);
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice.");
        }
        Response validationError = validatePracticeDetails(request);
        if (validationError != null) return validationError;

        try (Connection connection = dataSource.getConnection()) {
            Account account = findAccount(connection);
            if (account == null) {
                return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE practices SET name = ?, address_line1 = ?, address_line2 = ?, city = ?, "
                            + "region = ?, postcode = ?, country = ? "
                            + "WHERE id = ? AND practice_group_id = ?")) {
                statement.setString(1, request.name().trim());
                statement.setString(2, request.addressLine1().trim());
                statement.setString(3, blankToNull(request.addressLine2()));
                statement.setString(4, request.city().trim());
                statement.setString(5, blankToNull(request.region()));
                statement.setString(6, request.postcode().trim());
                statement.setString(7, request.country().trim());
                statement.setObject(8, practiceId);
                statement.setObject(9, account.practiceGroupId());
                if (statement.executeUpdate() != 1) {
                    return error(Response.Status.NOT_FOUND, "That practice was not found in your group.");
                }
            }
            String formatError = EmployeeNumbers.validateFormat(
                    request.employeeNumberPrefix(), request.employeeNumberSeparator(),
                    request.employeeNumberDigits());
            if (formatError != null) {
                return error(Response.Status.BAD_REQUEST, formatError);
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE practices SET "
                            + "employee_number_prefix = COALESCE(?, employee_number_prefix), "
                            + "employee_number_separator = COALESCE(?, employee_number_separator), "
                            + "employee_number_digits = COALESCE(?, employee_number_digits) "
                            + "WHERE id = ? AND practice_group_id = ?")) {
                String prefix = request.employeeNumberPrefix();
                statement.setString(1, prefix == null || prefix.isBlank() ? null : prefix.trim());
                statement.setString(2, request.employeeNumberSeparator());
                statement.setObject(3, request.employeeNumberDigits());
                statement.setObject(4, practiceId);
                statement.setObject(5, account.practiceGroupId());
                statement.executeUpdate();
            }
            return Response.ok(Map.of("id", practiceId.toString(), "name", request.name().trim())).build();
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) {
                return error(Response.Status.CONFLICT, "A practice with that name already exists in this group.");
            }
            LOG.error("Could not update a practice in the signed-in employer's group.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "The practice could not be updated.");
        }
    }

    private static Response validatePracticeDetails(AddPracticeRequest request) {
        if (request == null || request.name() == null || request.addressLine1() == null
                || request.city() == null || request.postcode() == null || request.country() == null) {
            return error(Response.Status.BAD_REQUEST, "Complete the practice name and address.");
        }
        if (!PRACTICE_NAME_PATTERN.matcher(request.name().trim()).matches()
                || !ADDRESS_TEXT_PATTERN.matcher(request.addressLine1().trim()).matches()
                || !ADDRESS_TEXT_PATTERN.matcher(request.city().trim()).matches()
                || !ADDRESS_TEXT_PATTERN.matcher(request.postcode().trim()).matches()
                || !ADDRESS_TEXT_PATTERN.matcher(request.country().trim()).matches()
                || !validOptionalAddress(request.addressLine2(), 160)
                || !validOptionalAddress(request.region(), 100)
                || request.city().length() > 100
                || request.postcode().length() > 24
                || request.country().length() > 80) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid practice name and address.");
        }
        return null;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @POST
    @Path("/invitations")
    @RolesAllowed({"EMPLOYER", "PRACTICE_MANAGER"})
    public Response createEmployeeInvitation(InvitationRequest request) {
        if (request == null || request.practiceId() == null) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice.");
        }
        boolean practiceManager = Boolean.TRUE.equals(request.practiceManager());
        String rawEmail = request.email() != null ? request.email() : request.managerEmail();
        String managerEmail = rawEmail == null || rawEmail.isBlank()
                ? null
                : rawEmail.trim().toLowerCase(Locale.ROOT);
        String jobRole = request.jobRole() == null ? null : request.jobRole().trim().toUpperCase(Locale.ROOT);
        if (practiceManager) {
            jobRole = "PRACTICE_MANAGER";
        } else if (jobRole == null || !EMPLOYEE_JOB_ROLES.contains(jobRole)) {
            return error(Response.Status.BAD_REQUEST, "Choose Dentist, Dental nurse or Dental receptionist.");
        }
        if (managerEmail == null
                || managerEmail.length() > 254
                || !EMAIL_PATTERN.matcher(managerEmail).matches()) {
            return error(Response.Status.BAD_REQUEST, "Enter a valid email address for the person being invited.");
        }
        UUID practiceId;
        try {
            practiceId = UUID.fromString(request.practiceId());
        } catch (IllegalArgumentException exception) {
            return error(Response.Status.BAD_REQUEST, "Select a valid practice.");
        }

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Account account = findAccount(connection);
                if (account == null) {
                    connection.rollback();
                    return error(Response.Status.FORBIDDEN, "Your Den Suite account could not be found.");
                }
                if (Boolean.TRUE.equals(request.practiceManager())
                        && !account.accountType().equals("EMPLOYER")) {
                    connection.rollback();
                    return error(Response.Status.FORBIDDEN,
                            "Only the practice owner can create a practice manager code.");
                }
                String practiceName = practiceNameIfOwned(connection, account.practiceGroupId(), practiceId);
                if (practiceName == null
                        || (!account.accountType().equals("EMPLOYER") && !practiceId.equals(account.practiceId()))) {
                    connection.rollback();
                    return error(Response.Status.FORBIDDEN, "You can only invite employees to your own practice.");
                }

                String customNumber;
                try {
                    customNumber = EmployeeNumbers.cleanCustom(request.employeeNumber());
                } catch (IllegalArgumentException exception) {
                    connection.rollback();
                    return error(Response.Status.BAD_REQUEST, exception.getMessage());
                }
                EmployeeNumbers.Format numberFormat = EmployeeNumbers.readFormat(connection, practiceId, true);
                String employeeNumber;
                if (customNumber != null) {
                    if (EmployeeNumbers.isTaken(connection, account.practiceGroupId(), customNumber)) {
                        connection.rollback();
                        return error(Response.Status.CONFLICT,
                                "That employee number is already in use in your group.");
                    }
                    employeeNumber = customNumber;
                } else {
                    EmployeeNumbers.Allocation allocation =
                            EmployeeNumbers.nextAvailable(connection, account.practiceGroupId(), numberFormat);
                    employeeNumber = allocation.number();
                    EmployeeNumbers.saveNextCounter(connection, practiceId, allocation.nextCounter());
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
                    statement.setObject(3, account.practiceGroupId());
                    statement.setObject(4, practiceId);
                    statement.setString(5, identity.getPrincipal().getName());
                    statement.setTimestamp(6, Timestamp.from(expiresAt));
                    statement.setBoolean(7, practiceManager);
                    statement.setString(8, managerEmail);
                    statement.setString(9, jobRole);
                    statement.setString(10, employeeNumber);
                    statement.executeUpdate();
                }
                connection.commit();
                return Response.status(Response.Status.CREATED)
                        .entity(new InvitationResponse(code, practiceName, expiresAt.toString(), employeeNumber))
                        .build();
            } catch (SQLException exception) {
                rollback(connection, exception);
                LOG.error("Could not create employee invitation.", exception);
                return error(Response.Status.INTERNAL_SERVER_ERROR, "An employee invitation could not be created.");
            }
        } catch (SQLException exception) {
            LOG.error("Could not access account data to create an employee invitation.", exception);
            return error(Response.Status.INTERNAL_SERVER_ERROR, "An employee invitation could not be created.");
        }
    }

    private static RegistrationCode lockRegistrationCode(Connection connection, String codeHash) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT account_type, practice_group_id, practice_id, employer_email, organization_name, "
                        + "practice_setup, practice_manager, invite_email, job_role, employee_number "
                        + "FROM registration_codes "
                        + "WHERE code_hash = ? AND active = TRUE AND used_at IS NULL "
                        + "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) FOR UPDATE")) {
            statement.setString(1, codeHash);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new RegistrationCode(
                        result.getString("account_type"),
                        result.getObject("practice_group_id", UUID.class),
                        result.getObject("practice_id", UUID.class),
                        result.getString("employer_email"),
                        result.getString("organization_name"),
                        result.getString("practice_setup"),
                        result.getBoolean("practice_manager"),
                        result.getString("invite_email"),
                        result.getString("job_role"),
                        result.getString("employee_number"));
            }
        }
    }

    private static boolean accountExists(Connection connection, String username, String email) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM accounts WHERE username = ? OR email = ?")) {
            statement.setString(1, username);
            statement.setString(2, email);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    private static void createPracticeGroup(
            Connection connection,
            UUID groupId,
            String name,
            String setup) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO practice_groups (id, name, practice_setup) VALUES (?, ?, ?)")) {
            statement.setObject(1, groupId);
            statement.setString(2, name);
            statement.setString(3, setup);
            statement.executeUpdate();
        }
    }

    private static void createPractice(
            Connection connection,
            UUID practiceId,
            UUID groupId,
            String name) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO practices (id, practice_group_id, name) VALUES (?, ?, ?)")) {
            statement.setObject(1, practiceId);
            statement.setObject(2, groupId);
            statement.setString(3, name);
            statement.executeUpdate();
        }
    }

    private static boolean validOptionalAddress(String value, int maxLength) {
        return value == null || value.isBlank()
                || value.length() <= maxLength && ADDRESS_TEXT_PATTERN.matcher(value.trim()).matches();
    }

    private static void savePracticeAddress(
            Connection connection, UUID practiceId, AddPracticeRequest request) throws SQLException {
        savePracticeAddress(
                connection, practiceId, request.addressLine1(), request.addressLine2(),
                request.city(), request.region(), request.postcode(), request.country());
    }

    private static void savePracticeAddress(
            Connection connection,
            UUID practiceId,
            String addressLine1,
            String addressLine2,
            String city,
            String region,
            String postcode,
            String country) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE practices SET address_line1 = ?, address_line2 = ?, city = ?, "
                        + "region = ?, postcode = ?, country = ? WHERE id = ?")) {
            statement.setString(1, addressLine1.trim());
            statement.setString(2, addressLine2 == null || addressLine2.isBlank() ? null : addressLine2.trim());
            statement.setString(3, city.trim());
            statement.setString(4, region == null || region.isBlank() ? null : region.trim());
            statement.setString(5, postcode.trim());
            statement.setString(6, country.trim());
            statement.setObject(7, practiceId);
            statement.executeUpdate();
        }
    }

    private static String practiceName(Connection connection, UUID groupId, UUID practiceId) throws SQLException {
        String name = practiceNameIfOwned(connection, groupId, practiceId);
        if (name == null) {
            throw new SQLException("The practice invitation is no longer associated with a practice.");
        }
        return name;
    }

    private static String practiceNameIfOwned(Connection connection, UUID groupId, UUID practiceId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT name FROM practices WHERE id = ? AND practice_group_id = ?")) {
            statement.setObject(1, practiceId);
            statement.setObject(2, groupId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? result.getString("name") : null;
            }
        }
    }

    private static void saveAccount(
            Connection connection,
            UUID id,
            String keycloakUserId,
            String username,
            String email,
            String accountType,
            UUID groupId,
            UUID practiceId,
            String jobRole,
            String employeeNumber) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO accounts "
                        + "(id, keycloak_user_id, username, email, account_type, practice_group_id, practice_id, "
                        + "job_role, employee_number) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            statement.setObject(1, id);
            statement.setString(2, keycloakUserId);
            statement.setString(3, username);
            statement.setString(4, email);
            statement.setString(5, accountType);
            statement.setObject(6, groupId);
            statement.setObject(7, practiceId);
            statement.setString(8, jobRole);
            statement.setString(9, employeeNumber);
        }
    }

    private static void consumeCode(Connection connection, String codeHash, String username) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE registration_codes SET used_at = CURRENT_TIMESTAMP, redeemed_by = ? "
                        + "WHERE code_hash = ? AND active = TRUE AND used_at IS NULL "
                        + "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)")) {
            statement.setString(1, username);
            statement.setString(2, codeHash);
            if (statement.executeUpdate() != 1) {
                throw new SQLException("The registration code has already been used.");
            }
        }
    }

    private Account findAccount(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT practice_group_id, practice_id, account_type FROM accounts WHERE keycloak_user_id = ?")) {
            statement.setString(1, accessToken.getSubject());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new Account(
                        result.getObject("practice_group_id", UUID.class),
                        result.getObject("practice_id", UUID.class),
                        result.getString("account_type"));
            }
        }
    }

    private static void rollback(Connection connection, Exception originalException) {
        try {
            connection.rollback();
        } catch (SQLException rollbackException) {
            originalException.addSuppressed(rollbackException);
        }
    }

    private void deleteCreatedUser(String userId, Exception originalException) {
        if (userId == null) {
            return;
        }
        try {
            keycloakAdminClient.deleteUser(userId);
        } catch (RuntimeException rollbackException) {
            originalException.addSuppressed(rollbackException);
            LOG.error("Could not roll back the Keycloak user after account creation failed.", rollbackException);
        }
    }

    private static Response error(Response.Status status, String message) {
        return Response.status(status).entity(Map.of("message", message)).build();
    }

    public record RegisterRequest(
            String username,
            String firstName,
            String lastName,
            String email,
            String password,
            String joinCode,
            String accountType) {
    }

    public record AddPracticeRequest(
            String name,
            String addressLine1,
            String addressLine2,
            String city,
            String region,
            String postcode,
            String country,
            String employeeNumberPrefix,
            String employeeNumberSeparator,
            Integer employeeNumberDigits,
            String ownerEmployeeNumber) {
    }

    public record InvitationRequest(
            String practiceId,
            Boolean practiceManager,
            String managerEmail,
            String email,
            String jobRole,
            String employeeNumber) {
    }

    public record InvitationResponse(String code, String practiceName, String expiresAt, String employeeNumber) {
    }

    public record PracticeSummary(
            String id,
            String name,
            String addressLine1,
            String addressLine2,
            String city,
            String region,
            String postcode,
            String country,
            String practiceSetup,
            String employeeNumberPrefix,
            String employeeNumberSeparator,
            int employeeNumberDigits,
            String nextEmployeeNumber) {
    }

    public record PracticeListResponse(String practiceSetup, List<PracticeSummary> practices) {
    }

    private record RegistrationCode(
            String accountType,
            UUID practiceGroupId,
            UUID practiceId,
            String employerEmail,
            String organizationName,
            String practiceSetup,
            boolean practiceManager,
            String inviteEmail,
            String jobRole,
            String employeeNumber) {
    }

    private record Account(UUID practiceGroupId, UUID practiceId, String accountType) {
    }
}
