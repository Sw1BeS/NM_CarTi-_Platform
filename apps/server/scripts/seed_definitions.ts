
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Entity Definitions...');

  // 1. Get all workspaces (to install definitions for each - or just Global if system supported it,
  // but v4.1 schema links EntityType to Workspace, so we must install per workspace)
  // Ideally, we should have a "System" workspace or "Global" definitions, but the schema says:
  // EntityType -> Workspace. So we must loop all workspaces.
  const workspaces = await prisma.workspace.findMany();
  console.log(`Found ${workspaces.length} workspaces.`);

  const definitionsDir = path.resolve(__dirname, '../src/modules/v41/definitions');
  const files = await fs.readdir(definitionsDir);

  for (const workspace of workspaces) {
    console.log(`\nProcessing Workspace: ${workspace.name} (${workspace.slug})`);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(definitionsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const def = JSON.parse(content);

      console.log(`  - Upserting Entity: ${def.name} (${def.slug})`);

      // 1. Upsert EntityType
      // We search by slug + workspace_id.
      // Note: id is CUID/UUID, so we findFirst then update or create.
      let entityType = await prisma.entityType.findFirst({
        where: { workspace_id: workspace.id, slug: def.slug }
      });

      if (entityType) {
        entityType = await prisma.entityType.update({
          where: { workspace_id_id: { workspace_id: workspace.id, id: entityType.id } },
          data: {
            name: def.name,
            capabilities: def.capabilities || {},
            updated_at: new Date()
          }
        });
      } else {
        // Generate a new ID (using ulid or similar if available, else let DB or default handle if configured)
        // Schema says id is char(26), usually ULID. Prisma needs us to provide it if no default?
        // Let's use a simple random string generator or ulid library if imported.
        // For script simplicity, we'll try to rely on Prisma defaults if they exist (cuid/uuid)
        // BUT schema says @db.Char(26), suggesting ULID.
        // The codebase uses `ulid` package. Let's import it.
        const { ulid } = await import('ulid');

        entityType = await prisma.entityType.create({
          data: {
            id: ulid(),
            workspace_id: workspace.id,
            slug: def.slug,
            name: def.name,
            capabilities: def.capabilities || {},
            created_by: 'system',
            updated_by: 'system'
          }
        });
      }

      // 2. Upsert Fields
      let order = 0;
      for (const field of def.fields) {
        order += 10;
        // Check existing
        let existingField = await prisma.fieldDefinition.findFirst({
            where: {
                workspace_id: workspace.id,
                entity_type_id: entityType.id,
                slug: field.key
            }
        });

        const fieldData = {
            slug: field.key,
            type: field.type,
            config: {
                label: field.label,
                required: field.required || false,
                default: field.default,
                options: field.config?.options,
                multiline: field.config?.multiline,
                order: order
            },
            is_searchable: true,
            updated_by: 'system'
        };

        if (existingField) {
             await prisma.fieldDefinition.update({
                where: { workspace_id_id: { workspace_id: workspace.id, id: existingField.id } },
                data: {
                    ...fieldData,
                    updated_at: new Date()
                }
             });
        } else {
            const { ulid } = await import('ulid');
            await prisma.fieldDefinition.create({
                data: {
                    id: ulid(),
                    workspace_id: workspace.id,
                    entity_type_id: entityType.id,
                    ...fieldData,
                    created_by: 'system'
                }
            });
        }
      }
    }
  }

  console.log('\n✅ Definitions Seeded Successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
