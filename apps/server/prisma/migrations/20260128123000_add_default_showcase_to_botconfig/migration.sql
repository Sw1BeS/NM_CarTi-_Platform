-- Add default showcase relation to BotConfig
ALTER TABLE "BotConfig" ADD COLUMN "defaultShowcaseId" TEXT;

-- Add foreign key to Showcase
ALTER TABLE "BotConfig"
ADD CONSTRAINT "BotConfig_defaultShowcaseId_fkey"
FOREIGN KEY ("defaultShowcaseId") REFERENCES "Showcase"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
