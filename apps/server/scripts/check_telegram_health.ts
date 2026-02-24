#!/usr/bin/env node
/**
 * check_telegram_health.ts
 * ========================
 * Verifies that BotConfig.adminChatId and BotConfig.channelId in the DB
 * match the real Bot API chat.id values fetched via getChat.
 *
 * Per MEGA PROMPT v7: "RAW IDs may be MTProto peer IDs. You MUST detect
 * actual Bot API chat.id using getChat and/or update payloads."
 *
 * Usage:
 *   npx tsx scripts/check_telegram_health.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

interface ChatInfo {
    id: number;
    type: string;
    title?: string;
    username?: string;
    description?: string;
}

const TG_API = 'https://api.telegram.org';

const RAW_ID_HINTS: Record<string, string> = {
    'CLIENT_LEAD.adminChatId': '5097128570',
    'CLIENT_LEAD.channelId': '3662808163',
    'B2B.adminChatId': '5286062875',
    'B2B.channelId': '3818257920'
};

async function getChat(token: string, chatId: string): Promise<ChatInfo | null> {
    try {
        const res = await axios.get(`${TG_API}/bot${token}/getChat`, {
            params: { chat_id: chatId },
            timeout: 10_000
        });
        return res.data?.result ?? null;
    } catch (e: any) {
        const desc = e?.response?.data?.description || e?.message || String(e);
        return null;
    }
}

async function getMe(token: string): Promise<{ id: number; username?: string; first_name?: string } | null> {
    try {
        const res = await axios.get(`${TG_API}/bot${token}/getMe`, { timeout: 8_000 });
        return res.data?.result ?? null;
    } catch {
        return null;
    }
}

async function checkBotPermissions(token: string, chatId: string): Promise<{
    canSend: boolean;
    canPost: boolean;
    isAdmin: boolean;
    rawResult?: any;
}> {
    try {
        const me = await getMe(token);
        if (!me) return { canSend: false, canPost: false, isAdmin: false };
        const res = await axios.get(`${TG_API}/bot${token}/getChatMember`, {
            params: { chat_id: chatId, user_id: me.id },
            timeout: 8_000
        });
        const status: string = res.data?.result?.status || '';
        const isAdmin = ['administrator', 'creator'].includes(status);
        const member = res.data?.result || {};
        return {
            canSend: isAdmin,
            canPost: isAdmin && (member.can_post_messages !== false),
            isAdmin,
            rawResult: member
        };
    } catch {
        return { canSend: false, canPost: false, isAdmin: false };
    }
}

const colorize = (str: string, ok: boolean) => {
    const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', RESET = '\x1b[0m';
    return `${ok ? GREEN : RED}${str}${RESET}`;
};

async function main() {
    console.log('\n🔍 Telegram Health Check — CarTié\n' + '='.repeat(50));

    const bots = await prisma.botConfig.findMany({
        where: { isEnabled: true },
        orderBy: { createdAt: 'asc' }
    });

    if (!bots.length) {
        console.log('⚠️  No enabled bots found in DB.');
        return;
    }

    for (const bot of bots) {
        const me = await getMe(bot.token);
        console.log(`\n🤖 Bot: ${bot.name || bot.id}`);
        console.log(`   Template: ${bot.template}`);
        console.log(`   @${me?.username || '??'} (botId in TG: ${me?.id ?? '??'})`);
        console.log(`   DB id: ${bot.id}`);

        const checks: Array<{
            field: string;
            storedValue: string | null | undefined;
            resolvedId?: number | null;
            resolvedType?: string;
            resolvedTitle?: string;
            ok: boolean;
            note?: string;
        }> = [];

        // --- adminChatId ---
        if (bot.adminChatId) {
            const chatInfo = await getChat(bot.token, String(bot.adminChatId));
            const perms = chatInfo ? await checkBotPermissions(bot.token, String(bot.adminChatId)) : null;
            const ok = Boolean(chatInfo && chatInfo.id);
            checks.push({
                field: 'adminChatId',
                storedValue: String(bot.adminChatId),
                resolvedId: chatInfo?.id,
                resolvedType: chatInfo?.type,
                resolvedTitle: chatInfo?.title || chatInfo?.username,
                ok,
                note: perms ? (perms.isAdmin ? '✅ bot is admin' : '⚠️  bot is NOT admin') : '❌ could not fetch'
            });

            // Auto-detect mismatch (MTProto peer ID differs from Bot API id)
            if (chatInfo && String(chatInfo.id) !== String(bot.adminChatId)) {
                console.log(`   ⚠️  MISMATCH adminChatId: stored=${bot.adminChatId} actual=${chatInfo.id}`);
            }
        } else {
            checks.push({ field: 'adminChatId', storedValue: null, ok: false, note: '⚠️  not configured' });
        }

        // --- channelId ---
        if (bot.channelId) {
            const chatInfo = await getChat(bot.token, String(bot.channelId));
            const ok = Boolean(chatInfo && chatInfo.id);
            checks.push({
                field: 'channelId',
                storedValue: String(bot.channelId),
                resolvedId: chatInfo?.id,
                resolvedType: chatInfo?.type,
                resolvedTitle: chatInfo?.title || chatInfo?.username,
                ok,
                note: chatInfo ? '✅ reachable' : '❌ could not reach'
            });

            if (chatInfo && String(chatInfo.id) !== String(bot.channelId)) {
                console.log(`   ⚠️  MISMATCH channelId: stored=${bot.channelId} actual=${chatInfo.id}`);
            }
        } else {
            checks.push({ field: 'channelId', storedValue: null, ok: false, note: '⚠️  not configured' });
        }

        // Print results table
        console.log('\n   Field           │ Stored              │ Resolved TG ID    │ Type        │ Status');
        console.log('   ────────────────┼─────────────────────┼───────────────────┼─────────────┼─────────────────────');
        for (const c of checks) {
            const stored = (c.storedValue ?? 'null').padEnd(19);
            const resolved = (c.resolvedId != null ? String(c.resolvedId) : 'N/A').padEnd(17);
            const type = (c.resolvedType || '—').padEnd(11);
            const status = colorize(c.note || (c.ok ? 'OK' : 'FAIL'), c.ok);
            console.log(`   ${c.field.padEnd(15)} │ ${stored} │ ${resolved} │ ${type} │ ${status}`);
            const key = `${bot.template}.${c.field}`;
            const rawHint = RAW_ID_HINTS[key];
            if (rawHint && c.resolvedId != null) {
                console.log(`   ↳ before(raw): ${rawHint}  -> after(bot_api): ${c.resolvedId}`);
            }
            if (c.storedValue && c.resolvedId != null && String(c.storedValue) !== String(c.resolvedId)) {
                console.log(`   ↳ SQL fix: UPDATE \"BotConfig\" SET \"${c.field}\"='${c.resolvedId}' WHERE id='${bot.id}';`);
            }
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📋 LEGEND:');
    console.log('  • If Stored ≠ Resolved TG ID → update BotConfig.adminChatId/channelId in DB');
    console.log('  • Bot API IDs for supergroups use -100XXXXXXXXXX format');
    console.log('  • MTProto peer IDs for supergroups use raw XXXXXXXXXX without prefix');
    console.log('  • To get the correct Bot API id: add the bot to the group and check getChat\n');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('❌ Health check failed:', e.message);
    await prisma.$disconnect();
    process.exit(1);
});
