-- Add explicit partner -> admin group chat mapping for B2B routing.
ALTER TABLE "PartnerCompany"
ADD COLUMN "adminGroupChatId" TEXT;

CREATE INDEX "PartnerCompany_adminGroupChatId_idx"
ON "PartnerCompany"("adminGroupChatId");
