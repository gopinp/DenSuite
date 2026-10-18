ALTER TABLE practices
    ADD COLUMN address_line1 VARCHAR(160),
    ADD COLUMN address_line2 VARCHAR(160),
    ADD COLUMN city VARCHAR(100),
    ADD COLUMN region VARCHAR(100),
    ADD COLUMN postcode VARCHAR(24),
    ADD COLUMN country VARCHAR(80);

ALTER TABLE registration_codes
    ADD COLUMN practice_manager BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN invite_email VARCHAR(254);

ALTER TABLE accounts
    ALTER COLUMN practice_id DROP NOT NULL;
