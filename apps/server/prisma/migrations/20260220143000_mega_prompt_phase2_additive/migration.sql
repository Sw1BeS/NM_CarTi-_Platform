-- Phase 2 (additive): quota, access requests, public sequence, B2B lifecycle fields

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequesterDecision') THEN
    CREATE TYPE "RequesterDecision" AS ENUM ('PENDING', 'FIT', 'NOT_FIT');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FitQueueStatus') THEN
    CREATE TYPE "FitQueueStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'AGREED', 'MEETING_SCHEDULED', 'CLOSED');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessRequestStatus') THEN
    CREATE TYPE "AccessRequestStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED');
  END IF;
END$$;

-- B2bRequest additive columns
ALTER TABLE "B2bRequest"
  ADD COLUMN IF NOT EXISTS "requesterPartnerId" TEXT,
  ADD COLUMN IF NOT EXISTS "channelPostUrl" TEXT;

CREATE INDEX IF NOT EXISTS "B2bRequest_requesterPartnerId_idx" ON "B2bRequest" ("requesterPartnerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'B2bRequest_requesterPartnerId_fkey'
  ) THEN
    ALTER TABLE "B2bRequest"
      ADD CONSTRAINT "B2bRequest_requesterPartnerId_fkey"
      FOREIGN KEY ("requesterPartnerId") REFERENCES "PartnerCompany"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- RequestVariant additive lifecycle columns
ALTER TABLE "RequestVariant"
  ADD COLUMN IF NOT EXISTS "requesterDecision" "RequesterDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "fitQueueStatus" "FitQueueStatus",
  ADD COLUMN IF NOT EXISTS "requesterDecisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fitQueuedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fitClosedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sellerPartnerId" TEXT;

CREATE INDEX IF NOT EXISTS "RequestVariant_requesterDecision_idx" ON "RequestVariant" ("requesterDecision");
CREATE INDEX IF NOT EXISTS "RequestVariant_fitQueueStatus_idx" ON "RequestVariant" ("fitQueueStatus");
CREATE INDEX IF NOT EXISTS "RequestVariant_sellerPartnerId_idx" ON "RequestVariant" ("sellerPartnerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RequestVariant_sellerPartnerId_fkey'
  ) THEN
    ALTER TABLE "RequestVariant"
      ADD CONSTRAINT "RequestVariant_sellerPartnerId_fkey"
      FOREIGN KEY ("sellerPartnerId") REFERENCES "PartnerCompany"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- IntegrationEventLog idempotency key
ALTER TABLE "IntegrationEventLog"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEventLog_idempotencyKey_key"
  ON "IntegrationEventLog"("idempotencyKey");

-- QuotaUsage
CREATE TABLE IF NOT EXISTS "QuotaUsage" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26),
  "botId" TEXT,
  "tgUserId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuotaUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuotaUsage_companyId_botId_tgUserId_scope_periodKey_key"
  ON "QuotaUsage"("companyId", "botId", "tgUserId", "scope", "periodKey");
CREATE INDEX IF NOT EXISTS "QuotaUsage_companyId_idx" ON "QuotaUsage"("companyId");
CREATE INDEX IF NOT EXISTS "QuotaUsage_botId_idx" ON "QuotaUsage"("botId");
CREATE INDEX IF NOT EXISTS "QuotaUsage_scope_periodKey_idx" ON "QuotaUsage"("scope", "periodKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'QuotaUsage_companyId_fkey'
  ) THEN
    ALTER TABLE "QuotaUsage"
      ADD CONSTRAINT "QuotaUsage_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'QuotaUsage_botId_fkey'
  ) THEN
    ALTER TABLE "QuotaUsage"
      ADD CONSTRAINT "QuotaUsage_botId_fkey"
      FOREIGN KEY ("botId") REFERENCES "BotConfig"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- B2bAccessRequest
CREATE TABLE IF NOT EXISTS "B2bAccessRequest" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26),
  "botId" TEXT,
  "tgUserId" TEXT NOT NULL,
  "username" TEXT,
  "fullName" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'NEW',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  CONSTRAINT "B2bAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "B2bAccessRequest_companyId_idx" ON "B2bAccessRequest"("companyId");
CREATE INDEX IF NOT EXISTS "B2bAccessRequest_botId_idx" ON "B2bAccessRequest"("botId");
CREATE INDEX IF NOT EXISTS "B2bAccessRequest_tgUserId_idx" ON "B2bAccessRequest"("tgUserId");
CREATE INDEX IF NOT EXISTS "B2bAccessRequest_status_idx" ON "B2bAccessRequest"("status");
CREATE INDEX IF NOT EXISTS "B2bAccessRequest_companyId_status_createdAt_idx" ON "B2bAccessRequest"("companyId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'B2bAccessRequest_companyId_fkey'
  ) THEN
    ALTER TABLE "B2bAccessRequest"
      ADD CONSTRAINT "B2bAccessRequest_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'B2bAccessRequest_botId_fkey'
  ) THEN
    ALTER TABLE "B2bAccessRequest"
      ADD CONSTRAINT "B2bAccessRequest_botId_fkey"
      FOREIGN KEY ("botId") REFERENCES "BotConfig"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- PublicSequence
CREATE TABLE IF NOT EXISTS "PublicSequence" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PublicSequence_scope_year_key" ON "PublicSequence"("scope", "year");
CREATE INDEX IF NOT EXISTS "PublicSequence_scope_idx" ON "PublicSequence"("scope");
