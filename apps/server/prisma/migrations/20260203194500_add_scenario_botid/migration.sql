-- Add optional botId to Scenario and relation to BotConfig
ALTER TABLE "Scenario" ADD COLUMN "botId" TEXT;

CREATE INDEX "Scenario_botId_idx" ON "Scenario"("botId");

ALTER TABLE "Scenario"
  ADD CONSTRAINT "Scenario_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "BotConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
