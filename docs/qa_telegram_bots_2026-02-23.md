# QA Checklist: Telegram Bots + MiniApp Stabilization (2026-02-23)

## Scope
- Release scope: commits 01-07 from `docs/plan_telegram_bots_2026-02-23.md`.
- Validation date: 2026-02-23.
- Environment: local repo `/srv/cartie` with PostgreSQL and Prisma migrations applied.

## Automated checks
1. `cd apps/server && npm run prisma:generate && npm run prisma:migrate`
- Result: PASS.
- Notes: Prisma client regenerated, no pending migrations.

2. `cd apps/server && npm test`
- Result: PASS.
- Coverage: 27 test files, 67 tests.
- Notes: expected test-time warnings around mocked logging/integration writes; assertions pass.

3. `cd apps/server && npm run telegram:normalize-chat-ids -- --dry-run`
- Result: PASS.
- Notes: both bot configs already normalized; no URL updates required.

4. `cd apps/server && npm run telegram:normalize-chat-ids -- --apply`
- Result: PASS.
- Notes: idempotent apply; no changes needed in current DB snapshot.

5. `cd apps/web && npm run build`
- Result: PASS.
- Notes: production build successful after MiniApp viewport/back changes.

## Manual QA checklist
1. DM flow: `@Cartie_Client_Bot`
- Steps: open bot in private chat -> `/start` -> пройти сценарий лид-запроса.
- Expected: reply keyboard visible in private chat, lead created, admin receives full card in admin queue.

2. DM flow: `@CarDealer_Lviv_Bot`
- Steps: open bot in private chat -> `/start` -> создать B2B request.
- Expected: request accepted, post published to private B2B channel with unique ID and CTA `Є авто`.

3. Admin-group `/start` buttons visibility
- Steps: run `/start` in each admin group chat.
- Expected: no ReplyKeyboard in group/supergroup; inline buttons rendered (`Відкрити бота`, `Відкрити MiniApp`).

4. Menu button sync
- Steps: call menu sync endpoint for each bot (`POST /bots/:id/menu-button/sync`) and reopen bot menu.
- Expected: Telegram menu button opens configured MiniApp URL.

5. B2B full cycle
- Steps: request created -> channel post -> partner presses `Є авто` -> submits variant -> requester marks `Підходить/Не підходить`.
- Expected: requester sees variants without seller contacts; `FIT` event lands in admin queues; contacts remain admin-only.

6. B2B multi-tenant routing isolation
- Steps: create events under partner A and partner B.
- Expected: each partner admin group gets only own events; central Cartie queue gets relayed copy with partner context.

7. Whitelist onboarding
- Steps: unapproved user tries create request/variant -> sends access request -> admin presses approve/reject.
- Expected: request blocked before approval; approve auto-creates `PartnerCompany` + `PartnerUser` (+ `adminGroupChatId` if group source), reject marks request reviewed without access grant.

8. Inbox identity restoration
- Steps: open Inbox and Leads pages after receiving Telegram messages.
- Expected: UI shows TG identity fields (`telegramUserId`, `@username`, display name, chat id where available); no duplicate leads when username arrives later.

9. Contact redaction checks
- Steps: inspect B2B channel posts, partner-group cards, requester updates.
- Expected: seller phone/username/direct contacts are redacted outside admin queue.

10. MiniApp scroll/back consistency
- Steps: open MiniApp in Telegram mobile and desktop webview -> navigate HOME/INVENTORY/LISTING/FAVORITES/REQUEST/STATUS/PROFILE.
- Expected: viewport uses `--tg-viewport-height`, inner scroll works, Telegram BackButton and in-app back arrow both navigate predictably, no body scroll collapse.

## Sign-off criteria
- All automated checks PASS.
- Manual checks 1-10 PASS in staging/live bot context.
- No webhook contract changes (`POST /api/telegram/webhook/:botId`, secret header validation, allowed updates unchanged).
