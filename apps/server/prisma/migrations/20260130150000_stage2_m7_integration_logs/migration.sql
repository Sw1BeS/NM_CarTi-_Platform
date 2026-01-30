-- CreateTable
CREATE TABLE "IntegrationEventLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "integration" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payloadMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationEventLog_companyId_idx" ON "IntegrationEventLog"("companyId");

-- CreateIndex
CREATE INDEX "IntegrationEventLog_integration_idx" ON "IntegrationEventLog"("integration");

-- CreateIndex
CREATE INDEX "IntegrationEventLog_status_idx" ON "IntegrationEventLog"("status");

-- CreateIndex
CREATE INDEX "IntegrationEventLog_createdAt_idx" ON "IntegrationEventLog"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEventLog_entityId_idx" ON "IntegrationEventLog"("entityId");

-- AddForeignKey
ALTER TABLE "IntegrationEventLog" ADD CONSTRAINT "IntegrationEventLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
