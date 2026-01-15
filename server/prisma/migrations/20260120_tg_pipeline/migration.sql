-- Telegram pipeline: normalization, events, dedup, scenario status

DO $$ BEGIN
  CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NormalizationType" AS ENUM ('brand', 'model', 'city');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Scenario" ADD COLUMN IF NOT EXISTS "status" "ScenarioStatus" NOT NULL DEFAULT 'PUBLISHED';

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "NormalizationAlias" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" "NormalizationType" NOT NULL,
  "alias" TEXT NOT NULL,
  "canonical" TEXT NOT NULL,
  "companyId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NormalizationAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "NormalizationAlias_type_alias_companyId_key" UNIQUE ("type", "alias", "companyId")
);

CREATE INDEX IF NOT EXISTS "NormalizationAlias_type_alias_idx" ON "NormalizationAlias"("type", "alias");
CREATE INDEX IF NOT EXISTS "NormalizationAlias_companyId_idx" ON "NormalizationAlias"("companyId");

CREATE TABLE IF NOT EXISTS "PlatformEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT,
  "botId" TEXT,
  "eventType" TEXT NOT NULL,
  "userId" TEXT,
  "chatId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "PlatformEvent_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "PlatformEvent_companyId_createdAt_idx" ON "PlatformEvent"("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PlatformEvent_botId_createdAt_idx" ON "PlatformEvent"("botId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PlatformEvent_eventType_createdAt_idx" ON "PlatformEvent"("eventType", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "TelegramUpdate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "botId" TEXT NOT NULL,
  "updateId" INTEGER NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramUpdate_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramUpdate_botId_updateId_key" UNIQUE ("botId", "updateId")
);

CREATE INDEX IF NOT EXISTS "TelegramUpdate_createdAt_idx" ON "TelegramUpdate"("createdAt" DESC);
