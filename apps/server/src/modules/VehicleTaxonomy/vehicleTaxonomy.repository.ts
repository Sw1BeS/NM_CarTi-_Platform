import { prisma } from '../../services/prisma.js';
import type { VehicleTaxonomySnapshot } from './vehicleTaxonomy.types.js';

const latestDate = (values: Array<Date | null | undefined>) => {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime());
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
};

class VehicleTaxonomyRepository {
  async readPublicSnapshot(params: { countryCode?: string | null } = {}): Promise<VehicleTaxonomySnapshot> {
    const countryCode = String(params.countryCode || 'UA').toUpperCase();
    const db = prisma as any;

    const [makes, specOptions, places] = await Promise.all([
      db.vehicleMake.findMany({
        where: { active: true },
        orderBy: { label: 'asc' },
        select: {
          id: true,
          slug: true,
          label: true,
          sourceMeta: true,
          updatedAt: true,
          models: {
            where: { active: true },
            orderBy: { label: 'asc' },
            select: {
              id: true,
              slug: true,
              label: true,
              sourceMeta: true,
              updatedAt: true
            }
          }
        }
      }),
      db.vehicleSpecOption.findMany({
        where: { active: true },
        orderBy: [{ group: 'asc' }, { label: 'asc' }],
        select: {
          group: true,
          slug: true,
          label: true,
          sourceMeta: true,
          updatedAt: true
        }
      }),
      db.geoPlace.findMany({
        where: {
          active: true,
          countryCode
        },
        orderBy: { label: 'asc' },
        select: {
          slug: true,
          label: true,
          sourceMeta: true,
          updatedAt: true
        }
      })
    ]);

    return {
      makes,
      specOptions,
      places,
      updatedAt: latestDate([
        ...makes.flatMap((make: any) => [make.updatedAt, ...(make.models || []).map((model: any) => model.updatedAt)]),
        ...specOptions.map((option: any) => option.updatedAt),
        ...places.map((place: any) => place.updatedAt)
      ])
    };
  }
}

export const vehicleTaxonomyRepository = new VehicleTaxonomyRepository();
