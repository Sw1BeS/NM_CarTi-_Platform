-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "companyId" TEXT,
    "variables" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "draftId" INTEGER,
    "templateId" TEXT,
    "botId" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "messageId" INTEGER,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Template_companyId_idx" ON "Template"("companyId");

-- CreateIndex
CREATE INDEX "Template_status_idx" ON "Template"("status");

-- CreateIndex
CREATE INDEX "PublicationJob_companyId_idx" ON "PublicationJob"("companyId");

-- CreateIndex
CREATE INDEX "PublicationJob_status_idx" ON "PublicationJob"("status");

-- CreateIndex
CREATE INDEX "PublicationJob_scheduledAt_idx" ON "PublicationJob"("scheduledAt");

-- CreateIndex
CREATE INDEX "PublicationResult_jobId_idx" ON "PublicationResult"("jobId");

-- CreateIndex
CREATE INDEX "PublicationResult_status_idx" ON "PublicationResult"("status");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationJob" ADD CONSTRAINT "PublicationJob_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationResult" ADD CONSTRAINT "PublicationResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PublicationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
