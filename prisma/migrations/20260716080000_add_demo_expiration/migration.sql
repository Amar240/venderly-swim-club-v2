-- Demo records expire after seven days. Existing rows receive the same
-- retention window relative to their original creation time.
ALTER TABLE "prospects" ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "prospects"
SET "expires_at" = "created_at" + INTERVAL '7 days';

ALTER TABLE "prospects" ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "prospects_expires_at_idx" ON "prospects"("expires_at");
