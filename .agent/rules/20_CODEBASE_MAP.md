---
trigger: always_on
---

# CarTié — Codebase Map (P1)

📌 Backend (apps/server)
1️⃣ Express API entry: `apps/server/src/index.ts`
2️⃣ Routes:
   🔘 `apps/server/src/routes/*`
   🔘 Telegram webhook: `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts`
3️⃣ Telegram Bot API pipeline:
   🔘 pipeline: `apps/server/src/modules/Communication/telegram/scenarios/pipeline.ts`
   🔘 routing: `apps/server/src/modules/Communication/telegram/routing/*`
   🔘 lead logic: `apps/server/src/modules/Communication/telegram/core/leadService.ts`
4️⃣ MTProto:
   🔘 mapping: `apps/server/src/services/mtproto-mapping.service.ts`
   🔘 connectors/sources: `apps/server/src/modules/Integrations/mtproto/*` (и Prisma модели)
5️⃣ Inventory:
   🔘 `apps/server/src/modules/Inventory/*` + Prisma `CarListing`
6️⃣ Content / Drafts / Calendar:
   🔘 `Draft` и связанные модули (используются для публикаций)

📌 Frontend (apps/web)
1️⃣ UI для CRM/ERP модулей: Inbox / Leads / Inventory / Content / Integrations / Settings
2️⃣ Любые изменения UI должны сохранять:
   🔘 предсказуемые статусы
   🔘 понятные пустые состояния
   🔘 минимальную “клиентскую” логику (истина на сервере)
