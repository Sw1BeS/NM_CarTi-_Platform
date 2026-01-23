-- Add companyId to Lead for tenant scoping

ALTER TABLE "Lead" ADD COLUMN "companyId" TEXT;

-- Backfill from BotConfig when possible
UPDATE "Lead" AS l
SET "companyId" = b."companyId"
FROM "BotConfig" AS b
WHERE l."companyId" IS NULL
  AND l."botId" IS NOT NULL
  AND l."botId" = b."id";

-- Backfill remaining leads to system workspace (fallback: any workspace)
UPDATE "Lead"
SET "companyId" = COALESCE(
  (SELECT "id" FROM "workspaces" WHERE "slug" = 'system' LIMIT 1),
  (SELECT "id" FROM "workspaces" ORDER BY "created_at" ASC LIMIT 1)
)
WHERE "companyId" IS NULL;

ALTER TABLE "Lead" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "Lead_companyId_idx" ON "Lead"("companyId");
CREATE INDEX "Lead_companyId_status_idx" ON "Lead"("companyId", "status");
CREATE INDEX "Lead_companyId_createdAt_idx" ON "Lead"("companyId", "createdAt");

