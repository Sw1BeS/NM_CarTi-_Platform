-- Stage A Core Schema
-- Created: 2026-01-15

-- 1) Enums for Stage A statuses
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COLLECTING_VARIANTS', 'SHORTLIST', 'CONTACT_SHARED', 'WON', 'LOST');
CREATE TYPE "VariantStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'SENT_TO_CLIENT');

-- 2) Upgrade B2bRequest.status to enum
ALTER TABLE "B2bRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "B2bRequest" ALTER COLUMN "status" TYPE "RequestStatus" USING (
    CASE UPPER(COALESCE("status", 'DRAFT'))
        WHEN 'NEW' THEN 'DRAFT'::"RequestStatus"
        WHEN 'DRAFT' THEN 'DRAFT'::"RequestStatus"
        WHEN 'PUBLISHED' THEN 'PUBLISHED'::"RequestStatus"
        WHEN 'OPEN' THEN 'COLLECTING_VARIANTS'::"RequestStatus"
        WHEN 'IN_PROGRESS' THEN 'COLLECTING_VARIANTS'::"RequestStatus"
        WHEN 'COLLECTING_VARIANTS' THEN 'COLLECTING_VARIANTS'::"RequestStatus"
        WHEN 'SHORTLIST' THEN 'SHORTLIST'::"RequestStatus"
        WHEN 'READY_FOR_REVIEW' THEN 'SHORTLIST'::"RequestStatus"
        WHEN 'CONTACT_SHARED' THEN 'CONTACT_SHARED'::"RequestStatus"
        WHEN 'CONTACT' THEN 'CONTACT_SHARED'::"RequestStatus"
        WHEN 'WON' THEN 'WON'::"RequestStatus"
        WHEN 'LOST' THEN 'LOST'::"RequestStatus"
        WHEN 'CLOSED' THEN 'LOST'::"RequestStatus"
        ELSE 'DRAFT'::"RequestStatus"
    END
);
ALTER TABLE "B2bRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- 3) Upgrade RequestVariant.status to enum
ALTER TABLE "RequestVariant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RequestVariant" ALTER COLUMN "status" TYPE "VariantStatus" USING (
    CASE UPPER(COALESCE("status", 'SUBMITTED'))
        WHEN 'PENDING' THEN 'SUBMITTED'::"VariantStatus"
        WHEN 'SUBMITTED' THEN 'SUBMITTED'::"VariantStatus"
        WHEN 'OFFERED' THEN 'REVIEWED'::"VariantStatus"
        WHEN 'REVIEWED' THEN 'REVIEWED'::"VariantStatus"
        WHEN 'APPROVED' THEN 'APPROVED'::"VariantStatus"
        WHEN 'ACCEPTED' THEN 'APPROVED'::"VariantStatus"
        WHEN 'FIT' THEN 'APPROVED'::"VariantStatus"
        WHEN 'REJECTED' THEN 'REJECTED'::"VariantStatus"
        WHEN 'REJECT' THEN 'REJECTED'::"VariantStatus"
        WHEN 'SENT' THEN 'SENT_TO_CLIENT'::"VariantStatus"
        WHEN 'SENT_TO_CLIENT' THEN 'SENT_TO_CLIENT'::"VariantStatus"
        ELSE 'SUBMITTED'::"VariantStatus"
    END
);
ALTER TABLE "RequestVariant" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- 4) ChannelPost table
CREATE TABLE "ChannelPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "botId" TEXT,
    "channelId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelPost_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "B2bRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelPost_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChannelPost_request_channel_idx" ON "ChannelPost" ("requestId", "channelId");
CREATE INDEX "ChannelPost_channelId_idx" ON "ChannelPost" ("channelId");

-- 5) MessageLog table
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT,
    "variantId" TEXT,
    "botId" TEXT,
    "chatId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INCOMING',
    "text" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "B2bRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "RequestVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MessageLog_requestId_idx" ON "MessageLog" ("requestId");
CREATE INDEX "MessageLog_chatId_idx" ON "MessageLog" ("chatId");

-- 6) Partner tables
CREATE TABLE "PartnerCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PartnerUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "telegramId" TEXT,
    "phone" TEXT,
    "partnerId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerUser_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartnerUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartnerUser_telegramId_key" UNIQUE ("telegramId")
);
