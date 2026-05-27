CREATE TABLE "AttributionSession" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "companyId" TEXT,
  "botId" TEXT,
  "destination" TEXT NOT NULL,
  "source" TEXT,
  "query" JSONB,
  "identifiers" JSONB,
  "requestMeta" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttributionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttributionSession_token_key" ON "AttributionSession"("token");
CREATE INDEX "AttributionSession_companyId_idx" ON "AttributionSession"("companyId");
CREATE INDEX "AttributionSession_botId_idx" ON "AttributionSession"("botId");
CREATE INDEX "AttributionSession_expiresAt_idx" ON "AttributionSession"("expiresAt");
CREATE INDEX "AttributionSession_destination_idx" ON "AttributionSession"("destination");
