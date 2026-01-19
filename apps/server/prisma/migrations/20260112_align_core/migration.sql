-- Lead status expansion
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'WON';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'LOST';

-- B2B requests alignment
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "budgetMin" INTEGER;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "yearMax" INTEGER;
ALTER TABLE "B2bRequest" ADD COLUMN IF NOT EXISTS "language" TEXT;

-- Variant currency
ALTER TABLE "RequestVariant" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD';
UPDATE "RequestVariant" SET "currency" = 'USD' WHERE "currency" IS NULL;
