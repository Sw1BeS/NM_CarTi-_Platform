-- Stage C hotfix (idempotent)
-- Ensures multi-tenant tables/enums exist without breaking existing data

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationType') THEN
    CREATE TYPE "IntegrationType" AS ENUM ('SENDPULSE', 'META_PIXEL', 'GOOGLE_SHEETS', 'WEBHOOK', 'ZAPIER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyPlan') THEN
    CREATE TYPE "CompanyPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'VIEWER');
  END IF;
END $$;

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';

ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'SENDPULSE';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'META_PIXEL';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'GOOGLE_SHEETS';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'WEBHOOK';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'ZAPIER';

ALTER TYPE "CompanyPlan" ADD VALUE IF NOT EXISTS 'FREE';
ALTER TYPE "CompanyPlan" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "CompanyPlan" ADD VALUE IF NOT EXISTS 'ENTERPRISE';

CREATE TABLE IF NOT EXISTS "Company" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logo" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#D4AF37',
  "domain" TEXT,
  "plan" "CompanyPlan" NOT NULL DEFAULT 'FREE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Company_slug_key" ON "Company"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Company_domain_key" ON "Company"("domain");

CREATE TABLE IF NOT EXISTS "ScenarioTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "thumbnail" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "isPremium" BOOLEAN NOT NULL DEFAULT false,
  "structure" JSONB NOT NULL,
  "installs" INTEGER NOT NULL DEFAULT 0,
  "rating" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "CompanyTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyTemplate_companyId_templateId_key"
  ON "CompanyTemplate"("companyId", "templateId");

CREATE TABLE IF NOT EXISTS "Integration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "type" "IntegrationType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_companyId_type_key"
  ON "Integration"("companyId", "type");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyTemplate_companyId_fkey') THEN
    ALTER TABLE "CompanyTemplate"
      ADD CONSTRAINT "CompanyTemplate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyTemplate_templateId_fkey') THEN
    ALTER TABLE "CompanyTemplate"
      ADD CONSTRAINT "CompanyTemplate_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Integration_companyId_fkey') THEN
    ALTER TABLE "Integration"
      ADD CONSTRAINT "Integration_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
  END IF;
END $$;

INSERT INTO "Company" ("id", "name", "slug", "primaryColor", "plan", "isActive", "createdAt", "updatedAt")
VALUES ('company_system', 'System Company', 'system', '#D4AF37', 'ENTERPRISE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Scenario" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "CarListing" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;

UPDATE "User" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "BotConfig" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "Scenario" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "CarListing" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "B2bRequest" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BotConfig" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Scenario" ALTER COLUMN "companyId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BotConfig_companyId_fkey') THEN
    ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Scenario_companyId_fkey') THEN
    ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId");
CREATE INDEX IF NOT EXISTS "BotConfig_companyId_idx" ON "BotConfig"("companyId");
CREATE INDEX IF NOT EXISTS "Scenario_companyId_idx" ON "Scenario"("companyId");
CREATE INDEX IF NOT EXISTS "CarListing_companyId_idx" ON "CarListing"("companyId");
CREATE INDEX IF NOT EXISTS "B2bRequest_companyId_idx" ON "B2bRequest"("companyId");
