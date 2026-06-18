-- Vehicle taxonomy canonical snapshot tables.
-- Additive migration only; existing inventory, requests, and normalization aliases remain untouched.

CREATE TABLE "VehicleMake" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "countryScope" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleSpecOption" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleSpecOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeoPlace" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "sourceMeta" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoPlace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxonomySyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "counts" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "sourceMeta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TaxonomySyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleTaxonomyCandidate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "makeLabel" TEXT,
    "source" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "VehicleTaxonomyCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleMake_slug_key" ON "VehicleMake"("slug");
CREATE UNIQUE INDEX "VehicleMake_normalizedKey_key" ON "VehicleMake"("normalizedKey");
CREATE INDEX "VehicleMake_active_idx" ON "VehicleMake"("active");

CREATE UNIQUE INDEX "VehicleModel_makeId_normalizedKey_key" ON "VehicleModel"("makeId", "normalizedKey");
CREATE INDEX "VehicleModel_makeId_idx" ON "VehicleModel"("makeId");
CREATE INDEX "VehicleModel_active_idx" ON "VehicleModel"("active");

CREATE UNIQUE INDEX "VehicleSpecOption_group_normalizedKey_key" ON "VehicleSpecOption"("group", "normalizedKey");
CREATE INDEX "VehicleSpecOption_group_active_idx" ON "VehicleSpecOption"("group", "active");

CREATE UNIQUE INDEX "GeoPlace_countryCode_type_normalizedKey_key" ON "GeoPlace"("countryCode", "type", "normalizedKey");
CREATE INDEX "GeoPlace_countryCode_active_idx" ON "GeoPlace"("countryCode", "active");
CREATE INDEX "GeoPlace_region_idx" ON "GeoPlace"("region");

CREATE INDEX "TaxonomySyncRun_source_startedAt_idx" ON "TaxonomySyncRun"("source", "startedAt");
CREATE INDEX "TaxonomySyncRun_status_idx" ON "TaxonomySyncRun"("status");

CREATE INDEX "VehicleTaxonomyCandidate_kind_status_idx" ON "VehicleTaxonomyCandidate"("kind", "status");

ALTER TABLE "VehicleModel"
ADD CONSTRAINT "VehicleModel_makeId_fkey"
FOREIGN KEY ("makeId") REFERENCES "VehicleMake"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
