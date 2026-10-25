package uk.dentsuite.dentstaff;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/** Encrypts registration codes at rest so administrators can view them later. */
@ApplicationScoped
public class CodeVault {
    private static final Logger LOG = Logger.getLogger(CodeVault.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    @ConfigProperty(name = "dentsuite.registration.code-encryption-key", defaultValue = "")
    String encodedKey;

    String encrypt(String code) {
        SecretKeySpec key = key();
        if (key == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(code.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException exception) {
            LOG.error("Could not encrypt a registration code.", exception);
            return null;
        }
    }

    String decrypt(String stored) {
        SecretKeySpec key = key();
        if (key == null || stored == null) {
            return null;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, combined, 0, IV_BYTES));
            byte[] plain = cipher.doFinal(combined, IV_BYTES, combined.length - IV_BYTES);
            return new String(plain, java.nio.charset.StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            LOG.warn("A stored registration code could not be decrypted (wrong key?).");
            return null;
        }
    }

    private SecretKeySpec key() {
        if (encodedKey == null || encodedKey.isBlank()) {
            return null;
        }
        byte[] bytes = Base64.getDecoder().decode(encodedKey.trim());
        if (bytes.length != 32) {
            LOG.error("CODE_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
            return null;
        }
        return new SecretKeySpec(bytes, "AES");
    }
}
