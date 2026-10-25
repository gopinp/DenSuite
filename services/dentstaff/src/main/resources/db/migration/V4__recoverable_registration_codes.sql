-- AES-GCM encrypted copy of the code so administrators can view codes they have shared.
-- Codes issued before this migration only have a hash and cannot be shown.
ALTER TABLE registration_codes
    ADD COLUMN code_encrypted TEXT;
