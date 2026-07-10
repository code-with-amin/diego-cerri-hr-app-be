-- Reporting pipeline for Power BI: a denormalized, flat `time_entries_report`
-- table (one row per time entry) kept in perfect sync with `time_entries` by a
-- row-level trigger. The application never writes to the report table.
--
-- Date parts are derived at the America/Sao_Paulo business timezone. Stored
-- timestamps are naive `timestamp(3)` written by Prisma in UTC, so we interpret
-- them AT TIME ZONE 'UTC' first, then convert to 'America/Sao_Paulo'.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activity label lookup (seeded from frontend i18n, PT-BR)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "activity_labels" (
    "activity_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "activity_labels_pkey" PRIMARY KEY ("activity_key")
);

INSERT INTO "activity_labels" ("activity_key", "label") VALUES
    ('emp_activity_calculation', 'Cálculo'),
    ('emp_activity_flowchart',   'Fluxograma'),
    ('emp_activity_view',        'Geração de Vistas'),
    ('emp_activity_detailing',   'Detalhamento'),
    ('emp_activity_bom',         'Lista de Materiais'),
    ('emp_activity_scanning',    'Escaneamento'),
    ('emp_activity_bim',         'Modelagem BIM'),
    ('emp_activity_compat',      'Compatibilização'),
    ('emp_activity_docs',        'Documentação Técnica'),
    ('emp_activity_meeting',     'Reunião de Projeto'),
    ('emp_activity_software',    'Desenvolvimento de Software'),
    ('emp_activity_review',      'Revisão de Desenhos'),
    ('emp_activity_planning',    'Planejamento / Cronograma'),
    ('emp_activity_support',     'Suporte Interno');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reporting table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "time_entries_report" (
    "entry_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_name" TEXT,
    "employee_email" TEXT,
    "project" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "entry_type" TEXT,
    "source" TEXT NOT NULL,
    "activity_key" TEXT NOT NULL,
    "activity_label" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "work_date" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "month_name" TEXT NOT NULL,
    "iso_week" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "weekday_name" TEXT NOT NULL,
    "net_hours" DECIMAL(12,4) NOT NULL,
    "break_hours" DECIMAL(12,4) NOT NULL,
    "gross_hours" DECIMAL(12,4) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "entry_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "time_entries_report_pkey" PRIMARY KEY ("entry_id")
);

CREATE INDEX "time_entries_report_work_date_idx" ON "time_entries_report"("work_date");
CREATE INDEX "time_entries_report_user_id_idx" ON "time_entries_report"("user_id");
CREATE INDEX "time_entries_report_project_idx" ON "time_entries_report"("project");
CREATE INDEX "time_entries_report_activity_key_idx" ON "time_entries_report"("activity_key");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sync trigger function
--    INSERT / UPDATE  -> upsert the mirrored, denormalized row
--    DELETE           -> remove the mirrored row
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_time_entries_report() RETURNS trigger AS $$
DECLARE
    v_local     timestamp;   -- started_at in business tz (naive local)
    v_name      text;
    v_email     text;
    v_label     text;
    v_month     integer;
    v_isodow    integer;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM time_entries_report WHERE entry_id = OLD.id;
        RETURN OLD;
    END IF;

    -- Snapshot employee identity at entry time (no back-refresh on rename).
    SELECT u.name, u.email INTO v_name, v_email
    FROM users u WHERE u.id = NEW.user_id;

    -- Readable activity label; fall back to the raw key if unmapped.
    SELECT al.label INTO v_label
    FROM activity_labels al WHERE al.activity_key = NEW.activity_key;

    v_local  := (NEW.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo';
    v_month  := EXTRACT(MONTH FROM v_local)::int;
    v_isodow := EXTRACT(ISODOW FROM v_local)::int;

    INSERT INTO time_entries_report (
        entry_id, user_id, employee_name, employee_email,
        project, client, location, entry_type, source,
        activity_key, activity_label,
        started_at, ended_at, work_date,
        year, quarter, month, month_name, iso_week, weekday, weekday_name,
        net_hours, break_hours, gross_hours, rate, cost, entry_count,
        created_at, updated_at, synced_at
    ) VALUES (
        NEW.id, NEW.user_id, v_name, v_email,
        NEW.project, NEW.client, NEW.location, NEW.entry_type, NEW.source::text,
        NEW.activity_key, COALESCE(v_label, NEW.activity_key),
        NEW.started_at, NEW.ended_at, v_local::date,
        EXTRACT(YEAR FROM v_local)::int,
        EXTRACT(QUARTER FROM v_local)::int,
        v_month,
        CASE v_month
            WHEN 1 THEN 'Janeiro'  WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março'
            WHEN 4 THEN 'Abril'    WHEN 5 THEN 'Maio'      WHEN 6 THEN 'Junho'
            WHEN 7 THEN 'Julho'    WHEN 8 THEN 'Agosto'    WHEN 9 THEN 'Setembro'
            WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' WHEN 12 THEN 'Dezembro'
        END,
        EXTRACT(WEEK FROM v_local)::int,
        v_isodow,
        CASE v_isodow
            WHEN 1 THEN 'Segunda-feira' WHEN 2 THEN 'Terça-feira'
            WHEN 3 THEN 'Quarta-feira'  WHEN 4 THEN 'Quinta-feira'
            WHEN 5 THEN 'Sexta-feira'   WHEN 6 THEN 'Sábado'
            WHEN 7 THEN 'Domingo'
        END,
        round(NEW.net_ms::numeric / 3600000, 4),
        round(NEW.break_ms::numeric / 3600000, 4),
        round((NEW.net_ms + NEW.break_ms)::numeric / 3600000, 4),
        NEW.rate, NEW.cost, 1,
        NEW.created_at, NEW.updated_at, now()
    )
    ON CONFLICT (entry_id) DO UPDATE SET
        user_id        = EXCLUDED.user_id,
        employee_name  = EXCLUDED.employee_name,
        employee_email = EXCLUDED.employee_email,
        project        = EXCLUDED.project,
        client         = EXCLUDED.client,
        location       = EXCLUDED.location,
        entry_type     = EXCLUDED.entry_type,
        source         = EXCLUDED.source,
        activity_key   = EXCLUDED.activity_key,
        activity_label = EXCLUDED.activity_label,
        started_at     = EXCLUDED.started_at,
        ended_at       = EXCLUDED.ended_at,
        work_date      = EXCLUDED.work_date,
        year           = EXCLUDED.year,
        quarter        = EXCLUDED.quarter,
        month          = EXCLUDED.month,
        month_name     = EXCLUDED.month_name,
        iso_week       = EXCLUDED.iso_week,
        weekday        = EXCLUDED.weekday,
        weekday_name   = EXCLUDED.weekday_name,
        net_hours      = EXCLUDED.net_hours,
        break_hours    = EXCLUDED.break_hours,
        gross_hours    = EXCLUDED.gross_hours,
        rate           = EXCLUDED.rate,
        cost           = EXCLUDED.cost,
        updated_at     = EXCLUDED.updated_at,
        synced_at      = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_entries_report_sync
AFTER INSERT OR UPDATE OR DELETE ON "time_entries"
FOR EACH ROW EXECUTE FUNCTION sync_time_entries_report();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill existing rows
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO time_entries_report (
    entry_id, user_id, employee_name, employee_email,
    project, client, location, entry_type, source,
    activity_key, activity_label,
    started_at, ended_at, work_date,
    year, quarter, month, month_name, iso_week, weekday, weekday_name,
    net_hours, break_hours, gross_hours, rate, cost, entry_count,
    created_at, updated_at, synced_at
)
SELECT
    te.id, te.user_id, u.name, u.email,
    te.project, te.client, te.location, te.entry_type, te.source::text,
    te.activity_key, COALESCE(al.label, te.activity_key),
    te.started_at, te.ended_at, loc.local_ts::date,
    EXTRACT(YEAR FROM loc.local_ts)::int,
    EXTRACT(QUARTER FROM loc.local_ts)::int,
    EXTRACT(MONTH FROM loc.local_ts)::int,
    CASE EXTRACT(MONTH FROM loc.local_ts)::int
        WHEN 1 THEN 'Janeiro'  WHEN 2 THEN 'Fevereiro' WHEN 3 THEN 'Março'
        WHEN 4 THEN 'Abril'    WHEN 5 THEN 'Maio'      WHEN 6 THEN 'Junho'
        WHEN 7 THEN 'Julho'    WHEN 8 THEN 'Agosto'    WHEN 9 THEN 'Setembro'
        WHEN 10 THEN 'Outubro' WHEN 11 THEN 'Novembro' WHEN 12 THEN 'Dezembro'
    END,
    EXTRACT(WEEK FROM loc.local_ts)::int,
    EXTRACT(ISODOW FROM loc.local_ts)::int,
    CASE EXTRACT(ISODOW FROM loc.local_ts)::int
        WHEN 1 THEN 'Segunda-feira' WHEN 2 THEN 'Terça-feira'
        WHEN 3 THEN 'Quarta-feira'  WHEN 4 THEN 'Quinta-feira'
        WHEN 5 THEN 'Sexta-feira'   WHEN 6 THEN 'Sábado'
        WHEN 7 THEN 'Domingo'
    END,
    round(te.net_ms::numeric / 3600000, 4),
    round(te.break_ms::numeric / 3600000, 4),
    round((te.net_ms + te.break_ms)::numeric / 3600000, 4),
    te.rate, te.cost, 1,
    te.created_at, te.updated_at, now()
FROM time_entries te
LEFT JOIN users u ON u.id = te.user_id
LEFT JOIN activity_labels al ON al.activity_key = te.activity_key
CROSS JOIN LATERAL (
    SELECT (te.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS local_ts
) loc
ON CONFLICT (entry_id) DO NOTHING;
