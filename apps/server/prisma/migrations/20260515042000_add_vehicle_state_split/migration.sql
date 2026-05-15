-- Split inventory availability from publication/review state while keeping legacy status.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleAvailabilityState') THEN
    CREATE TYPE "VehicleAvailabilityState" AS ENUM (
      'IN_STOCK',
      'IN_TRANSIT',
      'IMPORT_TO_ORDER',
      'RESERVED',
      'SOLD',
      'UNKNOWN'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehiclePublicationStatus') THEN
    CREATE TYPE "VehiclePublicationStatus" AS ENUM (
      'DRAFT',
      'REVIEW',
      'PUBLISHED',
      'HIDDEN'
    );
  END IF;
END$$;

ALTER TABLE "CarListing"
  ADD COLUMN IF NOT EXISTS "availabilityState" "VehicleAvailabilityState" NOT NULL DEFAULT 'IN_STOCK',
  ADD COLUMN IF NOT EXISTS "publicationStatus" "VehiclePublicationStatus" NOT NULL DEFAULT 'PUBLISHED';

UPDATE "CarListing"
SET "availabilityState" = CASE
  WHEN "status" = 'SOLD' THEN 'SOLD'::"VehicleAvailabilityState"
  WHEN "status" = 'RESERVED' THEN 'RESERVED'::"VehicleAvailabilityState"
  WHEN coalesce("title", '') ~* '(під[[:space:]]+замовлення|под[[:space:]]+заказ|to[[:space:]]+order|import[[:space:]]+to[[:space:]]+order)' THEN 'IMPORT_TO_ORDER'::"VehicleAvailabilityState"
  WHEN coalesce("description", '') ~* '(під[[:space:]]+замовлення|под[[:space:]]+заказ|to[[:space:]]+order|import[[:space:]]+to[[:space:]]+order)' THEN 'IMPORT_TO_ORDER'::"VehicleAvailabilityState"
  WHEN coalesce("title", '') ~* '(#вдорозі|в[[:space:]]+дорозі|in[_[:space:]-]?transit|прямує|в[[:space:]]+пути|on[[:space:]]+the[[:space:]]+way)' THEN 'IN_TRANSIT'::"VehicleAvailabilityState"
  WHEN coalesce("description", '') ~* '(#вдорозі|в[[:space:]]+дорозі|in[_[:space:]-]?transit|прямує|в[[:space:]]+пути|on[[:space:]]+the[[:space:]]+way)' THEN 'IN_TRANSIT'::"VehicleAvailabilityState"
  WHEN "status" = 'PENDING' THEN 'UNKNOWN'::"VehicleAvailabilityState"
  ELSE 'IN_STOCK'::"VehicleAvailabilityState"
END,
"publicationStatus" = CASE
  WHEN "status" = 'HIDDEN' THEN 'HIDDEN'::"VehiclePublicationStatus"
  WHEN "status" = 'PENDING' THEN 'REVIEW'::"VehiclePublicationStatus"
  ELSE 'PUBLISHED'::"VehiclePublicationStatus"
END;

CREATE INDEX IF NOT EXISTS "CarListing_availabilityState_idx" ON "CarListing"("availabilityState");
CREATE INDEX IF NOT EXISTS "CarListing_publicationStatus_idx" ON "CarListing"("publicationStatus");
CREATE INDEX IF NOT EXISTS "CarListing_companyId_availabilityState_publicationStatus_idx"
  ON "CarListing"("companyId", "availabilityState", "publicationStatus");
