-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ghl_location_id" TEXT,
    "max_capacity" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "membership_code" TEXT,
    "external_membership_id" TEXT,
    "external_customer_id" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "ghl_contact_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_events" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "guest_pass_purchase_id" TEXT,
    "staff_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_out_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkin_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_pass_purchases" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "person_id" TEXT,
    "code" TEXT NOT NULL,
    "quantity_purchased" INTEGER NOT NULL DEFAULT 1,
    "quantity_used" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_pass_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_ghl_location_id_key" ON "clubs"("ghl_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_club_id_idx" ON "staff"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_club_id_membership_code_key" ON "memberships"("club_id", "membership_code");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_club_id_external_membership_id_key" ON "memberships"("club_id", "external_membership_id");

-- CreateIndex
CREATE INDEX "memberships_club_id_status_idx" ON "memberships"("club_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "persons_club_id_ghl_contact_id_key" ON "persons"("club_id", "ghl_contact_id");

-- CreateIndex
CREATE INDEX "persons_club_id_email_idx" ON "persons"("club_id", "email");

-- CreateIndex
CREATE INDEX "persons_club_id_phone_idx" ON "persons"("club_id", "phone");

-- CreateIndex
CREATE INDEX "persons_club_id_membership_id_idx" ON "persons"("club_id", "membership_id");

-- CreateIndex
CREATE INDEX "checkin_events_club_id_is_active_idx" ON "checkin_events"("club_id", "is_active");

-- CreateIndex
CREATE INDEX "checkin_events_person_id_checked_in_at_idx" ON "checkin_events"("person_id", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_events_one_active_person_per_club_key" ON "checkin_events"("club_id", "person_id") WHERE "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "guest_pass_purchases_club_id_code_key" ON "guest_pass_purchases"("club_id", "code");

-- CreateIndex
CREATE INDEX "guest_pass_purchases_club_id_membership_id_idx" ON "guest_pass_purchases"("club_id", "membership_id");

-- CreateIndex
CREATE INDEX "guest_pass_purchases_club_id_person_id_idx" ON "guest_pass_purchases"("club_id", "person_id");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_guest_pass_purchase_id_fkey" FOREIGN KEY ("guest_pass_purchase_id") REFERENCES "guest_pass_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_events" ADD CONSTRAINT "checkin_events_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_pass_purchases" ADD CONSTRAINT "guest_pass_purchases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_pass_purchases" ADD CONSTRAINT "guest_pass_purchases_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_pass_purchases" ADD CONSTRAINT "guest_pass_purchases_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
