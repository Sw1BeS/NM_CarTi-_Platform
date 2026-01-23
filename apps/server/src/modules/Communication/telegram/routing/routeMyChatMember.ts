import { PipelineMiddleware } from '../core/types.js';
import { prisma } from '../../../../services/prisma.js';
// @ts-ignore
import { ulid } from 'ulid';

export const routeMyChatMember: PipelineMiddleware = async (ctx, next) => {
  const update = ctx.update;
  if (!update.my_chat_member) {
    return next();
  }

  const { chat, new_chat_member } = update.my_chat_member;
  const status = new_chat_member?.status;

  // We only care if bot is made admin or member in a channel/group
  if (['administrator', 'member', 'creator'].includes(status)) {
    const typeRaw = chat.type; // channel, supergroup, group
    if (['channel', 'supergroup', 'group'].includes(typeRaw)) {

      const identifier = String(chat.id);
      const name = chat.title || identifier;
      const type = typeRaw.toUpperCase().includes('CHANNEL') ? 'CHANNEL' : 'GROUP';

      try {
        // 1. Find Definition (Variant B)
        let def = await prisma.entityDefinition.findUnique({
          where: { slug: 'tg_destination' }
        });

        if (!def) {
          // Create on the fly if missing (Variant B)
          // Variant B EntityDefinition does not have workspace_id, it is global in this schema version
          def = await prisma.entityDefinition.create({
            data: {
              slug: 'tg_destination',
              name: 'Telegram Destination',
              // @ts-ignore
              status: 'ACTIVE'
            }
          });
        }

        if (def) {
          // 2. Upsert Record (Optimized)
          const existing = await prisma.entityRecord.findFirst({
            where: {
              entityId: def.id,
              data: {
                path: ['identifier'],
                equals: identifier
              }
            }
          });

          const payload = {
            id: existing ? (existing.data as any).id : `dest_${identifier}`,
            identifier,
            name,
            type,
            verified: true,
            tags: ['imported'],
            updatedAt: new Date().toISOString()
          };

          if (existing) {
             await prisma.entityRecord.update({
               where: { id: existing.id },
               data: { data: { ...(existing.data as any), ...payload } }
             });
          } else {
             await prisma.entityRecord.create({
               data: {
                 entityId: def.id,
                 data: payload
               }
             });
          }
          console.log(`[Telegram] Imported channel: ${name} (${identifier})`);
        }
      } catch (e) {
        console.error('[Telegram] Failed to import channel:', e);
      }
    }
  }

  return next();
};
