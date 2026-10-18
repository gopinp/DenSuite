ALTER TABLE registration_codes
    ADD COLUMN invite_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN issued_by VARCHAR(80),
    ADD COLUMN redeemed_by VARCHAR(80),
    ADD COLUMN revoked_at TIMESTAMPTZ,
    ADD COLUMN revoked_by VARCHAR(80),
    ADD COLUMN employer_email VARCHAR(254),
    ADD COLUMN organization_name VARCHAR(160),
    ADD COLUMN practice_setup VARCHAR(16);

ALTER TABLE registration_codes
    ADD CONSTRAINT registration_codes_invite_id_unique UNIQUE (invite_id);
