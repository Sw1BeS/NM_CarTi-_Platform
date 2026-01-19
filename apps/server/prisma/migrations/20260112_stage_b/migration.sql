-- Stage B: Content Calendar & Scheduler
-- Migration created: 2026-01-12

-- Add scheduling fields to Draft table
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP;
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP;
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "destination" TEXT;
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "botId" TEXT;
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Create index for scheduler queries
CREATE INDEX IF NOT EXISTS "Draft_scheduledAt_status_idx" ON "Draft"("scheduledAt", "status") WHERE "scheduledAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Draft_postedAt_idx" ON "Draft"("postedAt");

-- Update Draft status enum if needed (assuming it exists)
-- This is informational - status values: DRAFT, SCHEDULED, POSTED, FAILED

-- Comments for documentation
COMMENT ON COLUMN "Draft"."scheduledAt" IS 'Timestamp when post should be published';
COMMENT ON COLUMN "Draft"."postedAt" IS 'Timestamp when post was actually published';
COMMENT ON COLUMN "Draft"."destination" IS 'Telegram channel/group ID';
COMMENT ON COLUMN "Draft"."botId" IS 'Bot token ID for publishing';
COMMENT ON COLUMN "Draft"."metadata" IS 'Additional data: error logs, retry count, etc';
