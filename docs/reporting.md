# Time-entry reporting for Power BI

A denormalized, flat table **`time_entries_report`** (one row per time entry) is
kept in perfect sync with `time_entries` and is the single source for Power BI.

## How it works

- **`time_entries_report`** — wide, analytics-shaped table. Employee name/email are
  denormalized and **snapshotted at entry time**; the activity code is resolved to a
  readable **PT-BR label**; durations are pre-computed as **decimal hours**
  (`net_hours`, `break_hours`, `gross_hours`); date parts (`work_date`, `year`,
  `quarter`, `month`, `month_name`, `iso_week`, `weekday`, `weekday_name`) are derived
  at the **`America/Sao_Paulo`** business timezone so day/month boundaries match the app.
- **`activity_labels`** — `activity_key → label` lookup, seeded from the frontend i18n.
  Add a row when a new activity is introduced; unmapped keys fall back to the raw key.
- **`sync_time_entries_report()` trigger** — an `AFTER INSERT/UPDATE/DELETE` row trigger
  on `time_entries` that upserts/removes the mirrored row. Because it lives on the table,
  **every** write path is covered automatically (timer stop, manual entry, edit,
  employee-delete cascade). The application never writes to the report table.

Defined in `prisma/migrations/20260709000000_time_entries_report/migration.sql`.
The `TimeEntryReport` / `ActivityLabel` Prisma models are **read-only** mirrors for
type-safe reads — do not write to them from app code.

## Connecting Power BI

1. Run `scripts/powerbi-readonly-role.sql` once (as DB owner, over the direct
   connection / port 5432) after setting a strong password. It creates a
   least-privilege `powerbi_reader` role with `SELECT` on the report surface only —
   no access to candidates, users, resumes, or other PII.
2. Power BI Desktop → **Get Data → PostgreSQL database**.
   - Server: the Supabase **direct** host on port **5432** (not the 6543 pooler).
   - Database: `postgres`. Credentials: `powerbi_reader`.
   - **Import** mode; set a scheduled refresh.
3. Load `time_entries_report`. Suggested measures: Total Hours (`SUM(net_hours)`),
   Total Cost (`SUM(cost)`), Headcount (`DISTINCTCOUNT(user_id)`), Entries
   (`SUM(entry_count)`), Avg Rate. Slice by `work_date` / `month_name` / `project` /
   `client` / `activity_label` / `employee_name`.

## Verifying sync

`npx tsx scripts/verify-report-sync.ts` exercises insert/update/delete + a timezone
boundary and asserts row-count parity. It cleans up after itself.

## Notes / edge cases

- **Snapshots:** renaming an employee does not rewrite existing report rows (by design).
- **ISO week:** `iso_week` is the ISO-8601 week number; at year boundaries it may belong
  to the adjacent calendar year while `year` stays the calendar year of `work_date`.
- **Migrations & Power BI both use port 5432** (direct), bypassing the pgBouncer pooler.
