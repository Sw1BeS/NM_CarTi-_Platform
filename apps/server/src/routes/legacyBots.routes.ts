import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { botManager } from '../modules/Communication/bots/bot.service.js';
import { mapBotInput, mapBotOutput } from '../modules/Communication/bots/botDto.js';
import { applyTemplatePreset, getTemplatePresetStatus, TEMPLATE_PRESET_VERSION } from '../services/templatePreset.service.js';
import { setWebhookForBot, deleteWebhookForBot } from '../modules/Communication/telegram/core/telegramAdmin.service.js';
import { callTelegram } from './legacyTelegramProxy.shared.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';
import { normalizeBotConfigChatId } from '../modules/Communication/telegram/core/utils/telegramChatId.js';
import { buildMiniAppUrl } from '../modules/Communication/telegram/core/utils/miniappUrl.js';

const router = Router();
const resolveCompanyId = async (requestedCompanyId?: string | null, userCompanyId?: string | null) => {
    if (requestedCompanyId) return requestedCompanyId;
    if (userCompanyId) return userCompanyId;
    return null;
};

const syncMenuButton = async (bot: any) => {
    if (!bot?.token) return;
    const miniAppUrl = buildMiniAppUrl(bot, {});
    if (!miniAppUrl) return;
    const menuText = String((bot?.config as any)?.menuButtonText || 'Відкрити застосунок').trim() || 'Відкрити застосунок';
    await callTelegram(bot.token, 'setChatMenuButton', {
        menu_button: {
            type: 'web_app',
            text: menuText.slice(0, 64),
            web_app: { url: miniAppUrl }
        }
    });
};

// --- Bot Management (CRUD) ---
router.get('/bots', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;

    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

    const bots = await prisma.botConfig.findMany({
        where: companyId ? { companyId } : {},
        orderBy: { id: 'asc' }
    });
    const mapped = await Promise.all(
        bots.map(async (bot) => {
            const output = mapBotOutput(bot) as any;
            const config = (bot.config || {}) as Record<string, any>;
            try {
                const presetStatus = await getTemplatePresetStatus({
                    template: bot.template,
                    companyId: bot.companyId,
                    botId: bot.id,
                    config: config as any,
                    channelId: bot.channelId,
                    adminChatId: bot.adminChatId
                });
                output.presetStatus = presetStatus;
                output.presetVersion = config.presetVersion || TEMPLATE_PRESET_VERSION;
            } catch {
                output.presetStatus = config.presetStatus || 'missing';
                output.presetVersion = config.presetVersion || TEMPLATE_PRESET_VERSION;
            }
            return output;
        })
    );
    res.json(mapped);
});

router.post('/bots', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { data } = mapBotInput(req.body || {});
    if (!data.token) return errorResponse(res, 400, 'Token is required');
    const applyPreset = req.body?.applyPreset !== false;
    const forcePreset = req.body?.forcePreset === true;

    // MIGRATION: Sanitize optional fields
    const cleanChannelId = data.channelId && String(data.channelId).trim() !== ''
        ? normalizeBotConfigChatId(String(data.channelId).trim())
        : null;
    const cleanAdminChatId = data.adminChatId && String(data.adminChatId).trim() !== ''
        ? normalizeBotConfigChatId(String(data.adminChatId).trim())
        : null;

    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId || null;
        const companyId = await resolveCompanyId(isSuperadmin ? data.companyId : null, userCompanyId);
        if (!companyId) return errorResponse(res, 400, 'Company context required');

        // UX IMPROVEMENT: Auto-fetch details from Telegram
        let botName = data.name;
        let botUsername = '';

        // Auto-generation vars
        let finalSlug = data.defaultShowcaseSlug || 'system';
        let finalMiniAppConfig = data.miniAppConfig || {};
        let finalMenuConfig = data.menuConfig || {};

        try {
            const me = await callTelegram(data.token, 'getMe', {});
            if (me) {
                // Always act as authoritative source if we got a valid response
                // especially if the user just sent a fallback like "My New Bot" or "bot"
                if (!botName || botName === 'My New Bot' || botName === 'bot') {
                    botName = me.first_name;
                }
                botUsername = me.username || '';

                // If we have a username, we can generate a real slug and URL
                if (botUsername) {
                    finalSlug = botUsername; // Use username as the primary slug

                    const baseUrl = (data.config?.publicBaseUrl || '').replace(/\/$/, '');
                    // Construct the deep link if we have a base URL, otherwise we rely on t.me link
                    // standard deep link: https://t.me/SEARCH_ENGINE_BOT/app?startapp=SLUG
                    // but for our internal routing we want the app url: https://DOMAIN/p/app/USERNAME
                    const publicAppUrl = baseUrl ? `${baseUrl}/p/app/${botUsername}` : `https://t.me/${botUsername}/app`;

                    // Update Mini App Config
                    finalMiniAppConfig = {
                        ...finalMiniAppConfig,
                        url: publicAppUrl,
                        showcaseSlug: botUsername
                    };

                    // Update Menu Config (replace placeholder)
                    if (finalMenuConfig.buttons) {
                        finalMenuConfig.buttons = finalMenuConfig.buttons.map((btn: any) =>
                            btn.type === 'LINK' && (btn.value === '{{MINI_APP_URL}}' || btn.value.includes('/p/app/bot'))
                                ? { ...btn, value: publicAppUrl }
                                : btn
                        );
                    }
                }
            }
        } catch (tgError: any) {
            logger.warn(`Failed to fetch getMe for token: ${tgError.message}`);
            // Fallback: Use manual name or default
            if (!botName) botName = 'My New Bot';
        }

        // Fallback Slug if Telegram didn't return username
        if (!botUsername) {
            // GENERATE RANDOM SLUG: "bot_x8z2"
            const randomSuffix = Math.random().toString(36).substring(2, 7);
            const saneName = botName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 10) || 'bot';
            botUsername = `${saneName}_${randomSuffix}`;
            finalSlug = botUsername;

            const baseUrl = (data.config?.publicBaseUrl || '').replace(/\/$/, '');
            const publicAppUrl = baseUrl ? `${baseUrl}/p/app/${botUsername}` : `https://t.me/${botUsername}/app`; // Theoretical

            finalMiniAppConfig = {
                ...finalMiniAppConfig,
                url: publicAppUrl,
                showcaseSlug: botUsername
            };
        }

        // UX IMPROVEMENT: Fetch existing menu/commands
        try {
            const [commands, menuButton] = await Promise.all([
                callTelegram(data.token, 'getMyCommands', {}).catch(() => []),
                callTelegram(data.token, 'getChatMenuButton', {}).catch(() => null)
            ]);

            if (commands && Array.isArray(commands) && commands.length > 0) {
                // Map commands to menu buttons if no manual menu exists
                if (!finalMenuConfig.buttons || finalMenuConfig.buttons.length === 0) {
                    finalMenuConfig.buttons = commands.map((c: any) => ({
                        type: 'COMMAND',
                        label: c.description,
                        value: `/${c.command}`
                    }));
                }
            }

            // We could also store the raw commands in config if needed, but for now we map to buttons.

        } catch (menuErr) {
            logger.warn('Failed to fetch menu info', menuErr);
        }

        const presetInputConfig = {
            ...(data.config || {}),
            botUsername,
            username: botUsername,
            autoDiscovered: true,
            defaultShowcaseSlug: finalSlug,
            miniAppConfig: finalMiniAppConfig,
            menuConfig: finalMenuConfig
        } as Record<string, any>;

        const newBot = await prisma.botConfig.create({
            data: {
                ...data,
                name: botName,
                companyId,
                token: data.token.trim(),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId,
                isEnabled: data.isEnabled ?? true,
                config: presetInputConfig as any
            }
        });

        const presetApplied = await applyTemplatePreset({
            template: data.template || 'CLIENT_LEAD',
            companyId,
            botId: newBot.id,
            config: (newBot.config || {}) as any,
            defaultShowcaseSlug: finalSlug,
            fallbackName: botName,
            applyPreset,
            forcePreset,
            channelId: cleanChannelId,
            adminChatId: cleanAdminChatId
        });

        const finalBot = await prisma.botConfig.update({
            where: { id: newBot.id },
            data: { config: presetApplied.config as any }
        });

        // Fire and forget restart to avoid blocking the UI response
        botManager.restartBot(newBot.id).catch(e => logger.error("Async Bot Restart Failed:", e));
        syncMenuButton(finalBot).catch((e: any) => logger.warn(`[Bot Create] setChatMenuButton failed: ${e?.message || e}`));

        // Return the enriched object so UI updates immediately
        const output = mapBotOutput(finalBot);
        // @ts-ignore
        output.botUsername = botUsername;
        // @ts-ignore
        output.presetStatus = presetApplied.presetStatus;
        // @ts-ignore
        output.presetVersion = presetApplied.presetVersion;

        res.json(output);
    } catch (e) {
        logger.error("Create Bot Error:", e);
        errorResponse(res, 500, "Failed to create bot. Token might be duplicate or invalid.");
    }
});

router.put('/bots/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.botConfig.findUnique({ where: { id } });
    if (!existing) return errorResponse(res, 404, 'Bot not found');
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
    if (!isSuperadmin && existing.companyId !== userCompanyId) {
        return errorResponse(res, 403, 'Forbidden');
    }
    const { data } = mapBotInput(req.body || {}, existing.config);
    const applyPreset = req.body?.applyPreset !== false;
    const forcePreset = req.body?.forcePreset === true;
    if ('token' in data && !data.token) return errorResponse(res, 400, 'Token is required');
    if (!isSuperadmin) delete data.companyId;

    // Sanitize optional fields (preserve existing values when field is not provided)
    const hasChannelIdField = Object.prototype.hasOwnProperty.call(data, 'channelId');
    const hasAdminChatIdField = Object.prototype.hasOwnProperty.call(data, 'adminChatId');
    const cleanChannelId = hasChannelIdField
        ? (data.channelId && String(data.channelId).trim() !== '' ? normalizeBotConfigChatId(String(data.channelId).trim()) : null)
        : undefined;
    const cleanAdminChatId = hasAdminChatIdField
        ? (data.adminChatId && String(data.adminChatId).trim() !== '' ? normalizeBotConfigChatId(String(data.adminChatId).trim()) : null)
        : undefined;

    try {
        const nextToken = (data.token ? String(data.token).trim() : String(existing.token || '').trim());
        const mergedConfig = {
            ...((existing.config || {}) as Record<string, any>),
            ...((data.config || {}) as Record<string, any>)
        } as Record<string, any>;

        try {
            if (nextToken) {
                const me = await callTelegram(nextToken, 'getMe', {});
                if (me?.username) {
                    mergedConfig.botUsername = me.username;
                    mergedConfig.username = me.username;
                }
            }
        } catch (e: any) {
            logger.warn(`[Bot Update] getMe failed: ${e.message || e}`);
        }

        const template = data.template || existing.template;
        const presetApplied = await applyTemplatePreset({
            template,
            companyId: existing.companyId,
            botId: existing.id,
            config: mergedConfig as any,
            defaultShowcaseSlug: (data.config as any)?.defaultShowcaseSlug || (existing.config as any)?.defaultShowcaseSlug,
            fallbackName: data.name || existing.name,
            applyPreset,
            forcePreset,
            channelId: cleanChannelId !== undefined ? cleanChannelId : existing.channelId,
            adminChatId: cleanAdminChatId !== undefined ? cleanAdminChatId : existing.adminChatId
        });

        const updated = await prisma.botConfig.update({
            where: { id },
            data: {
                ...data,
                ...(data.token ? { token: data.token.trim() } : {}),
                ...(cleanChannelId !== undefined ? { channelId: cleanChannelId } : {}),
                ...(cleanAdminChatId !== undefined ? { adminChatId: cleanAdminChatId } : {}),
                config: presetApplied.config
            }
        });

        // Fire and forget
        botManager.restartBot(id).catch(e => logger.error("Async Bot Update Failed:", e));
        syncMenuButton(updated).catch((e: any) => logger.warn(`[Bot Update] setChatMenuButton failed: ${e?.message || e}`));

        const output = mapBotOutput(updated) as any;
        output.presetStatus = presetApplied.presetStatus;
        output.presetVersion = presetApplied.presetVersion;
        res.json(output);
    } catch (e) {
        logger.error("Update Bot Error:", e);
        errorResponse(res, 500, 'Failed to update bot');
    }
});

router.post('/bots/:id/webhook', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        const { publicBaseUrl, secretToken } = req.body || {};

        // Production-friendly fallback: infer base URL from proxy headers when PUBLIC_BASE_URL isn't set.
        const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
        const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
        const host = forwardedHost || req.get('host');
        const proto = forwardedProto || req.protocol;
        const inferredBaseUrl = host ? `${proto}://${host}` : undefined;

        const result = await setWebhookForBot(id, { publicBaseUrl: publicBaseUrl || inferredBaseUrl, secretToken });
        botManager.restartBot(id).catch(e => logger.error('Async Bot Restart Failed:', e));
        res.json({ ok: true, ...result });
    } catch (e: any) {
        logger.error('[Webhook] Set error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to set webhook');
    }
});

router.post('/bots/:id/menu-button/sync', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        await syncMenuButton(bot);
        res.json({ ok: true });
    } catch (e: any) {
        logger.error('[MenuButton] Sync error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to sync menu button');
    }
});

router.delete('/bots/:id/webhook', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        await deleteWebhookForBot(id);
        botManager.restartBot(id).catch(e => logger.error('Async Bot Restart Failed:', e));
        res.json({ ok: true });
    } catch (e: any) {
        logger.error('[Webhook] Delete error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to delete webhook');
    }
});

router.delete('/bots/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
    const { id } = req.params;
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        await prisma.botConfig.delete({ where: { id } });
        botManager.restartBot(id).catch(e => logger.error("Async Bot Restart Failed:", e));
        res.json({ success: true });
    } catch (e) { errorResponse(res, 500, 'Failed to delete bot'); }
});

export default router;
