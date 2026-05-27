-- AlterTable
ALTER TABLE "checkin_events" ADD COLUMN     "event_type" TEXT NOT NULL DEFAULT 'check_in',
ADD COLUMN     "guest_pass_method" TEXT,
ADD COLUMN     "num_guests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'qr_form';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "ghl_contact_id" TEXT,
ADD COLUMN     "guest_passes_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guest_passes_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_members" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "payment_amount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payment_status" TEXT NOT NULL DEFAULT 'paid',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ghl_signup',
ADD COLUMN     "stripe_payment_intent_id" TEXT,
ADD COLUMN     "stripe_setup_intent_id" TEXT,
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "relationship" TEXT NOT NULL DEFAULT 'self';
