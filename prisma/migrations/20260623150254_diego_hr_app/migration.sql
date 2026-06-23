-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "linkedin_url" TEXT,
    "birth_date" DATE,
    "resume_s3_key" TEXT NOT NULL,
    "resume_filename" TEXT NOT NULL,
    "resume_content_type" TEXT NOT NULL,
    "resume_size" INTEGER NOT NULL,
    "employment_types" TEXT[],
    "hours_per_day" INTEGER NOT NULL,
    "work_regime" TEXT,
    "availability_start" TEXT,
    "travel_availability" TEXT NOT NULL,
    "knowledge_areas" TEXT[],
    "software_skills" TEXT,
    "seniority" TEXT,
    "work_done" TEXT NOT NULL,
    "work_capable" TEXT,
    "years_experience" INTEGER,
    "hourly_rate" DECIMAL(12,2) NOT NULL,
    "monthly_expectation" DECIMAL(12,2),
    "observations" TEXT,
    "consent" BOOLEAN NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "candidates_status_idx" ON "candidates"("status");

-- CreateIndex
CREATE INDEX "candidates_created_at_idx" ON "candidates"("created_at");

-- CreateIndex
CREATE INDEX "notes_candidate_id_idx" ON "notes"("candidate_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
