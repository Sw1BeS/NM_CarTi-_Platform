# QA Report: Telegram Bots + MiniApp Recheck (2026-02-23)

## Automated checks (executed)
1. `cd apps/server && npm test`
   - Result: PASS (`28` test files, `70` tests).
2. `cd apps/web && npm run build`
   - Result: PASS (production build succeeded).
3. `bash infra/verify_telegram_live.sh`
   - Result: PASS (both bots: `getMe`, `getChat`, `getChatMenuButton`, live checks).
4. `bash infra/prod_verify.sh`
   - Result: PASS (webhook smoke for all enabled bots + Telegram live gates).
5. `cd apps/server && npm run telegram:backfill-identity -- --dry-run`
   - Result: PASS (idempotent dry run with explicit update candidates).
6. `cd apps/server && npm run telegram:backfill-identity -- --apply`
   - Result: PASS (historical payload enrichment applied).

## Data verification after backfill
```sql
WITH recent AS (
  SELECT payload FROM "Lead" WHERE "createdAt" > now() - interval '14 days'
)
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE coalesce(payload->>'telegramUserId','')='') AS missing_tg_user_id,
  count(*) FILTER (WHERE coalesce(payload->>'telegramUsername','')='') AS missing_tg_username,
  count(*) FILTER (WHERE coalesce(payload->>'telegramName','')='') AS missing_tg_name
FROM recent;
```
- Result:
  - `total=4`
  - `missing_tg_user_id=0`
  - `missing_tg_username=0`
  - `missing_tg_name=0`

## Mandatory manual QA checklist
1. DM flow for `@Cartie_Client_Bot`:
   - `/start` -> menu visible.
   - lead request submitted.
   - admin queue receives single structured card.
2. DM flow for `@CarDealer_Lviv_Bot`:
   - whitelist behavior (enforced) works.
   - access request -> approve/reject callback works.
3. Admin group `/start`:
   - inline/menu actions are visible in group/supergroup.
4. B2B core path:
   - request created -> channel post with CTA.
   - “Є авто” -> dealer variant submitted.
   - requester FIT/NOT_FIT updates.
   - partner queue and central relay queue receive proper events.
5. Privacy:
   - no seller contacts in channel posts.
   - no seller contacts in partner queue messages.
   - contacts appear only in admin queue payloads where required.
6. Inbox/Leads UI:
   - TG id/username/name visible.
7. MiniApp:
   - no `alert()` popups.
   - no mock profile activity section.
   - stable scroll + predictable back behavior (in-app arrow + Telegram BackButton).

## Artifacts
- Deploy logs: `/srv/cartie/_logs/deploy_*.log`
- Live verify logs: `/srv/cartie/_logs/telegram_live_verify_*.log`
