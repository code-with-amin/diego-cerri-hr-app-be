-- Dedicated least-privilege role for Power BI.
-- Grants SELECT on the reporting surface ONLY — no access to candidates, users,
-- resumes, or any PII. Run once as the DB owner (over DIRECT_URL / port 5432).
-- Replace the password before running; do NOT commit real credentials.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
        CREATE ROLE powerbi_reader LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO powerbi_reader;   -- adjust DB name if needed
GRANT USAGE ON SCHEMA public TO powerbi_reader;

-- Report surface only.
GRANT SELECT ON public.time_entries_report TO powerbi_reader;
GRANT SELECT ON public.activity_labels     TO powerbi_reader;

-- Explicitly ensure no default access leaks to future tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM powerbi_reader;
