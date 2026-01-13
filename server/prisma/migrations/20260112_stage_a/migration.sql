-- Stage A: Message Logging & Inbox Features
-- Migration created: 2026-01-12

-- Create BotMessage table for persistent chat history
CREATE TABLE IF NOT EXISTS "BotMessage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "botId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "direction" TEXT NOT NULL CHECK ("direction" IN ('INCOMING', 'OUTGOING')),
  "text" TEXT NOT NULL,
  "messageId" INTEGER,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX "BotMessage_botId_chatId_createdAt_idx" ON "BotMessage"("botId", "chatId", "createdAt" DESC);
CREATE INDEX "BotMessage_chatId_idx" ON "BotMessage"("chatId");

-- Add Inbox features to B2bRequest
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;

-- Create index for assignment queries
CREATE INDEX IF NOT EXISTS "B2bRequest_assignedTo_idx" ON "B2bRequest"("assignedTo");

-- Comments for documentation
COMMENT ON TABLE "BotMessage" IS 'Persistent chat history for all bot conversations';
COMMENT ON COLUMN "BotMessage"."direction" IS 'INCOMING (from user) or OUTGOING (from bot)';
COMMENT ON COLUMN "BotMessage"."payload" IS 'Additional metadata: buttons, media, sender info';
COMMENT ON COLUMN "B2bRequest"."assignedTo" IS 'User ID of assigned manager';
COMMENT ON COLUMN "B2bRequest"."internalNotes" IS 'Private notes not visible to client';
