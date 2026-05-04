DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'NormalizationType' AND e.enumlabel = 'intent'
  ) THEN
    ALTER TYPE "NormalizationType" ADD VALUE 'intent';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "OrchestrationPolicy" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "internalDocsPreferred" BOOLEAN NOT NULL DEFAULT true,
  "officialDocsPreferred" BOOLEAN NOT NULL DEFAULT true,
  "externalRefsMode" TEXT NOT NULL DEFAULT 'SUPPLEMENTAL_ONLY',
  "autoCanonicalWrite" BOOLEAN NOT NULL DEFAULT false,
  "promptRefinementEnabled" BOOLEAN NOT NULL DEFAULT true,
  "councilRequiresManualTrigger" BOOLEAN NOT NULL DEFAULT true,
  "maxFreshSkillPackAgeHours" INTEGER NOT NULL DEFAULT 72,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrchestrationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrchestrationPolicy_companyId_key" ON "OrchestrationPolicy"("companyId");
CREATE INDEX IF NOT EXISTS "OrchestrationPolicy_companyId_idx" ON "OrchestrationPolicy"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrchestrationPolicy_companyId_fkey'
  ) THEN
    ALTER TABLE "OrchestrationPolicy"
      ADD CONSTRAINT "OrchestrationPolicy_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationIntake" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "title" TEXT,
  "inputText" TEXT,
  "sourceUrl" TEXT,
  "normalizedText" TEXT,
  "classification" TEXT,
  "relatedEntities" JSONB,
  "metadata" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationIntake_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationIntake_companyId_createdAt_idx" ON "AutomationIntake"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationIntake_companyId_sourceType_idx" ON "AutomationIntake"("companyId", "sourceType");
CREATE INDEX IF NOT EXISTS "AutomationIntake_companyId_status_idx" ON "AutomationIntake"("companyId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationIntake_companyId_fkey'
  ) THEN
    ALTER TABLE "AutomationIntake"
      ADD CONSTRAINT "AutomationIntake_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationSourceRef" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "intakeId" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "trustLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "freshnessState" TEXT NOT NULL DEFAULT 'REVIEW',
  "rank" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationSourceRef_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationSourceRef_companyId_refType_idx" ON "AutomationSourceRef"("companyId", "refType");
CREATE INDEX IF NOT EXISTS "AutomationSourceRef_intakeId_rank_idx" ON "AutomationSourceRef"("intakeId", "rank");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSourceRef_companyId_fkey'
  ) THEN
    ALTER TABLE "AutomationSourceRef"
      ADD CONSTRAINT "AutomationSourceRef_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSourceRef_intakeId_fkey'
  ) THEN
    ALTER TABLE "AutomationSourceRef"
      ADD CONSTRAINT "AutomationSourceRef_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "AutomationIntake"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationSkillPack" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "intakeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "taskContext" JSONB,
  "relatedEntities" JSONB,
  "sourcesUsed" JSONB,
  "internalDocsUsed" JSONB,
  "officialDocsUsed" JSONB,
  "externalReferencesUsed" JSONB,
  "bestPracticesUsed" JSONB,
  "freshnessState" TEXT NOT NULL DEFAULT 'REVIEW',
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "suggestedPromptAdditions" JSONB,
  "suggestedTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "operatorNotes" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSkillPack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationSkillPack_companyId_freshnessState_idx" ON "AutomationSkillPack"("companyId", "freshnessState");
CREATE INDEX IF NOT EXISTS "AutomationSkillPack_companyId_generatedAt_idx" ON "AutomationSkillPack"("companyId", "generatedAt");
CREATE INDEX IF NOT EXISTS "AutomationSkillPack_intakeId_generatedAt_idx" ON "AutomationSkillPack"("intakeId", "generatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSkillPack_companyId_fkey'
  ) THEN
    ALTER TABLE "AutomationSkillPack"
      ADD CONSTRAINT "AutomationSkillPack_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationSkillPack_intakeId_fkey'
  ) THEN
    ALTER TABLE "AutomationSkillPack"
      ADD CONSTRAINT "AutomationSkillPack_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "AutomationIntake"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationRun" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "intakeId" TEXT,
  "skillPackId" TEXT,
  "runType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "triggerSource" TEXT NOT NULL DEFAULT 'MANUAL',
  "beforeText" TEXT,
  "afterText" TEXT,
  "matchedAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "explanation" TEXT,
  "result" JSONB,
  "createdBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRun_companyId_runType_createdAt_idx" ON "AutomationRun"("companyId", "runType", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_companyId_status_idx" ON "AutomationRun"("companyId", "status");
CREATE INDEX IF NOT EXISTS "AutomationRun_intakeId_idx" ON "AutomationRun"("intakeId");
CREATE INDEX IF NOT EXISTS "AutomationRun_skillPackId_idx" ON "AutomationRun"("skillPackId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationRun_companyId_fkey'
  ) THEN
    ALTER TABLE "AutomationRun"
      ADD CONSTRAINT "AutomationRun_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationRun_intakeId_fkey'
  ) THEN
    ALTER TABLE "AutomationRun"
      ADD CONSTRAINT "AutomationRun_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "AutomationIntake"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationRun_skillPackId_fkey'
  ) THEN
    ALTER TABLE "AutomationRun"
      ADD CONSTRAINT "AutomationRun_skillPackId_fkey"
      FOREIGN KEY ("skillPackId") REFERENCES "AutomationSkillPack"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationRunStep" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "details" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRunStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRunStep_runId_sequence_idx" ON "AutomationRunStep"("runId", "sequence");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationRunStep_runId_fkey'
  ) THEN
    ALTER TABLE "AutomationRunStep"
      ADD CONSTRAINT "AutomationRunStep_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportSource" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "intakeId" TEXT,
  "name" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REGISTERED',
  "sourceUri" TEXT,
  "contentType" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "analyzedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportSource_companyId_sourceType_idx" ON "ImportSource"("companyId", "sourceType");
CREATE INDEX IF NOT EXISTS "ImportSource_companyId_status_idx" ON "ImportSource"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportSource_intakeId_idx" ON "ImportSource"("intakeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportSource_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportSource"
      ADD CONSTRAINT "ImportSource_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportSource_intakeId_fkey'
  ) THEN
    ALTER TABLE "ImportSource"
      ADD CONSTRAINT "ImportSource_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "AutomationIntake"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportBatch" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "importSourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REGISTERED',
  "batchLabel" TEXT,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "rawPayload" JSONB,
  "analysisSummary" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportBatch_companyId_status_idx" ON "ImportBatch"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportBatch_importSourceId_createdAt_idx" ON "ImportBatch"("importSourceId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportBatch_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportBatch"
      ADD CONSTRAINT "ImportBatch_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportBatch_importSourceId_fkey'
  ) THEN
    ALTER TABLE "ImportBatch"
      ADD CONSTRAINT "ImportBatch_importSourceId_fkey"
      FOREIGN KEY ("importSourceId") REFERENCES "ImportSource"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportItem" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "externalId" TEXT,
  "sourceUrl" TEXT,
  "mimeType" TEXT,
  "title" TEXT,
  "contentText" TEXT,
  "rawPayload" JSONB,
  "classification" JSONB,
  "status" TEXT NOT NULL DEFAULT 'REGISTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportItem_companyId_status_idx" ON "ImportItem"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportItem_importBatchId_createdAt_idx" ON "ImportItem"("importBatchId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImportItem_externalId_idx" ON "ImportItem"("externalId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportItem_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportItem"
      ADD CONSTRAINT "ImportItem_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportItem_importBatchId_fkey'
  ) THEN
    ALTER TABLE "ImportItem"
      ADD CONSTRAINT "ImportItem_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportLinkageCandidate" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "importItemId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reason" TEXT,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportLinkageCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportLinkageCandidate_companyId_status_idx" ON "ImportLinkageCandidate"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportLinkageCandidate_importBatchId_confidence_idx" ON "ImportLinkageCandidate"("importBatchId", "confidence");
CREATE INDEX IF NOT EXISTS "ImportLinkageCandidate_importItemId_idx" ON "ImportLinkageCandidate"("importItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportLinkageCandidate_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportLinkageCandidate"
      ADD CONSTRAINT "ImportLinkageCandidate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportLinkageCandidate_importBatchId_fkey'
  ) THEN
    ALTER TABLE "ImportLinkageCandidate"
      ADD CONSTRAINT "ImportLinkageCandidate_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportLinkageCandidate_importItemId_fkey'
  ) THEN
    ALTER TABLE "ImportLinkageCandidate"
      ADD CONSTRAINT "ImportLinkageCandidate_importItemId_fkey"
      FOREIGN KEY ("importItemId") REFERENCES "ImportItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportRecommendedAction" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "importItemId" TEXT,
  "actionType" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "reason" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportRecommendedAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportRecommendedAction_companyId_priority_idx" ON "ImportRecommendedAction"("companyId", "priority");
CREATE INDEX IF NOT EXISTS "ImportRecommendedAction_companyId_status_idx" ON "ImportRecommendedAction"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportRecommendedAction_importBatchId_actionType_idx" ON "ImportRecommendedAction"("importBatchId", "actionType");
CREATE INDEX IF NOT EXISTS "ImportRecommendedAction_importItemId_idx" ON "ImportRecommendedAction"("importItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportRecommendedAction_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportRecommendedAction"
      ADD CONSTRAINT "ImportRecommendedAction_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportRecommendedAction_importBatchId_fkey'
  ) THEN
    ALTER TABLE "ImportRecommendedAction"
      ADD CONSTRAINT "ImportRecommendedAction_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportRecommendedAction_importItemId_fkey'
  ) THEN
    ALTER TABLE "ImportRecommendedAction"
      ADD CONSTRAINT "ImportRecommendedAction_importItemId_fkey"
      FOREIGN KEY ("importItemId") REFERENCES "ImportItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ImportWriteCandidate" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "importItemId" TEXT,
  "targetTable" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "reason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportWriteCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportWriteCandidate_companyId_status_idx" ON "ImportWriteCandidate"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ImportWriteCandidate_importBatchId_targetTable_idx" ON "ImportWriteCandidate"("importBatchId", "targetTable");
CREATE INDEX IF NOT EXISTS "ImportWriteCandidate_importItemId_idx" ON "ImportWriteCandidate"("importItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportWriteCandidate_companyId_fkey'
  ) THEN
    ALTER TABLE "ImportWriteCandidate"
      ADD CONSTRAINT "ImportWriteCandidate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportWriteCandidate_importBatchId_fkey'
  ) THEN
    ALTER TABLE "ImportWriteCandidate"
      ADD CONSTRAINT "ImportWriteCandidate_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportWriteCandidate_importItemId_fkey'
  ) THEN
    ALTER TABLE "ImportWriteCandidate"
      ADD CONSTRAINT "ImportWriteCandidate_importItemId_fkey"
      FOREIGN KEY ("importItemId") REFERENCES "ImportItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "AutomationReviewQueue" (
  "id" TEXT NOT NULL,
  "companyId" CHAR(26) NOT NULL,
  "queueType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "payload" JSONB,
  "intakeId" TEXT,
  "importBatchId" TEXT,
  "writeCandidateId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationReviewQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationReviewQueue_companyId_queueType_status_idx" ON "AutomationReviewQueue"("companyId", "queueType", "status");
CREATE INDEX IF NOT EXISTS "AutomationReviewQueue_companyId_createdAt_idx" ON "AutomationReviewQueue"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationReviewQueue_intakeId_idx" ON "AutomationReviewQueue"("intakeId");
CREATE INDEX IF NOT EXISTS "AutomationReviewQueue_importBatchId_idx" ON "AutomationReviewQueue"("importBatchId");
CREATE INDEX IF NOT EXISTS "AutomationReviewQueue_writeCandidateId_idx" ON "AutomationReviewQueue"("writeCandidateId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReviewQueue_companyId_fkey'
  ) THEN
    ALTER TABLE "AutomationReviewQueue"
      ADD CONSTRAINT "AutomationReviewQueue_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReviewQueue_intakeId_fkey'
  ) THEN
    ALTER TABLE "AutomationReviewQueue"
      ADD CONSTRAINT "AutomationReviewQueue_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "AutomationIntake"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReviewQueue_importBatchId_fkey'
  ) THEN
    ALTER TABLE "AutomationReviewQueue"
      ADD CONSTRAINT "AutomationReviewQueue_importBatchId_fkey"
      FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReviewQueue_writeCandidateId_fkey'
  ) THEN
    ALTER TABLE "AutomationReviewQueue"
      ADD CONSTRAINT "AutomationReviewQueue_writeCandidateId_fkey"
      FOREIGN KEY ("writeCandidateId") REFERENCES "ImportWriteCandidate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
