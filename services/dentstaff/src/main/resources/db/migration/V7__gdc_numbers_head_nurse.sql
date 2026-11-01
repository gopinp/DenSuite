ALTER TABLE accounts ADD COLUMN gdc_number VARCHAR(20);

CREATE UNIQUE INDEX uq_accounts_head_nurse_per_practice
    ON accounts (practice_id)
    WHERE job_role = 'HEAD_NURSE';
