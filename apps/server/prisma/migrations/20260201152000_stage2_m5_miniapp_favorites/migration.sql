-- CreateTable
CREATE TABLE "MiniAppFavorite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "carListingId" TEXT NOT NULL,
    "tgUserId" TEXT,
    "visitorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniAppFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MiniAppFavorite_companyId_idx" ON "MiniAppFavorite"("companyId");
CREATE INDEX "MiniAppFavorite_tgUserId_idx" ON "MiniAppFavorite"("tgUserId");
CREATE INDEX "MiniAppFavorite_visitorId_idx" ON "MiniAppFavorite"("visitorId");

-- CreateIndex (Unique)
CREATE UNIQUE INDEX "MiniAppFavorite_companyId_carListingId_tgUserId_key" ON "MiniAppFavorite"("companyId", "carListingId", "tgUserId");
CREATE UNIQUE INDEX "MiniAppFavorite_companyId_carListingId_visitorId_key" ON "MiniAppFavorite"("companyId", "carListingId", "visitorId");

-- AddForeignKey
ALTER TABLE "MiniAppFavorite" ADD CONSTRAINT "MiniAppFavorite_carListingId_fkey" FOREIGN KEY ("carListingId") REFERENCES "CarListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
