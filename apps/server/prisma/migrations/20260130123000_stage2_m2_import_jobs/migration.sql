-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "sourceChatId" TEXT;
ALTER TABLE "Draft" ADD COLUMN "sourceMessageId" INTEGER;
ALTER TABLE "Draft" ADD COLUMN "mediaGroupKey" TEXT;

-- CreateTable
CREATE TABLE "TelegramImportJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "channelSourceId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastMessageId" INTEGER,
    "lastMessageDate" TIMESTAMP(3),
    "totalProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalImported" INTEGER NOT NULL DEFAULT 0,
    "totalSkipped" INTEGER NOT NULL DEFAULT 0,
    "totalErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Draft_sourceChatId_sourceMessageId_key" ON "Draft"("sourceChatId", "sourceMessageId");

-- CreateIndex
CREATE INDEX "TelegramImportJob_companyId_idx" ON "TelegramImportJob"("companyId");

-- CreateIndex
CREATE INDEX "TelegramImportJob_status_idx" ON "TelegramImportJob"("status");

-- CreateIndex
CREATE INDEX "TelegramImportJob_channelSourceId_idx" ON "TelegramImportJob"("channelSourceId");

-- AddForeignKey
ALTER TABLE "TelegramImportJob" ADD CONSTRAINT "TelegramImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
