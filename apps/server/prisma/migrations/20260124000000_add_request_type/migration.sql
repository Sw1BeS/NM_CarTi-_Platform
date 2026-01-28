-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('BUY', 'SELL');

-- AlterTable
ALTER TABLE "B2bRequest" ADD COLUMN "type" "RequestType" NOT NULL DEFAULT 'BUY';
