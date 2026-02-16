# QA RELEASE CHECKLIST — CarTié / CarDealer Lviv (2026-02-16)

## 1) B2B Flow E2E
📌 Steps
🔘 In bot, create request via `📝 Новий запит`
🔘 Fill required fields: марка/модель, рік, бюджет, пробіг, паливо, коментар, контакт, компанія
🔘 Verify channel post contains structured card + unique ID + button `Є авто` (no contact lines)
🔘 Dealer opens flow from button and submits offer with photos + card
🔘 Request author receives offer card without dealer contact/company
🔘 Author taps `✅ Підходить`
🔘 Admin receives card with contact/company and can continue routing

📌 Expected logs
🔘 Request creation + channel post success log
🔘 Variant submit log + admin notification log

## 2) Mini App
📌 Telegram context
🔘 Open MiniApp from Telegram bot
🔘 Load inventory and toggle favorites
🔘 Submit request from MiniApp form

📌 Browser preview context
🔘 Open `/p/app/:slug` directly in browser
🔘 Confirm app renders (no black screen)
🔘 Try favorite/request action

📌 Expected behavior
🔘 Telegram context: write actions succeed
🔘 Browser preview: write actions are blocked by UI notice (no crash/black screen)

📌 Expected logs
🔘 `[MiniApp] config request`
🔘 `[MiniApp] favorite toggle request` (Telegram mode)
🔘 `[MiniApp] request create` (Telegram mode)

## 3) MTProto Import
📌 DRAFT_ONLY policy
🔘 Run import job with `mode=DRAFT_ONLY`
🔘 Confirm created Draft entries keep media refs metadata
🔘 Confirm no media download side-effects for refs-only path

📌 Parsing quality
🔘 Validate sample messages containing:
☑️ price with `у.е.`
☑️ dotted thousands like `10.000`
☑️ year shorthand input path `2019/20` in bot request year step

📌 Expected results
🔘 Currency normalized correctly (USD for `у.е.`)
🔘 Price normalized to integer thousands correctly
🔘 Year range stored as full years

## 4) Publication Pipeline
📌 Steps
🔘 Create publication job with media path as `/media/...`
🔘 Ensure bot config has `publicBaseUrl` OR env has `PUBLIC_BASE_URL`
🔘 Run content worker cycle

📌 Expected results
🔘 If base URL exists: post publishes with photo
🔘 If base URL missing: job marked `FAILED` with explicit message about relative media URL/base URL config

## 5) Scheduler / Migration
📌 Steps
🔘 Apply Prisma migrations (including `ScheduledJob` table)
🔘 Restart API + worker

📌 Expected results
🔘 No recurring scheduler `P2021` errors for `ScheduledJob`
🔘 Scheduled jobs processor runs or remains cleanly idle

## 6) Build/Smoke Gate
📌 Commands
```bash
npm --prefix apps/server run build
npm --prefix apps/web run build
npm --prefix apps/server run prisma:generate
npm --prefix apps/server test -- src/__tests__/enhanced-parsing.utils.test.ts src/modules/Integrations/mtproto/mtproto.service.test.ts
```

📌 Pass criteria
🔘 Build passes for server and web
🔘 Targeted parser/mtproto tests pass
🔘 Manual E2E checks above are green on production runtime
