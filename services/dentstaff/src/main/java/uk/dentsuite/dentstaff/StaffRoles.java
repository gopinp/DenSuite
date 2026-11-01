package uk.dentsuite.dentstaff;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Employee job roles, GDC registration number rules and the one-head-nurse-per-practice rule. */
final class StaffRoles {

    static final Set<String> EMPLOYEE_ROLES =
            Set.of("DENTIST", "DENTAL_NURSE", "HEAD_NURSE", "DENTAL_RECEPTIONIST");

    private static final Pattern GDC_PATTERN = Pattern.compile("\\d{5,6}");

    private StaffRoles() {
    }

    static boolean requiresGdc(String jobRole) {
        return "DENTIST".equals(jobRole) || "DENTAL_NURSE".equals(jobRole) || "HEAD_NURSE".equals(jobRole);
    }

    /** Returns the trimmed number, or throws when it is missing/invalid for a role that needs one. */
    static String cleanGdc(String jobRole, String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            if (requiresGdc(jobRole)) {
                throw new IllegalArgumentException(
                        "Enter your GDC registration number. It is required for dentists and dental nurses.");
            }
            return null;
        }
        if (!GDC_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Your GDC registration number must be 5 or 6 digits.");
        }
        return trimmed;
    }

    /** True when the practice already has a head nurse or an open invitation for one. */
    static boolean headNurseExists(Connection connection, UUID practiceId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT EXISTS (SELECT 1 FROM accounts WHERE practice_id = ? AND job_role = 'HEAD_NURSE') "
                        + "OR EXISTS (SELECT 1 FROM registration_codes WHERE practice_id = ? "
                        + "AND job_role = 'HEAD_NURSE' AND active = TRUE AND used_at IS NULL "
                        + "AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP))")) {
            statement.setObject(1, practiceId);
            statement.setObject(2, practiceId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }
}
