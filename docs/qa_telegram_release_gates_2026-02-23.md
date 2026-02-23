# Telegram Release Gates QA (2026-02-23)

## Goal
Mandatory release gates for Telegram/B2B/MiniApp rollout to ensure code-to-production parity.

## Pre-deploy
1. `cd /srv/cartie/apps/server && npm run prisma:generate`
2. `cd /srv/cartie/apps/server && npm test`
3. `cd /srv/cartie/apps/web && npm run build`

Expected:
- Backend tests pass.
- Web build passes.

## Deploy
1. `cd /srv/cartie && bash infra/deploy_prod.sh`

Expected:
- Script reaches `✅ DEPLOYMENT COMPLETE`.
- No failures in:
  - `post_migrate_sync` (`telegram:normalize-chat-ids -- --apply`, `b2b:backfill-partner-admin-groups`)
  - `telegram_smoke_check`
  - `telegram_live_verify`

## Post-deploy hard gates
1. `cd /srv/cartie && bash infra/prod_verify.sh`
2. `cd /srv/cartie && bash infra/verify_telegram_live.sh`

Expected:
- `prod_verify.sh` passes for **all** enabled bots.
- `verify_telegram_live.sh` confirms:
  - `getMe` OK
  - `getChat(channelId/adminChatId)` matches DB
  - menu button is `web_app` with URL
  - webhook/live checks consistent with delivery mode

## DB truth checks
1. Enabled bots:
```sql
SELECT id, template, "deliveryMode", "channelId", "adminChatId"
FROM "BotConfig"
WHERE "isEnabled" = true
ORDER BY "createdAt";
```
2. Recent Telegram ingest:
```sql
SELECT "botId", count(*)
FROM "TelegramUpdate"
WHERE "createdAt" > now() - interval '24 hours'
GROUP BY "botId";
```
3. Identity quality:
```sql
WITH recent AS (
  SELECT payload
  FROM "Lead"
  WHERE "createdAt" > now() - interval '14 days'
)
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE coalesce(payload->>'telegramUserId','')='') AS missing_tg_user_id,
  count(*) FILTER (WHERE coalesce(payload->>'telegramUsername','')='') AS missing_tg_username,
  count(*) FILTER (WHERE coalesce(payload->>'telegramName','')='') AS missing_tg_name
FROM recent;
```

## Manual acceptance
1. DM flow for `@Cartie_Client_Bot` and `@CarDealer_Lviv_Bot`.
2. `/start` in admin groups shows inline/menu controls correctly.
3. B2B flow: request -> channel post -> “Є авто” -> variant -> FIT/NOT_FIT -> partner and central queues.
4. Inbox/Leads show TG identity fields.
5. MiniApp: stable scroll, unified back behavior, no alert popups, no mock sections.

## Artifacts
- Deploy logs: `/srv/cartie/_logs/deploy_*.log`
- Telegram live verify logs: `/srv/cartie/_logs/telegram_live_verify_*.log`
