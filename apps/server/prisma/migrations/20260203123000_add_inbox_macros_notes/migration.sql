-- Add inbox macros and notes tables
CREATE TABLE "ChatMacro" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ChatMacro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMacro_companyId_shortcut_key" ON "ChatMacro"("companyId", "shortcut");
CREATE INDEX "ChatMacro_companyId_idx" ON "ChatMacro"("companyId");

ALTER TABLE "ChatMacro" ADD CONSTRAINT "ChatMacro_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ChatNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatNote_companyId_chatId_key" ON "ChatNote"("companyId", "chatId");
CREATE INDEX "ChatNote_companyId_chatId_idx" ON "ChatNote"("companyId", "chatId");

ALTER TABLE "ChatNote" ADD CONSTRAINT "ChatNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
