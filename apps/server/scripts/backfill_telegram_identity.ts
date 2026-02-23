import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 200;

const genericNames = new Set(['', 'client', 'user', 'unknown', 'unknown user']);

const normalizeObject = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const normalizeString = (value: unknown) => {
  const raw = String(value || '').trim();
  return raw || undefined;
};

const isGenericName = (value: unknown) => genericNames.has(String(value || '').trim().toLowerCase());

const resolveName = (input: {
  currentName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  clientName?: string;
}) => {
  if (normalizeString(input.currentName)) return normalizeString(input.currentName);
  const fullName = [input.firstName, input.lastName].map(normalizeString).filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  const username = normalizeString(input.username);
  if (username) return `@${username.replace(/^@/, '')}`;
  const clientName = normalizeString(input.clientName);
  if (clientName && !isGenericName(clientName)) return clientName;
  return undefined;
};

const extractTelegramIdentityFromMessage = (payload: unknown) => {
  const root = normalizeObject(payload);
  const from = normalizeObject(root.from || root.user || root.sender);
  const chat = normalizeObject(root.chat);

  return {
    fromId: normalizeString(from.id),
    username: normalizeString(from.username)?.replace(/^@/, ''),
    firstName: normalizeString(from.first_name),
    lastName: normalizeString(from.last_name),
    chatId: normalizeString(chat.id)
  };
};

async function main() {
  console.log(`[backfill_telegram_identity] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  let cursorId: string | undefined;
  let scanned = 0;
  let changed = 0;

  while (true) {
    const leads = await prisma.lead.findMany({
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE
    });

    if (!leads.length) break;

    for (const lead of leads) {
      scanned += 1;
      const payload = normalizeObject(lead.payload);
      const existingTelegramUserId = normalizeString(payload.telegramUserId || lead.userTgId);
      const existingTelegramChatId = normalizeString(payload.telegramChatId || lead.userTgId);
      const existingTelegramUsername = normalizeString(payload.telegramUsername)?.replace(/^@/, '');
      const existingTelegramName = normalizeString(payload.telegramName);

      const needsBackfill = !existingTelegramUserId || !existingTelegramChatId || !existingTelegramUsername || !existingTelegramName;
      if (!needsBackfill) continue;

      const sourceLead = normalizeString(lead.source)?.toUpperCase() || '';
      const sourcePayload = normalizeString(payload.source)?.toUpperCase() || '';
      const hasTelegramSignal = Boolean(
        existingTelegramUserId
        || existingTelegramChatId
        || existingTelegramUsername
        || sourceLead.includes('TELEGRAM')
        || sourcePayload.includes('TELEGRAM')
      );
      if (!hasTelegramSignal) continue;

      const candidateChatIds = Array.from(
        new Set([
          existingTelegramChatId,
          existingTelegramUserId,
          normalizeString(lead.userTgId)
        ].filter(Boolean))
      ) as string[];

      let identity = {
        fromId: undefined as string | undefined,
        username: undefined as string | undefined,
        firstName: undefined as string | undefined,
        lastName: undefined as string | undefined,
        chatId: undefined as string | undefined
      };

      if (candidateChatIds.length) {
        const msg = await prisma.botMessage.findFirst({
          where: {
            direction: 'INCOMING',
            chatId: { in: candidateChatIds },
            ...(lead.botId ? { botId: lead.botId } : {})
          },
          orderBy: { createdAt: 'desc' },
          select: { payload: true }
        });
        if (msg?.payload) {
          identity = extractTelegramIdentityFromMessage(msg.payload);
        }
      }

      const nextPayload: Record<string, any> = { ...payload };
      const nextTelegramUserId = existingTelegramUserId || identity.fromId;
      const nextTelegramChatId = existingTelegramChatId || identity.chatId || nextTelegramUserId;
      const nextTelegramUsername = existingTelegramUsername || identity.username;
      const nextTelegramName = resolveName({
        currentName: existingTelegramName,
        firstName: identity.firstName,
        lastName: identity.lastName,
        username: nextTelegramUsername,
        clientName: lead.clientName
      });

      const hasResolvedIdentityCore = Boolean(nextTelegramUserId || nextTelegramChatId || nextTelegramUsername);
      if (!hasResolvedIdentityCore) continue;

      if (nextTelegramUserId) nextPayload.telegramUserId = nextTelegramUserId;
      if (nextTelegramChatId) nextPayload.telegramChatId = nextTelegramChatId;
      if (nextTelegramUsername) nextPayload.telegramUsername = nextTelegramUsername;
      if (nextTelegramName) nextPayload.telegramName = nextTelegramName;

      const payloadChanged = JSON.stringify(payload) !== JSON.stringify(nextPayload);
      if (!payloadChanged) continue;

      changed += 1;
      console.log(
        `[backfill_telegram_identity] ${APPLY ? 'update' : 'would_update'} lead=${lead.id} ` +
        `tgUserId:${existingTelegramUserId || '∅'}->${nextTelegramUserId || '∅'} ` +
        `username:${existingTelegramUsername || '∅'}->${nextTelegramUsername || '∅'} ` +
        `name:${existingTelegramName || '∅'}->${nextTelegramName || '∅'}`
      );

      if (APPLY) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            payload: nextPayload,
            ...(isGenericName(lead.clientName) && nextTelegramName ? { clientName: nextTelegramName } : {})
          }
        });
      }
    }

    cursorId = leads[leads.length - 1]?.id;
  }

  console.log(`[backfill_telegram_identity] done scanned=${scanned} changed=${changed} mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
}

main()
  .catch((error) => {
    console.error('[backfill_telegram_identity] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
