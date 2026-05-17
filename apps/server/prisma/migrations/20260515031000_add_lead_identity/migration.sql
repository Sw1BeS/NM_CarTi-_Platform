-- Add durable lead identity links for Telegram, phone, web, and future Meta identities.

CREATE TABLE IF NOT EXISTS "LeadIdentity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'HIGH',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB,
  CONSTRAINT "LeadIdentity_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LeadIdentity_leadId_fkey'
  ) THEN
    ALTER TABLE "LeadIdentity"
      ADD CONSTRAINT "LeadIdentity_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "LeadIdentity_companyId_provider_externalId_key"
  ON "LeadIdentity"("companyId", "provider", "externalId");
CREATE INDEX IF NOT EXISTS "LeadIdentity_leadId_idx" ON "LeadIdentity"("leadId");
CREATE INDEX IF NOT EXISTS "LeadIdentity_companyId_provider_idx" ON "LeadIdentity"("companyId", "provider");

INSERT INTO "LeadIdentity" (
  "id", "companyId", "leadId", "provider", "externalId", "confidence", "payload", "firstSeenAt", "lastSeenAt"
)
SELECT
  'lead_identity_' || md5(l."companyId" || ':TELEGRAM:' || l."userTgId"),
  l."companyId",
  l."id",
  'TELEGRAM',
  l."userTgId",
  'HIGH',
  jsonb_build_object('source', 'Lead.userTgId', 'backfilledAt', CURRENT_TIMESTAMP),
  l."createdAt",
  l."updatedAt"
FROM "Lead" l
WHERE l."companyId" IS NOT NULL
  AND l."userTgId" IS NOT NULL
  AND btrim(l."userTgId") <> ''
ON CONFLICT ("companyId", "provider", "externalId") DO NOTHING;

INSERT INTO "LeadIdentity" (
  "id", "companyId", "leadId", "provider", "externalId", "confidence", "payload", "firstSeenAt", "lastSeenAt"
)
SELECT
  'lead_identity_' || md5(l."companyId" || ':PHONE:' || l."phone"),
  l."companyId",
  l."id",
  'PHONE',
  l."phone",
  'HIGH',
  jsonb_build_object('source', 'Lead.phone', 'backfilledAt', CURRENT_TIMESTAMP),
  l."createdAt",
  l."updatedAt"
FROM "Lead" l
WHERE l."companyId" IS NOT NULL
  AND l."phone" IS NOT NULL
  AND btrim(l."phone") <> ''
ON CONFLICT ("companyId", "provider", "externalId") DO NOTHING;

INSERT INTO "LeadIdentity" (
  "id", "companyId", "leadId", "provider", "externalId", "confidence", "payload", "firstSeenAt", "lastSeenAt"
)
SELECT
  'lead_identity_' || md5(l."companyId" || ':TELEGRAM:' || (l."payload"->>'telegramUserId')),
  l."companyId",
  l."id",
  'TELEGRAM',
  l."payload"->>'telegramUserId',
  'HIGH',
  jsonb_build_object('source', 'Lead.payload.telegramUserId', 'backfilledAt', CURRENT_TIMESTAMP),
  l."createdAt",
  l."updatedAt"
FROM "Lead" l
WHERE l."companyId" IS NOT NULL
  AND l."payload"->>'telegramUserId' IS NOT NULL
  AND btrim(l."payload"->>'telegramUserId') <> ''
ON CONFLICT ("companyId", "provider", "externalId") DO NOTHING;
