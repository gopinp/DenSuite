package uk.dentsuite.dentstaff;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

final class RegistrationCodeSupport {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private RegistrationCodeSupport() {
    }

    static String generateCode() {
        byte[] randomCode = new byte[32];
        SECURE_RANDOM.nextBytes(randomCode);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomCode);
    }

    static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.trim().toUpperCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }
}
