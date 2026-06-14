-- Preserve historical visit rows when a person is permanently removed.
ALTER TABLE "checkin_events" DROP CONSTRAINT "checkin_events_person_id_fkey";

ALTER TABLE "checkin_events" ALTER COLUMN "person_id" DROP NOT NULL;

ALTER TABLE "checkin_events"
ADD CONSTRAINT "checkin_events_person_id_fkey"
FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
