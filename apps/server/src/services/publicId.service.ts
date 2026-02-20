import { prisma } from './prisma.js';

const pad6 = (value: number) => String(value).padStart(6, '0');

class PublicIdService {
  async nextB2bRequestId(scope = 'CD', now = new Date()): Promise<string> {
    const year = now.getUTCFullYear();

    const seq = await prisma.$transaction(async tx => {
      const row = await tx.publicSequence.upsert({
        where: {
          scope_year: {
            scope,
            year
          }
        },
        create: {
          scope,
          year,
          lastValue: 1
        },
        update: {
          lastValue: {
            increment: 1
          }
        }
      });

      return row.lastValue;
    });

    return `${scope}-${year}-${pad6(seq)}`;
  }
}

export const publicIdService = new PublicIdService();
