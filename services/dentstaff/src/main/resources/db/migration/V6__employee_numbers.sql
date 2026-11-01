ALTER TABLE practices
    ADD COLUMN employee_number_prefix VARCHAR(10) NOT NULL DEFAULT 'EMP',
    ADD COLUMN employee_number_separator VARCHAR(1) NOT NULL DEFAULT '-',
    ADD COLUMN employee_number_digits SMALLINT NOT NULL DEFAULT 4
        CHECK (employee_number_digits BETWEEN 1 AND 8),
    ADD COLUMN next_employee_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE registration_codes ADD COLUMN employee_number VARCHAR(30);
ALTER TABLE accounts ADD COLUMN employee_number VARCHAR(30);

CREATE UNIQUE INDEX accounts_employee_number_uq
    ON accounts (practice_group_id, UPPER(employee_number))
    WHERE employee_number IS NOT NULL;
