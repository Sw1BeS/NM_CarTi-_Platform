#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-infra2}"
DB_CONTAINER="${DB_CONTAINER:-${PROJECT}-db-1}"
LOG_DIR="${LOG_DIR:-/srv/cartie/_logs}"
TS="$(date -u +%Y-%m-%d_%H%M%S)"
LOG_FILE="${LOG_FILE:-$LOG_DIR/telegram_live_verify_${TS}.log}"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

log() { echo "[TG-LIVE] $*" | tee -a "$LOG_FILE"; }
die() { echo "[TG-LIVE][ERROR] $*" | tee -a "$LOG_FILE"; exit 1; }

log "Starting Telegram live verification..."
log "DB container: $DB_CONTAINER"
log "Log file: $LOG_FILE"

docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "DB container not found: $DB_CONTAINER"

bots_json="$(
  docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -A -t -c "
    SELECT COALESCE(json_agg(x), '[]'::json)::text
    FROM (
      SELECT
        id,
        name,
        template::text AS template,
        token,
        \"deliveryMode\"::text AS \"deliveryMode\",
        \"channelId\",
        \"adminChatId\",
        COALESCE(config#>>'{miniAppConfig,url}', '') AS \"expectedMiniAppUrl\",
        COALESCE(config->>'webhookUrl', '') AS \"configWebhookUrl\"
      FROM \"BotConfig\"
      WHERE \"isEnabled\" = true
      ORDER BY \"createdAt\"
    ) x;
  " | tr -d '\r'
)"

[ -n "${bots_json}" ] || die "Failed to load enabled bots from DB"

VERIFY_BOTS_JSON="$bots_json" node <<'NODE' | tee -a "$LOG_FILE"
const requiredAllowedUpdates = ['message', 'callback_query', 'inline_query', 'channel_post', 'my_chat_member'];

const bots = (() => {
  try {
    return JSON.parse(process.env.VERIFY_BOTS_JSON || '[]');
  } catch {
    return [];
  }
})();

if (!Array.isArray(bots) || bots.length === 0) {
  console.error('No enabled bots found for live verification');
  process.exit(1);
}

const asString = (value) => (value === null || value === undefined ? '' : String(value));
const stripQueryAndHash = (value) => {
  const raw = asString(value).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw.replace(/[?#].*$/, '');
  }
};
const maskToken = (token) => {
  const raw = asString(token);
  if (!raw) return '<empty>';
  if (raw.length <= 10) return `${raw.slice(0, 2)}…${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tgCall(token, method, payload = {}) {
  let lastError = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json();
      if (data?.ok || ![429, 500, 502, 503, 504].includes(Number(data?.error_code || 0))) {
        return data;
      }
      lastError = data?.description || `telegram ${method} returned ${data?.error_code}`;
    } catch (error) {
      lastError = String(error && error.message || error);
    } finally {
      clearTimeout(timeout);
    }
    await sleep([1000, 2500, 5000][attempt] || 0);
  }
  return { ok: false, description: lastError || `${method} request failed` };
}

function pushIssue(issues, botId, message) {
  issues.push({ botId, message });
}

function logBot(bot, line) {
  const name = asString(bot.name).trim() || asString(bot.template) || asString(bot.id);
  console.log(`[BOT ${bot.id}] ${name}: ${line}`);
}

(async () => {
  const issues = [];

  for (const bot of bots) {
    const botId = asString(bot.id);
    const token = asString(bot.token);
    const deliveryMode = asString(bot.deliveryMode).toUpperCase();
    const channelId = asString(bot.channelId).trim();
    const adminChatId = asString(bot.adminChatId).trim();
    const expectedMiniAppUrl = asString(bot.expectedMiniAppUrl).trim();
    const expectedMiniAppLaunchUrl = stripQueryAndHash(expectedMiniAppUrl);
    const configWebhookUrl = asString(bot.configWebhookUrl).trim();

    logBot(bot, `template=${bot.template} deliveryMode=${deliveryMode || 'UNKNOWN'} token=${maskToken(token)}`);

    if (!token) {
      pushIssue(issues, botId, 'Missing bot token');
      continue;
    }

    let me;
    try {
      me = await tgCall(token, 'getMe');
    } catch (error) {
      pushIssue(issues, botId, `getMe request failed: ${String(error && error.message || error)}`);
      continue;
    }
    if (!me?.ok) {
      pushIssue(issues, botId, `getMe failed: ${asString(me?.description) || 'unknown error'}`);
      continue;
    }
    logBot(bot, `getMe ok as @${asString(me?.result?.username)}`);

    const webhook = await tgCall(token, 'getWebhookInfo');
    if (!webhook?.ok) {
      pushIssue(issues, botId, `getWebhookInfo failed: ${asString(webhook?.description) || 'unknown error'}`);
    } else {
      const liveWebhookUrl = asString(webhook?.result?.url).trim();
      const allowed = Array.isArray(webhook?.result?.allowed_updates) ? webhook.result.allowed_updates.map((x) => asString(x)) : [];
      const missingRequired = requiredAllowedUpdates.filter((name) => !allowed.includes(name));
      logBot(bot, `webhook url=${liveWebhookUrl || '<empty>'} pending=${asString(webhook?.result?.pending_update_count || 0)}`);

      if (deliveryMode === 'WEBHOOK' && !liveWebhookUrl) {
        pushIssue(issues, botId, 'Delivery mode is WEBHOOK but getWebhookInfo.url is empty');
      }
      if ((deliveryMode === 'WEBHOOK' || liveWebhookUrl) && missingRequired.length) {
        pushIssue(issues, botId, `Missing required allowed_updates: ${missingRequired.join(', ')}`);
      }
      if (configWebhookUrl && liveWebhookUrl && configWebhookUrl !== liveWebhookUrl) {
        pushIssue(issues, botId, `Config webhookUrl mismatch: config=${configWebhookUrl} live=${liveWebhookUrl}`);
      }
    }

    const menu = await tgCall(token, 'getChatMenuButton', {});
    if (!menu?.ok) {
      pushIssue(issues, botId, `getChatMenuButton failed: ${asString(menu?.description) || 'unknown error'}`);
    } else {
      const menuButton = menu?.result?.menu_button || menu?.result || {};
      const menuType = asString(menuButton?.type).trim();
      const menuUrl = asString(menuButton?.web_app?.url).trim();
      logBot(bot, `menu type=${menuType || '<empty>'} web_app=${menuUrl || '<empty>'}`);
      if (menuType !== 'web_app' || !menuUrl) {
        pushIssue(issues, botId, 'Menu button is not web_app with URL');
      }
      if (expectedMiniAppLaunchUrl && menuUrl !== expectedMiniAppLaunchUrl) {
        pushIssue(issues, botId, `Menu URL mismatch: expected=${expectedMiniAppLaunchUrl} live=${menuUrl || '<empty>'}`);
      }
    }

    if (channelId) {
      const channel = await tgCall(token, 'getChat', { chat_id: channelId });
      if (!channel?.ok) {
        pushIssue(issues, botId, `getChat(channelId=${channelId}) failed: ${asString(channel?.description) || 'unknown error'}`);
      } else {
        const liveId = asString(channel?.result?.id);
        const chatType = asString(channel?.result?.type);
        logBot(bot, `channel chat.type=${chatType} id=${liveId}`);
        if (liveId !== channelId) {
          pushIssue(issues, botId, `channelId mismatch: db=${channelId} live=${liveId}`);
        }
        if (chatType !== 'channel') {
          pushIssue(issues, botId, `channelId chat type expected=channel actual=${chatType || 'unknown'}`);
        }
      }
    } else {
      pushIssue(issues, botId, 'Missing channelId in DB');
    }

    if (adminChatId) {
      const admin = await tgCall(token, 'getChat', { chat_id: adminChatId });
      if (!admin?.ok) {
        pushIssue(issues, botId, `getChat(adminChatId=${adminChatId}) failed: ${asString(admin?.description) || 'unknown error'}`);
      } else {
        const liveId = asString(admin?.result?.id);
        const chatType = asString(admin?.result?.type);
        logBot(bot, `admin chat.type=${chatType} id=${liveId}`);
        if (liveId !== adminChatId) {
          pushIssue(issues, botId, `adminChatId mismatch: db=${adminChatId} live=${liveId}`);
        }
        if (!['group', 'supergroup', 'private'].includes(chatType)) {
          pushIssue(issues, botId, `adminChatId unexpected chat type: ${chatType || 'unknown'}`);
        }
      }
    } else {
      pushIssue(issues, botId, 'Missing adminChatId in DB');
    }
  }

  if (issues.length) {
    console.error('\nTelegram live verification FAILED:');
    for (const issue of issues) {
      console.error(`- [${issue.botId}] ${issue.message}`);
    }
    process.exit(1);
  }

  console.log('\nTelegram live verification PASSED');
})().catch((error) => {
  console.error(`Verifier crashed: ${String(error && error.message || error)}`);
  process.exit(1);
});
NODE

log "Telegram live verification finished successfully"
