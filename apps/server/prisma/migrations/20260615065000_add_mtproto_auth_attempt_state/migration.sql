ALTER TABLE "MTProtoConnector"
  ADD COLUMN "authSessionString" TEXT,
  ADD COLUMN "authPhoneCodeHash" TEXT,
  ADD COLUMN "authPhone" TEXT,
  ADD COLUMN "authApiId" INTEGER,
  ADD COLUMN "authApiHash" TEXT,
  ADD COLUMN "authSentCodeType" TEXT,
  ADD COLUMN "authNextCodeType" TEXT,
  ADD COLUMN "authCodeLength" INTEGER,
  ADD COLUMN "authTimeoutAt" TIMESTAMP(3),
  ADD COLUMN "authRequestedAt" TIMESTAMP(3);
