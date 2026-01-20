/*
  Warnings:

  - A unique constraint covering the columns `[sourceChatId,sourceMessageId]` on the table `CarListing` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CarListing" ADD COLUMN     "mediaGroupKey" TEXT,
ADD COLUMN     "originalRaw" JSONB,
ADD COLUMN     "sourceChatId" TEXT,
ADD COLUMN     "sourceMessageId" INTEGER;

-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "dictionary_entries" ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "entity_types" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "field_definitions" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "ingestion_sources" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "memberships" ALTER COLUMN "permissions" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "record_relations" ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "record_search_index" ALTER COLUMN "promoted" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "records" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "settings" SET DEFAULT '{}'::jsonb;

-- CreateTable
CREATE TABLE "MTProtoConnector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "workspaceApiId" INTEGER,
    "workspaceApiHash" TEXT,
    "sessionString" TEXT,
    "phone" TEXT,
    "companyId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3),
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MTProtoConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSource" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "username" TEXT,
    "title" TEXT NOT NULL,
    "importRules" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MTProtoConnector_companyId_idx" ON "MTProtoConnector"("companyId");

-- CreateIndex
CREATE INDEX "ChannelSource_status_idx" ON "ChannelSource"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSource_connectorId_channelId_key" ON "ChannelSource"("connectorId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "CarListing_sourceChatId_sourceMessageId_key" ON "CarListing"("sourceChatId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "MTProtoConnector" ADD CONSTRAINT "MTProtoConnector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSource" ADD CONSTRAINT "ChannelSource_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "MTProtoConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
