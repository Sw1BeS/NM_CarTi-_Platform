# Integrations Map

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

| Name | Present | Notes |
| --- | --- | --- |
| Postgres/Prisma | yes | Primary persistence layer via `apps/server/prisma/schema.prisma`. |
| Telegram Bot API | yes | Telegram bot, routing, sources, MTProto connector, MiniApp entrypoints. |
| MTProto | yes | Telegram account/source lifecycle and workers. |
| WhatsApp webhook | yes | Mounted at `/api/webhooks/whatsapp`. |
| Viber webhook | yes | Mounted at `/api/webhooks/viber`. |
| SalesDrive/Meta | yes | Detected by module paths: `apps/server/src/modules/Integrations/salesdrive/salesdrive.connector.test.ts`, `apps/server/src/modules/Integrations/salesdrive/salesdrive.connector.ts`, `apps/server/src/modules/Integrations/meta/meta.service.ts`, `apps/server/src/modules/Integrations/meta/metaCapi.service.test.ts`. |
| Caddy/nginx | yes | Caddy serves web container; nginx is public reverse proxy. |
