/*
  Warnings:

  - You are about to drop the `Company` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CompanyTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[telegram_user_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "BotConfig" DROP CONSTRAINT "BotConfig_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyTemplate" DROP CONSTRAINT "CompanyTemplate_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyTemplate" DROP CONSTRAINT "CompanyTemplate_templateId_fkey";

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_companyId_fkey";

-- DropForeignKey
ALTER TABLE "NormalizationAlias" DROP CONSTRAINT "NormalizationAlias_companyId_fkey";

-- DropForeignKey
ALTER TABLE "PartnerCompany" DROP CONSTRAINT "PartnerCompany_companyId_fkey";

-- DropForeignKey
ALTER TABLE "PartnerUser" DROP CONSTRAINT "PartnerUser_companyId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformEvent" DROP CONSTRAINT "PlatformEvent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Scenario" DROP CONSTRAINT "Scenario_companyId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_companyId_fkey";

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "branding" JSONB,
ADD COLUMN     "modules" JSONB;

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
ALTER TABLE "users" ADD COLUMN     "name" VARCHAR(255),
ADD COLUMN     "telegram_user_id" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "settings" SET DEFAULT '{}'::jsonb;

-- DropTable
DROP TABLE "Company";

-- DropTable
DROP TABLE "CompanyTemplate";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "company_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_templates_companyId_templateId_key" ON "company_templates"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id");

-- AddForeignKey
ALTER TABLE "company_templates" ADD CONSTRAINT "company_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_templates" ADD CONSTRAINT "company_templates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCompany" ADD CONSTRAINT "PartnerCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizationAlias" ADD CONSTRAINT "NormalizationAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
