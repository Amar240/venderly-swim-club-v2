-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "club_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'demo',
    "club_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "raw_filename" TEXT NOT NULL,
    "detected_format" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "warnings" JSONB NOT NULL,
    "dropped_columns" JSONB NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_jobs_club_id_idx" ON "ingestion_jobs"("club_id");
