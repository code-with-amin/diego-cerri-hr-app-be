# diego-cerri-hr-app-be

Backend API for the KPI Engenharia **"Trabalhe Conosco"** HR system: collects candidate
submissions (with PDF resumes), stores them in PostgreSQL + AWS S3, and exposes an
admin-only review workflow (auth, listing, search/filter, status, private notes, resume
access).

## Tech stack

- Node 20+, TypeScript, Express 4
- PostgreSQL via **Prisma ORM**
- AWS S3 for resume files (private bucket, presigned URLs)
- JWT auth (single seeded admin), Zod validation, Helmet, CORS, rate limiting

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   then edit .env — set DATABASE_URL, JWT_SECRET, ADMIN_*, AWS_* / S3_BUCKET, CORS_ORIGIN

# 3. Create the database schema
npm run prisma:migrate      # creates tables + Prisma client

# 4. Seed the single admin account (from ADMIN_EMAIL / ADMIN_PASSWORD)
npm run seed

# 5. Run
npm run dev                 # http://localhost:4000  (watch mode)
```

Build for production: `npm run build && npm start`. Apply migrations in prod with
`npm run prisma:deploy`.

## Environment variables

See [`.env.example`](./.env.example). Required: `DATABASE_URL`, `JWT_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`. `CORS_ORIGIN` is a comma-separated allow-list of
front-end origins (the candidate form + the admin dashboard).

## API

Base path: `/api`. All admin endpoints require `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/health` | – | Liveness probe |
| POST | `/candidates` | public | Submit candidate (multipart/form-data, PDF resume) |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, admin }` |
| GET | `/auth/me` | admin | Current admin |
| GET | `/candidates` | admin | List + search/filter (`q`, `status`, `dateFrom`, `dateTo`, `sort`, `page`, `limit`) |
| GET | `/candidates/:id` | admin | Full profile (includes presigned `resumeUrl`) |
| PATCH | `/candidates/:id/status` | admin | `{ status }` — `NEW \| UNDER_REVIEW \| APPROVED \| REJECTED` |
| GET | `/candidates/:id/resume?disposition=inline\|attachment` | admin | Presigned S3 URL (view/download) |
| GET | `/candidates/:id/notes` | admin | List private notes |
| POST | `/candidates/:id/notes` | admin | `{ body }` — add private note |
| DELETE | `/notes/:noteId` | admin | Delete own note |

### Candidate submission fields

The public form posts Portuguese field keys; they map to DB columns in
`src/modules/candidates/candidates.schema.ts`. Required: `nome`, `email`, `telefone`,
`cidade`, `modalidade[]`, `horasDia`, `viagem`, `areas[]`, `trabalhosExecutados`,
`valorHora`, `consentimento`, and the `curriculo` PDF file. Others are optional.

## Wiring the existing candidate form

In `kpi-trabalhe-conosco/script.js`, replace the `console.log(...)` placeholder
(around the `// Em produção, envie via fetch()` comment) with a real POST:

```js
const API_URL = 'http://localhost:4000'; // your backend origin
const fd = new FormData(form);
const res = await fetch(`${API_URL}/api/candidates`, { method: 'POST', body: fd });
if (!res.ok) throw new Error('Submission failed');
```

The backend origin must be listed in `CORS_ORIGIN`. `FormData` already includes the
`curriculo` file and all field names — no other changes needed.

## Project structure

```
src/
  app.ts, index.ts          # express app + server boot
  config/                   # env (zod), prisma client, s3 client
  middleware/               # auth (JWT), upload (multer), rateLimit, errorHandler
  modules/
    auth/                   # login, me
    candidates/             # create (public), list/get/status (admin), resume
    notes/                  # private HR notes
  utils/                    # asyncHandler, ApiError
prisma/
  schema.prisma, seed.ts
  migrations/               # includes the time_entries_report reporting pipeline
scripts/                    # powerbi-readonly-role.sql, verify-report-sync.ts
docs/                       # reporting.md (Power BI setup)
tests/                      # vitest + supertest smoke tests
```

## Testing

`npm test` runs the smoke tests (health, auth guard, 404) — no DB required. Full
end-to-end verification (submission → S3 → list → status → notes → resume URL) needs a
running PostgreSQL and a reachable S3 bucket; see the plan's verification section.

## Reporting & analytics (Power BI)

Every time entry is mirrored into a denormalized, report-ready table
**`time_entries_report`** (one row per entry: employee name/email, readable activity
label, decimal hours, and date parts at the `America/Sao_Paulo` timezone). It is kept
in sync automatically by a Postgres trigger on `time_entries` — the application never
writes to it. Full design + Power BI connection guide: [`docs/reporting.md`](./docs/reporting.md).

### Initializing this in production (one-time)

The migration is **additive and non-destructive** — it creates the reporting table, an
`activity_labels` lookup, the sync trigger, and backfills existing entries. It does not
touch or delete any existing data.

```bash
# 1. Point at the PRODUCTION database.
#    DIRECT_URL MUST use the direct connection (port 5432), NOT the pooler (6543),
#    or the migration will fail. Set these to your Supabase values, e.g.:
export DATABASE_URL="postgresql://postgres:PASSWORD@<host>.pooler.supabase.com:6543/postgres"
export DIRECT_URL="postgresql://postgres:PASSWORD@<host>.pooler.supabase.com:5432/postgres"

# 2. Apply the migration (safe to re-run; only applies what's pending).
npm run prisma:deploy

# 3. Verify entry-count parity between the two tables.
npx tsx -e "import{PrismaClient}from'@prisma/client';const p=new PrismaClient();Promise.all([p.timeEntry.count(),p.timeEntryReport.count()]).then(([a,b])=>console.log('entries',a,'report',b,a===b?'IN SYNC':'MISMATCH')).finally(()=>p.\$disconnect())"
```

Then create the least-privilege Power BI login **once**: open Supabase → SQL Editor,
paste [`scripts/powerbi-readonly-role.sql`](./scripts/powerbi-readonly-role.sql), set a
real password, and run it. It grants `SELECT` on the report surface only (no candidate
PII). Point Power BI Desktop at the Supabase **direct** host (port 5432), database
`postgres`, user `powerbi_reader`, **Import** mode, and load `time_entries_report`.

> **⚠️ Production safety:** only ever use `npm run prisma:deploy` (`prisma migrate
> deploy`) against production. **Never** run `prisma migrate dev` or `prisma migrate
> reset` on prod — they can wipe data. The Vercel build (`vercel-build`) does **not**
> run migrations, so this step must be run manually (or as a dedicated CI step) after
> deploying code.

To locally verify the whole insert/update/delete sync pipeline:
`npx tsx scripts/verify-report-sync.ts` (creates, edits, deletes test entries and asserts
the mirror stays consistent; cleans up after itself).