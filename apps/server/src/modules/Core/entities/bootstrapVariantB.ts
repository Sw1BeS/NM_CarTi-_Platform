import { prisma } from '../../../services/prisma.js';
// @ts-ignore
import { ulid } from 'ulid';

export async function bootstrapVariantB() {
  console.log('🌱 Bootstrapping Variant B Entities (Post Template)...');

  try {
      // Post Template
      const slug = 'post_template';
      const existing = await prisma.entityDefinition.findFirst({ where: { slug } });

      if (!existing) {
         const def = await prisma.entityDefinition.create({
            data: {
                slug,
                name: 'Post Template',
                status: 'ACTIVE'
            }
         });

         const fields = [
            { key: 'name', label: 'Name', type: 'text', required: true, order: 10 },
            { key: 'content', label: 'Content', type: 'text', order: 20, config: { multiline: true } },
            { key: 'lang', label: 'Language', type: 'select', order: 30, config: { options: ['UA', 'RU'] } }
         ];

         await prisma.entityField.createMany({
            data: fields.map((f: any) => ({
                id: ulid(),
                entityId: def.id,
                ...f
            }))
         });
         console.log('✅ Created post_template definition');
      }
  } catch (e) {
      console.error('Bootstrapping failed:', e);
  }
}
