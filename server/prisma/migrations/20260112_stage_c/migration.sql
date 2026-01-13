-- Stage C: Multi-Tenancy Migration
-- Created: 2026-01-12

-- ========================================
-- 1. CREATE NEW ENUMS
-- ========================================

CREATE TYPE "IntegrationType" AS ENUM ('SENDPULSE', 'META_PIXEL', 'GOOGLE_SHEETS', 'WEBHOOK', 'ZAPIER');
CREATE TYPE "CompanyPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER');

-- ========================================
-- 2. CREATE COMPANY TABLE
-- ========================================

CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#D4AF37',
    "domain" TEXT UNIQUE,
    "plan" "CompanyPlan" NOT NULL DEFAULT 'FREE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- ========================================
-- 3. CREATE SCENARIO TEMPLATE TABLES
-- ========================================

CREATE TABLE "ScenarioTemplate" (
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

CREATE TABLE "CompanyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "CompanyTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
    CONSTRAINT "CompanyTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate"("id"),
    CONSTRAINT "CompanyTemplate_companyId_templateId_key" UNIQUE ("companyId", "templateId")
);

-- ========================================
-- 4. CREATE INTEGRATION TABLE
-- ========================================

CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "Integration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
    CONSTRAINT "Integration_companyId_type_key" UNIQUE ("companyId", "type")
);

-- ========================================
-- 5. INSERT DEFAULT SYSTEM COMPANY
-- ========================================

INSERT INTO "Company" ("id", "name", "slug", "primaryColor", "plan", "isActive", "createdAt", "updatedAt") 
VALUES (
    'company_system', 
    'System Company', 
    'system', 
    '#D4AF37', 
    'ENTERPRISE', 
    true, 
    CURRENT_TIMESTAMP, 
    CURRENT_TIMESTAMP
);

-- ========================================
-- 6. ADD COMPANY COLUMNS TO EXISTING TABLES
-- ========================================

-- User table
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;
ALTER TABLE "User" ADD COLUMN "roleNew" "UserRole" DEFAULT 'MANAGER';

-- Migrate existing role strings to new enum (best effort)
UPDATE "User" SET "roleNew" = 
    CASE 
        WHEN "role" = 'OWNER' THEN 'OWNER'::"UserRole"
        WHEN "role" = 'ADMIN' THEN 'ADMIN'::"UserRole"
        WHEN "role" = 'MANAGER' THEN 'MANAGER'::"UserRole"
        WHEN "role" = 'VIEWER' THEN 'VIEWER'::"UserRole"
        ELSE 'MANAGER'::"UserRole"
    END;

-- Drop old role column and rename new one
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "roleNew" TO "role";

-- BotConfig
ALTER TABLE "BotConfig" ADD COLUMN "companyId" TEXT;

-- Scenario
ALTER TABLE "Scenario" ADD COLUMN "companyId" TEXT;

-- CarListing
ALTER TABLE "CarListing" ADD COLUMN "companyId" TEXT;

-- B2bRequest (also add Stage A fields if not exists)
ALTER TABLE "B2bRequest" ADD COLUMN "companyId" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;

-- ========================================
-- 7. MIGRATE EXISTING DATA TO SYSTEM COMPANY
-- ========================================

UPDATE "User" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "BotConfig" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "Scenario" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "CarListing" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;
UPDATE "B2bRequest" SET "companyId" = 'company_system' WHERE "companyId" IS NULL;

-- ========================================
-- 8. MAKE FOREIGN KEYS NOT NULL (where needed)
-- ========================================

-- User.companyId must NOT be NULL
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id");

-- BotConfig.companyId must NOT be NULL
ALTER TABLE "BotConfig" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Scenario.companyId must NOT be NULL
ALTER TABLE "Scenario" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- CarListing and B2bRequest allow NULL (for backward compatibility or public listings)

-- ========================================
-- 9. CREATE INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "BotConfig_companyId_idx" ON "BotConfig"("companyId");
CREATE INDEX "Scenario_companyId_idx" ON "Scenario"("companyId");
CREATE INDEX "CarListing_companyId_idx" ON "CarListing"("companyId");
CREATE INDEX "B2bRequest_companyId_idx" ON "B2bRequest"("companyId");

-- ========================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON TABLE "Company" IS 'Multi-tenant companies with isolated workspaces';
COMMENT ON TABLE "ScenarioTemplate" IS 'Marketplace templates for bot scenarios';
COMMENT ON TABLE "CompanyTemplate" IS 'Junction: Company installations of templates';
COMMENT ON TABLE "Integration" IS 'Third-party integrations (SendPulse, Meta, etc.)';

COMMENT ON COLUMN "Company"."slug" IS 'URL-safe identifier for subdomains';
COMMENT ON COLUMN "Company"."plan" IS 'Subscription tier: FREE, PRO, ENTERPRISE';
COMMENT ON COLUMN "Integration"."config" IS 'JSON config: API keys, credentials, settings';
