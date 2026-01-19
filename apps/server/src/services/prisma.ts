// @ts-ignore
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as any;

export const prisma: PrismaClient =
  globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
