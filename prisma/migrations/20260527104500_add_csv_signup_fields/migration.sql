-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "address_street" TEXT,
ADD COLUMN "address_city" TEXT,
ADD COLUMN "address_state" TEXT,
ADD COLUMN "address_postal_code" TEXT,
ADD COLUMN "address_country" TEXT,
ADD COLUMN "submitted_at" TIMESTAMP(3),
ADD COLUMN "external_order_id" TEXT,
ADD COLUMN "signup_ip" TEXT,
ADD COLUMN "signup_timezone" TEXT,
ADD COLUMN "signup_url" TEXT,
ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phone_verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN "emergency_contact_email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "memberships_club_id_external_order_id_key" ON "memberships"("club_id", "external_order_id");

-- CreateIndex
CREATE INDEX "memberships_club_id_submitted_at_idx" ON "memberships"("club_id", "submitted_at");
