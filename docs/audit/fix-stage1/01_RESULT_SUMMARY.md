# Stage-1 Fix & Ship — Result Summary

## Done
- P0-1: Telegram leads now persist chatId/userId/username/name and enrich clientName on merge when missing.
- P0-3: channel_post respects BotConfig.config.channelMode (CONTENT vs INVENTORY) with shared dedup on sourceChatId+sourceMessageId and unique index.
- P0-2: MTProto pipeline active with 1 ChannelSource; manual sync imports listings with source='MTPROTO' (fallback path) and scheduler sees active sources.
- Worker/API rebuilt and healthy (docker compose build api + restart; /health OK).
- Smoke: Telegram webhook lead via web_app_data (2 leads), channel_post duplicate check, scheduler manual sync.

## Tests / Checks
- npm test --silent -- src/modules/Communication/telegram/core/leadService.test.ts
- npm run build
- curl http://127.0.0.1:3002/health and public /api/health
- Manual webhook smokes (lead creation, channel_post) and scheduler sync run

## Commits
- d0a9d31 fix(tg): persist lead identity (name/username/chatId/userId)
- ac25497 test(tg): lead identity regression
- f259a71 fix(tg): channel_post channelMode inventory/content + dedup
- 19cf884 fix(mtproto): e2e auth+channel source+sync verified
