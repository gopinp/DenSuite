CREATE TABLE practice_groups (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    practice_setup VARCHAR(16) NOT NULL CHECK (practice_setup IN ('SINGLE', 'MULTIPLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE practices (
    id UUID PRIMARY KEY,
    practice_group_id UUID NOT NULL REFERENCES practice_groups (id),
    name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (practice_group_id, name)
);

CREATE TABLE registration_codes (
    code_hash CHAR(64) PRIMARY KEY,
    account_type VARCHAR(16) NOT NULL CHECK (account_type IN ('EMPLOYER', 'EMPLOYEE')),
    practice_group_id UUID REFERENCES practice_groups (id),
    practice_id UUID REFERENCES practices (id),
    is_bootstrap BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (account_type = 'EMPLOYER' AND practice_group_id IS NULL AND practice_id IS NULL)
        OR
        (account_type = 'EMPLOYEE' AND practice_group_id IS NOT NULL AND practice_id IS NOT NULL)
    )
);

CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    keycloak_user_id VARCHAR(80) NOT NULL UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL UNIQUE,
    account_type VARCHAR(16) NOT NULL CHECK (account_type IN ('EMPLOYER', 'EMPLOYEE')),
    practice_group_id UUID NOT NULL REFERENCES practice_groups (id),
    practice_id UUID NOT NULL REFERENCES practices (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX accounts_practice_group_idx ON accounts (practice_group_id);
CREATE INDEX accounts_practice_idx ON accounts (practice_id);
CREATE INDEX registration_codes_practice_idx ON registration_codes (practice_id)
    WHERE account_type = 'EMPLOYEE';
