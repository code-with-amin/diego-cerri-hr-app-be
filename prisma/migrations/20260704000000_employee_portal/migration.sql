-- Employee portal: approval-gated auth + time tracking.
-- Migrates the single-admin model into a role-based User model and adds the
-- tracker tables. The old `admins` table is dropped and its data does not
-- carry over; the seed re-creates the admin as a User with the `admin` role.
--
-- Existing internal notes reference the dropped admin via `admin_id`, so they
-- are cleared before the FK is repointed at `users`. (Dev data may reset — the
-- notes table/column names are otherwise preserved.)
DELETE FROM "notes";

-- CreateEnum
CREATE TYPE "TrackerStatus" AS ENUM ('running', 'paused');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('TIMER', 'MANUAL');

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_admin_id_fkey";

-- DropTable
DROP TABLE "admins";

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT,
    "role_id" TEXT NOT NULL,
    "candidate_id" TEXT,
    "hourly_rate" DECIMAL(12,2),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "password_set_at" TIMESTAMP(3),
    "reset_token_hash" TEXT,
    "reset_token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "TrackerStatus" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL,
    "total_break_ms" INTEGER NOT NULL DEFAULT 0,
    "current_break_started_at" TIMESTAMP(3),
    "break_count" INTEGER NOT NULL DEFAULT 0,
    "project" TEXT NOT NULL,
    "client" TEXT,
    "activity_key" TEXT NOT NULL,
    "location" TEXT,
    "entry_type" TEXT,
    "observations" TEXT,
    "rate_snapshot" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracker_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "activity_key" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "entry_type" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "break_ms" INTEGER NOT NULL DEFAULT 0,
    "net_ms" INTEGER NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'TIMER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_candidate_id_key" ON "users"("candidate_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracker_sessions_user_id_key" ON "tracker_sessions"("user_id");

-- CreateIndex
CREATE INDEX "time_entries_user_id_started_at_idx" ON "time_entries"("user_id", "started_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_sessions" ADD CONSTRAINT "tracker_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
