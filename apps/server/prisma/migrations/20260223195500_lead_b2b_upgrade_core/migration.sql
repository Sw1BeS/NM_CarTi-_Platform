-- Core Lead+B2B upgrade: external listings, partner ownership/codes, support tickets.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExternalSourceProvider') THEN
    CREATE TYPE "ExternalSourceProvider" AS ENUM ('AUTO_RIA', 'OLX');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartnerUserRole') THEN
    CREATE TYPE "PartnerUserRole" AS ENUM ('OWNER', 'AGENT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketStatus') THEN
    CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

ALTER TABLE "CarListing"
  ADD COLUMN "sourceProvider" "ExternalSourceProvider",
  ADD COLUMN "external" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "partnerCompanyId" TEXT;

ALTER TABLE "CarListing"
  ADD CONSTRAINT "CarListing_partnerCompanyId_fkey"
  FOREIGN KEY ("partnerCompanyId") REFERENCES "PartnerCompany"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "CarListing_partnerCompanyId_idx" ON "CarListing"("partnerCompanyId");
CREATE INDEX "CarListing_partnerCompanyId_status_idx" ON "CarListing"("partnerCompanyId", "status");
CREATE INDEX "CarListing_sourceProvider_idx" ON "CarListing"("sourceProvider");
CREATE INDEX "CarListing_external_idx" ON "CarListing"("external");

ALTER TABLE "PartnerCompany"
  ADD COLUMN "partnerCode" TEXT,
  ADD COLUMN "showcaseSlug" TEXT,
  ADD COLUMN "crmUrl" TEXT;

CREATE UNIQUE INDEX "PartnerCompany_partnerCode_key" ON "PartnerCompany"("partnerCode");
CREATE UNIQUE INDEX "PartnerCompany_showcaseSlug_key" ON "PartnerCompany"("showcaseSlug");

ALTER TABLE "PartnerUser"
  ADD COLUMN "role" "PartnerUserRole" NOT NULL DEFAULT 'AGENT';

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "botId" TEXT,
  "tgUserId" TEXT NOT NULL,
  "chatId" TEXT,
  "text" TEXT NOT NULL,
  "context" JSONB,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "BotConfig"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "SupportTicket_companyId_idx" ON "SupportTicket"("companyId");
CREATE INDEX "SupportTicket_botId_idx" ON "SupportTicket"("botId");
CREATE INDEX "SupportTicket_tgUserId_idx" ON "SupportTicket"("tgUserId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_tgUserId_status_createdAt_idx" ON "SupportTicket"("tgUserId", "status", "createdAt");
