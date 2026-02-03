ALTER TABLE "B2bRequest" ADD COLUMN "botId" TEXT;

CREATE INDEX "B2bRequest_botId_idx" ON "B2bRequest"("botId");
CREATE INDEX "B2bRequest_companyId_botId_createdAt_idx" ON "B2bRequest"("companyId", "botId", "createdAt");

ALTER TABLE "B2bRequest" ADD CONSTRAINT "B2bRequest_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
