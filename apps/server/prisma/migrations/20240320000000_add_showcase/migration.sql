-- CreateTable
CREATE TABLE "Showcase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "botId" TEXT,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Showcase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Showcase_slug_key" ON "Showcase"("slug");

-- CreateIndex
CREATE INDEX "Showcase_workspaceId_idx" ON "Showcase"("workspaceId");

-- CreateIndex
CREATE INDEX "Showcase_botId_idx" ON "Showcase"("botId");

-- AddForeignKey
ALTER TABLE "Showcase" ADD CONSTRAINT "Showcase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showcase" ADD CONSTRAINT "Showcase_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
