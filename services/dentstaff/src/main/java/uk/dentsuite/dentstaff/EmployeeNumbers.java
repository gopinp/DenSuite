package uk.dentsuite.dentstaff;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/** Employee number formats, generation and uniqueness (unique within a practice group). */
final class EmployeeNumbers {
    static final Pattern PREFIX = Pattern.compile("[A-Za-z0-9]{1,10}");
    static final Pattern CUSTOM = Pattern.compile("[A-Za-z0-9._/-]{1,30}");
    private static final String SEPARATORS = "-/._";
    private static final int MAX_SKIPS = 10_000;

    record Format(String prefix, String separator, int digits, int next) {
    }

    record Allocation(String number, int nextCounter) {
    }

    private EmployeeNumbers() {
    }

    static String validateFormat(String prefix, String separator, Integer digits) {
        if (prefix != null && !PREFIX.matcher(prefix.trim()).matches()) {
            return "Employee number prefix must be 1–10 letters or numbers.";
        }
        if (separator != null && !separator.isEmpty()
                && (separator.length() != 1 || SEPARATORS.indexOf(separator.charAt(0)) < 0)) {
            return "Employee number separator must be empty, -, /, . or _.";
        }
        if (digits != null && (digits < 1 || digits > 8)) {
            return "Employee number counter length must be between 1 and 8.";
        }
        return null;
    }

    /** Returns the cleaned custom number, or null when blank. Throws on invalid text. */
    static String cleanCustom(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        if (!CUSTOM.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(
                    "Employee number can use letters, numbers, - / . _ and be up to 30 characters.");
        }
        return trimmed;
    }

    static String render(Format format, int counter) {
        return format.prefix() + format.separator()
                + String.format(Locale.ROOT, "%0" + format.digits() + "d", counter);
    }

    static Format readFormat(Connection connection, UUID practiceId, boolean lock) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT employee_number_prefix, employee_number_separator, employee_number_digits, "
                        + "next_employee_number FROM practices WHERE id = ?" + (lock ? " FOR UPDATE" : ""))) {
            statement.setObject(1, practiceId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new Format(
                        result.getString(1), result.getString(2), result.getInt(3), result.getInt(4));
            }
        }
    }

    /** Finds the next number from the practice counter that nobody in the group is using. */
    static Allocation nextAvailable(Connection connection, UUID groupId, Format format) throws SQLException {
        int counter = format.next();
        for (int i = 0; i < MAX_SKIPS; i++, counter++) {
            String candidate = render(format, counter);
            if (!isTaken(connection, groupId, candidate)) {
                return new Allocation(candidate, counter + 1);
            }
        }
        throw new SQLException("No free employee number could be generated.");
    }

    static void saveNextCounter(Connection connection, UUID practiceId, int next) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE practices SET next_employee_number = ? WHERE id = ?")) {
            statement.setInt(1, next);
            statement.setObject(2, practiceId);
            statement.executeUpdate();
        }
    }

    /** Taken by an account, or reserved by an unused, unexpired registration code. */
    static boolean isTaken(Connection connection, UUID groupId, String number) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM accounts WHERE practice_group_id = ? AND UPPER(employee_number) = UPPER(?) "
                        + "UNION ALL SELECT 1 FROM registration_codes WHERE practice_group_id = ? "
                        + "AND UPPER(employee_number) = UPPER(?) AND active = TRUE AND used_at IS NULL "
                        + "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1")) {
            statement.setObject(1, groupId);
            statement.setString(2, number);
            statement.setObject(3, groupId);
            statement.setString(4, number);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    static boolean usedByAccount(Connection connection, UUID groupId, String number) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM accounts WHERE practice_group_id = ? AND UPPER(employee_number) = UPPER(?)")) {
            statement.setObject(1, groupId);
            statement.setString(2, number);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }
}
