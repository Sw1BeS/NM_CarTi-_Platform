ALTER TABLE "B2bRequest" ADD COLUMN "leadId" TEXT;
CREATE INDEX "B2bRequest_leadId_idx" ON "B2bRequest"("leadId");
ALTER TABLE "B2bRequest" ADD CONSTRAINT "B2bRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Integration" ADD COLUMN "healthStatus" TEXT;
ALTER TABLE "Integration" ADD COLUMN "healthMessage" TEXT;
ALTER TABLE "Integration" ADD COLUMN "healthCheckedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Integration" ADD COLUMN "lastError" TEXT;

CREATE TABLE "ParsingJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParsingJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParsingJob_companyId_idx" ON "ParsingJob"("companyId");
CREATE INDEX "ParsingJob_status_idx" ON "ParsingJob"("status");
CREATE INDEX "ParsingJob_createdAt_idx" ON "ParsingJob"("createdAt");

ALTER TABLE "ParsingJob" ADD CONSTRAINT "ParsingJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
