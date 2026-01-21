-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "sendpulseId" TEXT,
ADD COLUMN     "sendpulseSecret" TEXT;

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
