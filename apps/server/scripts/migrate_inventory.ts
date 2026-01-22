
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

// Helper to find EntityType by slug
async function getEntityTypeId(workspaceId: string, slug: string) {
    const et = await prisma.entityType.findFirst({
        where: { workspace_id: workspaceId, slug }
    });
    if (!et) throw new Error(`Entity Type '${slug}' not found for workspace ${workspaceId}. Run seed_definitions.ts first.`);
    return et.id;
}

async function main() {
    console.log('🚗 Migrating Inventory (CarListing -> Record:Car)...');

    // 1. Get all CarListings
    const listings = await prisma.carListing.findMany({
        where: { status: { not: 'MIGRATED' } } // Optional: prevents re-running if we marked them
    });
    console.log(`Found ${listings.length} listings to migrate.`);

    let success = 0;
    let failed = 0;

    for (const car of listings) {
        try {
            if (!car.companyId) {
                console.warn(`⚠️ Skipping car ${car.id}: No companyId`);
                failed++;
                continue;
            }

            // Ensure Workspace exists (legacy companyId -> workspace.id)
            const workspace = await prisma.workspace.findUnique({ where: { id: car.companyId } });
            if (!workspace) {
                console.warn(`⚠️ Skipping car ${car.id}: Workspace ${car.companyId} not found`);
                failed++;
                continue;
            }

            const entityTypeId = await getEntityTypeId(workspace.id, 'car');

            // Map attributes
            const attributes: any = {
                title: car.title,
                price: car.price,
                currency: car.currency,
                year: car.year,
                mileage: car.mileage,
                location: car.location,
                description: car.description,
                source_url: car.sourceUrl,
                status: car.status,
                images: car.mediaUrls || [],
                // Specs mapping (flatten json)
                ...(typeof car.specs === 'object' ? car.specs : {})
            };

            // Upsert Record (use car.id as record.id if it fits, else generic)
            // car.id is String. Record.id is Char(26).
            // If car.id matches format, we use it. If not, we generate new and store mapping in ExternalKey?
            // For simplicity, we generate new ULID and store old ID in a field 'legacy_id' if needed,
            // OR if car.id is already compatible (CUID/UUID), we might try to use it.
            // But Record.id is char(26), CUID is 25. Close enough?
            // Safer to generate new ULID.

            const newRecordId = ulid();

            await prisma.record.create({
                data: {
                    id: newRecordId,
                    workspace_id: workspace.id,
                    entity_type_id: entityTypeId,
                    status: 'active',
                    attributes: attributes,
                    created_at: car.createdAt,
                    updated_at: car.updatedAt,
                    created_by: 'system_migration'
                }
            });

            // Optional: Mark old record as migrated?
            // await prisma.carListing.update({ where: { id: car.id }, data: { status: 'MIGRATED' } });

            success++;
        } catch (e: any) {
            console.error(`❌ Failed to migrate car ${car.id}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n✅ Migration Complete.`);
    console.log(`   Success: ${success}`);
    console.log(`   Failed:  ${failed}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
