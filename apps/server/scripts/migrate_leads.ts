
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

async function getEntityTypeId(workspaceId: string, slug: string) {
    const et = await prisma.entityType.findFirst({
        where: { workspace_id: workspaceId, slug }
    });
    if (!et) throw new Error(`Entity Type '${slug}' not found for workspace ${workspaceId}.`);
    return et.id;
}

async function main() {
    console.log('👥 Migrating Leads (Lead -> Contact + Deal)...');

    // Leads are linked to BotConfig, which is linked to Workspace.
    const leads = await prisma.lead.findMany({
        include: { bot: true }
    });
    console.log(`Found ${leads.length} leads to migrate.`);

    let success = 0;
    let failed = 0;

    for (const lead of leads) {
        try {
            if (!lead.bot || !lead.bot.companyId) {
                console.warn(`⚠️ Skipping lead ${lead.id}: No Bot/Company linked`);
                failed++;
                continue;
            }

            const workspaceId = lead.bot.companyId;

            // 1. Create/Find Contact
            // Deduplicate by phone if available
            let contactId: string;

            if (lead.phone) {
                const existingContact = await prisma.contact.findFirst({
                    where: { workspace_id: workspaceId, phone_e164: lead.phone }
                });

                if (existingContact) {
                    contactId = existingContact.id;
                } else {
                    contactId = ulid();
                    await prisma.contact.create({
                        data: {
                            id: contactId,
                            workspace_id: workspaceId,
                            name: lead.clientName || 'Unknown',
                            phone_e164: lead.phone,
                            created_at: lead.createdAt,
                            updated_at: lead.updatedAt,
                            created_by: 'system_migration'
                        }
                    });
                }
            } else {
                // If no phone, create a contact anyway (maybe use Telegram ID as external key later?)
                // For now, create new contact for every anonymous lead? Or skip?
                // Let's create contact with name.
                contactId = ulid();
                await prisma.contact.create({
                    data: {
                        id: contactId,
                        workspace_id: workspaceId,
                        name: lead.clientName || 'Unknown User',
                        created_at: lead.createdAt,
                        updated_at: lead.updatedAt,
                        created_by: 'system_migration'
                    }
                });
            }

            // 2. Create Deal Record
            const dealTypeId = await getEntityTypeId(workspaceId, 'deal');

            const attributes: any = {
                title: `Deal: ${lead.clientName}`, // Default name
                status: lead.status, // e.g. NEW, WON
                source: lead.source || 'Telegram Bot',
                client_requirements: lead.request ? { text: lead.request } : {},
                notes: lead.payload ? JSON.stringify(lead.payload) : undefined
            };

            const recordId = ulid();
            await prisma.record.create({
                data: {
                    id: recordId,
                    workspace_id: workspaceId,
                    entity_type_id: dealTypeId,
                    status: 'active',
                    attributes: attributes,
                    created_at: lead.createdAt,
                    updated_at: lead.updatedAt,
                    created_by: 'system_migration'
                }
            });

            // 3. Link Deal to Contact (via RecordRelation or CaseContactLink?
            // The v4.1 schema has CaseContactLink, but Record doesn't have direct link to Contact.
            // Records usually link via `RecordRelation`. But Contact is a separate table.
            // Wait, v4.1 usually treats Contact as a special Record or uses `Case`?
            // "Case" table links Pipeline, Stage, and Contacts.
            // "Record" is for generic data.
            // The Audit Report mapped Lead -> Record(Deal).
            // But usually Deals *are* Cases in CRM logic.
            // Let's check `Case` table.
            // `model Case { pipeline_id, stage_id ... }`
            // `CaseContactLink` links Case and Contact.
            // If I map to `Record`, how do I link to `Contact`?
            // Option A: Use `RecordRelation` if Contact was also a Record.
            // Option B: Add a `contact_id` field to `Record.attributes`.
            // Let's go with Option B for simplicity in this script: `attributes.contact_id` or just rely on the fact that we migrated it.
            // BETTER: Create a `Case` as well?
            // The `Deal` definition I created is a `Record`.
            // Let's stick to `Record` for now to follow the plan. I will add `contact_id` to attributes so we don't lose the link.

            // Re-update the record to include contact link in attributes (virtual link)
            // Or ideally, `Contact` should have been an EntityType too?
            // The schema has explicit `model Contact`.
            // Let's just store `contact_id` in the Deal attributes for now.

            // Actually, let's update the attributes before creating
            attributes.contact_id = contactId;
            // attributes.bot_id = lead.botId; // Keep trace

            // Update the record created above (or just pass it in create)
             await prisma.record.update({
                where: { workspace_id_id: { workspace_id: workspaceId, id: recordId } },
                data: { attributes }
            });

            success++;
        } catch (e: any) {
            console.error(`❌ Failed to migrate lead ${lead.id}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n✅ Lead Migration Complete.`);
    console.log(`   Success: ${success}`);
    console.log(`   Failed:  ${failed}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
