-- CreateTable
CREATE TABLE "member_edit_logs" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "person_id" TEXT,
    "membership_id" TEXT,
    "target_label" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_edit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_edit_logs_club_id_created_at_idx" ON "member_edit_logs"("club_id", "created_at");

-- AddForeignKey
ALTER TABLE "member_edit_logs" ADD CONSTRAINT "member_edit_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
