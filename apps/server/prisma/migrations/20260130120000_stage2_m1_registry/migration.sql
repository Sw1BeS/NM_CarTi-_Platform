-- Add lastError to ChannelSource
ALTER TABLE "ChannelSource" ADD COLUMN "lastError" TEXT;

-- CreateTable
CREATE TABLE "TelegramDestination" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "access" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectorId" TEXT,
    "channelSourceId" TEXT,
    "botId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDestination_companyId_tgId_access_key" ON "TelegramDestination"("companyId", "tgId", "access");

-- CreateIndex
CREATE INDEX "TelegramDestination_companyId_idx" ON "TelegramDestination"("companyId");

-- CreateIndex
CREATE INDEX "TelegramDestination_status_idx" ON "TelegramDestination"("status");

-- AddForeignKey
ALTER TABLE "TelegramDestination" ADD CONSTRAINT "TelegramDestination_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
