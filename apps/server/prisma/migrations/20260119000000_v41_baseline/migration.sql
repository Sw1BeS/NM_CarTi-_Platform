-- CreateEnum
CREATE TYPE "BotTemplate" AS ENUM ('CLIENT_LEAD', 'CATALOG', 'B2B');

-- CreateEnum
CREATE TYPE "BotDeliveryMode" AS ENUM ('POLLING', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'CONTACTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COLLECTING_VARIANTS', 'SHORTLIST', 'CONTACT_SHARED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'SENT_TO_CLIENT');

-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('EXTENSION', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "NormalizationType" AS ENUM ('brand', 'model', 'city');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('SENDPULSE', 'META_PIXEL', 'GOOGLE_SHEETS', 'WEBHOOK', 'ZAPIER', 'TELEGRAM_CHANNEL');

-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'DEALER', 'VIEWER');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'boolean', 'date', 'datetime', 'select', 'multiselect', 'json');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#D4AF37',
    "domain" TEXT,
    "plan" "CompanyPlan" NOT NULL DEFAULT 'FREE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioTemplate" (
    "id" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MANAGER',
    "companyId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "template" "BotTemplate" NOT NULL,
    "token" TEXT NOT NULL,
    "channelId" TEXT,
    "adminChatId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryMode" "BotDeliveryMode" NOT NULL DEFAULT 'POLLING',
    "config" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "leadCode" TEXT,
    "source" TEXT,
    "botId" TEXT,
    "userTgId" TEXT,
    "clientName" TEXT NOT NULL,
    "phone" TEXT,
    "request" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMessage" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "text" TEXT,
    "messageId" INTEGER,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bRequest" (
    "id" TEXT NOT NULL,
    "publicId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "yearMin" INTEGER,
    "yearMax" INTEGER,
    "city" TEXT,
    "language" TEXT,
    "chatId" TEXT,
    "content" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "companyId" TEXT,
    "assignedTo" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestVariant" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "VariantStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "title" TEXT,
    "price" INTEGER,
    "currency" TEXT DEFAULT 'USD',
    "year" INTEGER,
    "mileage" INTEGER,
    "location" TEXT,
    "thumbnail" TEXT,
    "specs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" SERIAL NOT NULL,
    "source" "DraftSource" NOT NULL,
    "title" TEXT NOT NULL,
    "price" TEXT,
    "url" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "destination" TEXT,
    "botId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarListing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "year" INTEGER NOT NULL,
    "mileage" INTEGER NOT NULL,
    "location" TEXT,
    "thumbnail" TEXT,
    "mediaUrls" TEXT[],
    "specs" JSONB,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "companyId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPost" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "botId" TEXT,
    "channelId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "variantId" TEXT,
    "botId" TEXT,
    "chatId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INCOMING',
    "text" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "telegramId" TEXT,
    "phone" TEXT,
    "partnerId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TG',
    "state" TEXT NOT NULL DEFAULT 'START',
    "variables" JSONB,
    "history" JSONB,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizationAlias" (
    "id" TEXT NOT NULL,
    "type" "NormalizationType" NOT NULL,
    "alias" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizationAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "botId" TEXT,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "chatId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerCommand" TEXT,
    "keywords" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'PUBLISHED',
    "entryNodeId" TEXT,
    "nodes" JSONB NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "stats" JSONB,
    "targetAudience" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" SERIAL NOT NULL,
    "autoriaApiKey" TEXT,
    "metaPixelId" TEXT,
    "metaToken" TEXT,
    "metaTestCode" TEXT,
    "navigation" JSONB,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityField" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRecord" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" CHAR(26) NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" VARCHAR(255),
    "global_status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "account_id" CHAR(26),
    "role_id" VARCHAR(64) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_types" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "entity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "entity_type_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_pii" BOOLEAN NOT NULL DEFAULT false,
    "is_searchable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "account_id" CHAR(26),
    "entity_type_id" CHAR(26) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "attributes" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_search_index" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "record_id" CHAR(26) NOT NULL,
    "account_id" CHAR(26),
    "search_vector" tsvector NOT NULL,
    "promoted" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_search_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relation_types" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "relation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_relations" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "relation_type_id" CHAR(26) NOT NULL,
    "source_record_id" CHAR(26) NOT NULL,
    "target_record_id" CHAR(26) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "record_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_external_keys" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "record_id" CHAR(26) NOT NULL,
    "entity_type_id" CHAR(26) NOT NULL,
    "source_id" CHAR(26) NOT NULL,
    "key_name" VARCHAR(64) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "key_value" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_external_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_sets" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "dictionary_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entries" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "set_id" CHAR(26) NOT NULL,
    "canonical" VARCHAR(255) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_aliases" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "entry_id" CHAR(26) NOT NULL,
    "alias" CITEXT NOT NULL,
    "rule" VARCHAR(32) NOT NULL DEFAULT 'exact',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "dictionary_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "account_id" CHAR(26),
    "slug" CITEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "pipeline_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" CITEXT,
    "phone_e164" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "pipeline_id" CHAR(26) NOT NULL,
    "stage_id" CHAR(26) NOT NULL,
    "assignee_id" CHAR(26),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_contact_links" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "case_id" CHAR(26) NOT NULL,
    "contact_id" CHAR(26) NOT NULL,
    "role" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "case_contact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "account_id" CHAR(26),
    "type" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config_enc" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "channel_id" CHAR(26) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "channel_id" CHAR(26) NOT NULL,
    "ext_thread_id" VARCHAR(255),
    "last_msg_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "content" JSONB NOT NULL,
    "external_id" VARCHAR(255),
    "direction" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_delivery" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "message_id" CHAR(26) NOT NULL,
    "status" VARCHAR(64) NOT NULL,
    "provider_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "message_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_sources" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "ingestion_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parser_definitions" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "target_entity_type_id" CHAR(26) NOT NULL,
    "slug" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "parser_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parser_versions" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "definition_id" CHAR(26) NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "parser_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "source_id" CHAR(26) NOT NULL,
    "parser_version_id" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_documents" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "job_id" CHAR(26) NOT NULL,
    "url" VARCHAR(2048),
    "doc_hash" VARCHAR(128),
    "payload_ref" VARCHAR(2048),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "raw_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_entities" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "job_id" CHAR(26) NOT NULL,
    "raw_document_id" CHAR(26) NOT NULL,
    "entity_type_id" CHAR(26) NOT NULL,
    "data" JSONB NOT NULL,
    "dedupe_key" VARCHAR(255),
    "dedupe_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "extracted_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_definitions" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "entity_type_id" CHAR(26) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_definitions" (
    "id" CHAR(26) NOT NULL,
    "workspace_id" CHAR(26) NOT NULL,
    "entity_type_id" CHAR(26) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL,
    "columns" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),

    CONSTRAINT "view_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTemplate_companyId_templateId_key" ON "CompanyTemplate"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_companyId_type_key" ON "Integration"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BotConfig_token_key" ON "BotConfig"("token");

-- CreateIndex
CREATE INDEX "BotConfig_companyId_idx" ON "BotConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_leadCode_key" ON "Lead"("leadCode");

-- CreateIndex
CREATE INDEX "Lead_botId_idx" ON "Lead"("botId");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "BotMessage_botId_chatId_createdAt_idx" ON "BotMessage"("botId", "chatId", "createdAt");

-- CreateIndex
CREATE INDEX "BotMessage_chatId_createdAt_idx" ON "BotMessage"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "B2bRequest_publicId_key" ON "B2bRequest"("publicId");

-- CreateIndex
CREATE INDEX "B2bRequest_companyId_idx" ON "B2bRequest"("companyId");

-- CreateIndex
CREATE INDEX "B2bRequest_status_idx" ON "B2bRequest"("status");

-- CreateIndex
CREATE INDEX "B2bRequest_companyId_status_idx" ON "B2bRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "RequestVariant_requestId_idx" ON "RequestVariant"("requestId");

-- CreateIndex
CREATE INDEX "Draft_scheduledAt_status_idx" ON "Draft"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "Draft_postedAt_idx" ON "Draft"("postedAt");

-- CreateIndex
CREATE INDEX "CarListing_price_idx" ON "CarListing"("price");

-- CreateIndex
CREATE INDEX "CarListing_year_idx" ON "CarListing"("year");

-- CreateIndex
CREATE INDEX "CarListing_status_idx" ON "CarListing"("status");

-- CreateIndex
CREATE INDEX "CarListing_companyId_idx" ON "CarListing"("companyId");

-- CreateIndex
CREATE INDEX "ChannelPost_channelId_idx" ON "ChannelPost"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPost_requestId_channelId_key" ON "ChannelPost"("requestId", "channelId");

-- CreateIndex
CREATE INDEX "MessageLog_requestId_idx" ON "MessageLog"("requestId");

-- CreateIndex
CREATE INDEX "MessageLog_chatId_idx" ON "MessageLog"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerUser_telegramId_key" ON "PartnerUser"("telegramId");

-- CreateIndex
CREATE INDEX "BotSession_lastActive_idx" ON "BotSession"("lastActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotSession_botId_chatId_key" ON "BotSession"("botId", "chatId");

-- CreateIndex
CREATE INDEX "NormalizationAlias_type_alias_idx" ON "NormalizationAlias"("type", "alias");

-- CreateIndex
CREATE INDEX "NormalizationAlias_companyId_idx" ON "NormalizationAlias"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizationAlias_type_alias_companyId_key" ON "NormalizationAlias"("type", "alias", "companyId");

-- CreateIndex
CREATE INDEX "PlatformEvent_companyId_createdAt_idx" ON "PlatformEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformEvent_botId_createdAt_idx" ON "PlatformEvent"("botId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformEvent_eventType_createdAt_idx" ON "PlatformEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramUpdate_createdAt_idx" ON "TelegramUpdate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_botId_updateId_key" ON "TelegramUpdate"("botId", "updateId");

-- CreateIndex
CREATE INDEX "Scenario_companyId_idx" ON "Scenario"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityDefinition_slug_key" ON "EntityDefinition"("slug");

-- CreateIndex
CREATE INDEX "EntityField_entityId_order_idx" ON "EntityField"("entityId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EntityField_entityId_key_key" ON "EntityField"("entityId", "key");

-- CreateIndex
CREATE INDEX "EntityRecord_entityId_createdAt_idx" ON "EntityRecord"("entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_deleted_at_idx" ON "workspaces"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_global_status_idx" ON "users"("global_status");

-- CreateIndex
CREATE INDEX "accounts_workspace_id_idx" ON "accounts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_workspace_id_id_key" ON "accounts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "memberships_workspace_id_idx" ON "memberships"("workspace_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_deleted_at_idx" ON "memberships"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_workspace_id_id_key" ON "memberships"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "entity_types_workspace_id_idx" ON "entity_types"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_types_workspace_id_id_key" ON "entity_types"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "field_definitions_workspace_id_entity_type_id_idx" ON "field_definitions"("workspace_id", "entity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_workspace_id_id_key" ON "field_definitions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "records_workspace_id_idx" ON "records"("workspace_id");

-- CreateIndex
CREATE INDEX "records_workspace_id_entity_type_id_idx" ON "records"("workspace_id", "entity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "records_workspace_id_id_key" ON "records"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "record_search_index_workspace_id_record_id_idx" ON "record_search_index"("workspace_id", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "record_search_index_workspace_id_record_id_key" ON "record_search_index"("workspace_id", "record_id");

-- CreateIndex
CREATE INDEX "relation_types_workspace_id_idx" ON "relation_types"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "relation_types_workspace_id_id_key" ON "relation_types"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "record_relations_workspace_id_source_record_id_idx" ON "record_relations"("workspace_id", "source_record_id");

-- CreateIndex
CREATE INDEX "record_relations_workspace_id_target_record_id_idx" ON "record_relations"("workspace_id", "target_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "record_relations_workspace_id_id_key" ON "record_relations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "record_external_keys_workspace_id_record_id_idx" ON "record_external_keys"("workspace_id", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "record_external_keys_workspace_id_id_key" ON "record_external_keys"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "dictionary_sets_workspace_id_idx" ON "dictionary_sets"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_sets_workspace_id_id_key" ON "dictionary_sets"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "dictionary_entries_workspace_id_set_id_idx" ON "dictionary_entries"("workspace_id", "set_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_workspace_id_id_key" ON "dictionary_entries"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "dictionary_aliases_workspace_id_entry_id_idx" ON "dictionary_aliases"("workspace_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_aliases_workspace_id_id_key" ON "dictionary_aliases"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "pipelines_workspace_id_idx" ON "pipelines"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_workspace_id_id_key" ON "pipelines"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "pipeline_stages_workspace_id_pipeline_id_idx" ON "pipeline_stages"("workspace_id", "pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_workspace_id_id_key" ON "pipeline_stages"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_workspace_id_pipeline_id_id_key" ON "pipeline_stages"("workspace_id", "pipeline_id", "id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_idx" ON "contacts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_id_key" ON "contacts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "cases_workspace_id_pipeline_id_idx" ON "cases"("workspace_id", "pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_workspace_id_id_key" ON "cases"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "case_contact_links_workspace_id_case_id_idx" ON "case_contact_links"("workspace_id", "case_id");

-- CreateIndex
CREATE INDEX "case_contact_links_workspace_id_contact_id_idx" ON "case_contact_links"("workspace_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_contact_links_workspace_id_id_key" ON "case_contact_links"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "channels_workspace_id_idx" ON "channels"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_workspace_id_id_key" ON "channels"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "identities_workspace_id_channel_id_idx" ON "identities"("workspace_id", "channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "identities_workspace_id_id_key" ON "identities"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_channel_id_idx" ON "conversations"("workspace_id", "channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_id_key" ON "conversations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_conversation_id_idx" ON "messages"("workspace_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_workspace_id_id_key" ON "messages"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "message_delivery_workspace_id_message_id_idx" ON "message_delivery"("workspace_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_delivery_workspace_id_id_key" ON "message_delivery"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "ingestion_sources_workspace_id_idx" ON "ingestion_sources"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_sources_workspace_id_id_key" ON "ingestion_sources"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "parser_definitions_workspace_id_target_entity_type_id_idx" ON "parser_definitions"("workspace_id", "target_entity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "parser_definitions_workspace_id_id_key" ON "parser_definitions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "parser_versions_workspace_id_definition_id_idx" ON "parser_versions"("workspace_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "parser_versions_workspace_id_id_key" ON "parser_versions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_workspace_id_source_id_idx" ON "ingestion_jobs"("workspace_id", "source_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_workspace_id_parser_version_id_idx" ON "ingestion_jobs"("workspace_id", "parser_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_jobs_workspace_id_id_key" ON "ingestion_jobs"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "raw_documents_workspace_id_job_id_idx" ON "raw_documents"("workspace_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_documents_workspace_id_id_key" ON "raw_documents"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "extracted_entities_workspace_id_job_id_idx" ON "extracted_entities"("workspace_id", "job_id");

-- CreateIndex
CREATE INDEX "extracted_entities_workspace_id_raw_document_id_idx" ON "extracted_entities"("workspace_id", "raw_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_entities_workspace_id_id_key" ON "extracted_entities"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "form_definitions_workspace_id_entity_type_id_idx" ON "form_definitions"("workspace_id", "entity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_definitions_workspace_id_id_key" ON "form_definitions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "view_definitions_workspace_id_entity_type_id_idx" ON "view_definitions"("workspace_id", "entity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "view_definitions_workspace_id_id_key" ON "view_definitions"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "CompanyTemplate" ADD CONSTRAINT "CompanyTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTemplate" ADD CONSTRAINT "CompanyTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotMessage" ADD CONSTRAINT "BotMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestVariant" ADD CONSTRAINT "RequestVariant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "B2bRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "B2bRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "B2bRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "RequestVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCompany" ADD CONSTRAINT "PartnerCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizationAlias" ADD CONSTRAINT "NormalizationAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUpdate" ADD CONSTRAINT "TelegramUpdate_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "EntityDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "EntityDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_types" ADD CONSTRAINT "entity_types_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_search_index" ADD CONSTRAINT "record_search_index_workspace_id_record_id_fkey" FOREIGN KEY ("workspace_id", "record_id") REFERENCES "records"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_search_index" ADD CONSTRAINT "record_search_index_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relation_types" ADD CONSTRAINT "relation_types_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_workspace_id_relation_type_id_fkey" FOREIGN KEY ("workspace_id", "relation_type_id") REFERENCES "relation_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_workspace_id_source_record_id_fkey" FOREIGN KEY ("workspace_id", "source_record_id") REFERENCES "records"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_workspace_id_target_record_id_fkey" FOREIGN KEY ("workspace_id", "target_record_id") REFERENCES "records"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_external_keys" ADD CONSTRAINT "record_external_keys_workspace_id_record_id_fkey" FOREIGN KEY ("workspace_id", "record_id") REFERENCES "records"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_external_keys" ADD CONSTRAINT "record_external_keys_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_external_keys" ADD CONSTRAINT "record_external_keys_workspace_id_source_id_fkey" FOREIGN KEY ("workspace_id", "source_id") REFERENCES "ingestion_sources"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_sets" ADD CONSTRAINT "dictionary_sets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_workspace_id_set_id_fkey" FOREIGN KEY ("workspace_id", "set_id") REFERENCES "dictionary_sets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_aliases" ADD CONSTRAINT "dictionary_aliases_workspace_id_entry_id_fkey" FOREIGN KEY ("workspace_id", "entry_id") REFERENCES "dictionary_entries"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_pipeline_id_fkey" FOREIGN KEY ("workspace_id", "pipeline_id") REFERENCES "pipelines"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_workspace_id_pipeline_id_fkey" FOREIGN KEY ("workspace_id", "pipeline_id") REFERENCES "pipelines"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_workspace_id_pipeline_id_stage_id_fkey" FOREIGN KEY ("workspace_id", "pipeline_id", "stage_id") REFERENCES "pipeline_stages"("workspace_id", "pipeline_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contact_links" ADD CONSTRAINT "case_contact_links_workspace_id_case_id_fkey" FOREIGN KEY ("workspace_id", "case_id") REFERENCES "cases"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contact_links" ADD CONSTRAINT "case_contact_links_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_account_id_fkey" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_workspace_id_channel_id_fkey" FOREIGN KEY ("workspace_id", "channel_id") REFERENCES "channels"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_channel_id_fkey" FOREIGN KEY ("workspace_id", "channel_id") REFERENCES "channels"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_conversation_id_fkey" FOREIGN KEY ("workspace_id", "conversation_id") REFERENCES "conversations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_delivery" ADD CONSTRAINT "message_delivery_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_sources" ADD CONSTRAINT "ingestion_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parser_definitions" ADD CONSTRAINT "parser_definitions_workspace_id_target_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "target_entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parser_versions" ADD CONSTRAINT "parser_versions_workspace_id_definition_id_fkey" FOREIGN KEY ("workspace_id", "definition_id") REFERENCES "parser_definitions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_workspace_id_source_id_fkey" FOREIGN KEY ("workspace_id", "source_id") REFERENCES "ingestion_sources"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_workspace_id_parser_version_id_fkey" FOREIGN KEY ("workspace_id", "parser_version_id") REFERENCES "parser_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_documents" ADD CONSTRAINT "raw_documents_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "ingestion_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "ingestion_jobs"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_workspace_id_raw_document_id_fkey" FOREIGN KEY ("workspace_id", "raw_document_id") REFERENCES "raw_documents"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_definitions" ADD CONSTRAINT "view_definitions_workspace_id_entity_type_id_fkey" FOREIGN KEY ("workspace_id", "entity_type_id") REFERENCES "entity_types"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

