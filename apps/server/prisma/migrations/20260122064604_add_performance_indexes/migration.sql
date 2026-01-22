-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "dictionary_entries" ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "entity_types" ALTER COLUMN "capabilities" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "field_definitions" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "ingestion_sources" ALTER COLUMN "config" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "memberships" ALTER COLUMN "permissions" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "record_relations" ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "record_search_index" ALTER COLUMN "promoted" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "records" ALTER COLUMN "attributes" SET DEFAULT '{}'::jsonb;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "settings" SET DEFAULT '{}'::jsonb;

-- CreateIndex
CREATE INDEX "B2bRequest_companyId_status_createdAt_idx" ON "B2bRequest"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CarListing_companyId_status_idx" ON "CarListing"("companyId", "status");

-- CreateIndex
CREATE INDEX "CarListing_companyId_status_createdAt_idx" ON "CarListing"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CarListing_year_price_idx" ON "CarListing"("year", "price");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_botId_status_idx" ON "Lead"("botId", "status");

-- CreateIndex
CREATE INDEX "Lead_botId_phone_createdAt_idx" ON "Lead"("botId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_userTgId_botId_idx" ON "Lead"("userTgId", "botId");
