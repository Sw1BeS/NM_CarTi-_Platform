-- Add variant contact/media fields for B2B flow
ALTER TABLE "RequestVariant" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RequestVariant" ADD COLUMN "mediaItems" JSONB;
ALTER TABLE "RequestVariant" ADD COLUMN "companyName" TEXT;
ALTER TABLE "RequestVariant" ADD COLUMN "contact" TEXT;
ALTER TABLE "RequestVariant" ADD COLUMN "statusHistory" JSONB;
