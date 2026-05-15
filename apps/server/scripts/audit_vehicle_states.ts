import { PrismaClient, VehicleAvailabilityState, VehiclePublicationStatus } from '@prisma/client';
import {
  deriveVehicleAvailabilityState,
  deriveVehiclePublicationStatus
} from '../src/services/vehicleState.service.js';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 200;

const vehicleStateColumnsExist = async () => {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM information_schema.columns
    WHERE table_name = 'CarListing'
      AND column_name IN ('availabilityState', 'publicationStatus')
  `;
  return Number(rows[0]?.count || 0) === 2;
};

async function main() {
  console.log(`[audit_vehicle_states] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
  const columnsExist = await vehicleStateColumnsExist();
  if (!columnsExist) {
    throw new Error('CarListing availabilityState/publicationStatus columns do not exist. Run the migration first.');
  }

  let cursorId: string | undefined;
  let scanned = 0;
  let availabilityMismatches = 0;
  let publicationMismatches = 0;

  while (true) {
    const cars = await prisma.carListing.findMany({
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        status: true,
        description: true,
        specs: true,
        availabilityState: true,
        publicationStatus: true
      }
    });
    if (!cars.length) break;

    for (const car of cars) {
      scanned += 1;
      const expectedAvailability = deriveVehicleAvailabilityState({
        status: car.status,
        title: car.title,
        description: car.description,
        specs: car.specs
      });
      const expectedPublication = deriveVehiclePublicationStatus({
        status: car.status
      });

      const needsAvailabilityUpdate = car.availabilityState !== expectedAvailability;
      const needsPublicationUpdate = car.publicationStatus !== expectedPublication;
      if (!needsAvailabilityUpdate && !needsPublicationUpdate) continue;

      if (needsAvailabilityUpdate) availabilityMismatches += 1;
      if (needsPublicationUpdate) publicationMismatches += 1;
      console.log(
        `[audit_vehicle_states] ${APPLY ? 'update' : 'would_update'} car=${car.id} ` +
        `availability=${car.availabilityState}->${expectedAvailability} ` +
        `publication=${car.publicationStatus}->${expectedPublication}`
      );

      if (APPLY) {
        await prisma.carListing.update({
          where: { id: car.id },
          data: {
            availabilityState: expectedAvailability as VehicleAvailabilityState,
            publicationStatus: expectedPublication as VehiclePublicationStatus
          }
        });
      }
    }

    cursorId = cars[cars.length - 1]?.id;
  }

  console.log(
    `[audit_vehicle_states] done scanned=${scanned} ` +
    `availability_mismatches=${availabilityMismatches} publication_mismatches=${publicationMismatches}`
  );
}

main()
  .catch((error) => {
    console.error('[audit_vehicle_states] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
