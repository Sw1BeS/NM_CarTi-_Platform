# QA RELEASE CHECKLIST — CarTié / CarDealer Lviv (2026-02-10)

## B2B Flow E2E
📌 How to reproduce
🔘 In bot: create a new request (Запит)
🔘 Fill required fields (brand/model, year, budget, mileage, fuel, comment, contact, company)
🔘 Verify bot posts structured request to channel with unique ID and “Є авто” button (no contacts)
🔘 Another dealer presses “Є авто”, submits offer with photos + fields
🔘 Author receives offer without contacts
🔘 Author taps “Підходить”
🔘 Admin receives offer with contact + company

📌 Expected logs
🔘 Request created and channel post sent
🔘 Admin message delivered with contact fields

## Mini App
📌 How to reproduce
🔘 Open `/p/app/:slug` in browser and in Telegram WebApp
🔘 Confirm `/miniapp/config` request returns ok and UI renders inventory
🔘 If config missing, UI shows warning banner (no black screen)

📌 Expected logs
🔘 `[MiniApp] config request` (server)
🔘 `[MiniApp] Config loaded` (client console)

## MTProto Import
📌 How to reproduce
🔘 Run QA script: `cd apps/server && npx tsx src/scripts/mtproto_qa.ts`
🔘 Run MTProto import with `mode=DRAFT_ONLY`

📌 Expected logs
🔘 MTProto QA: 7/7 passed
🔘 DRAFT_ONLY imports create Drafts without downloading media

## Publishing Pipeline
📌 How to reproduce
🔘 Create a publication job with a draft containing an image
🔘 Run content worker

📌 Expected logs
🔘 `[ContentWorker] Published post ...`
🔘 Telegram post shows image (absolute URL resolved)

## Parser UI (disabled)
📌 How to reproduce
🔘 Set `VITE_PARSER_ENABLED=false` and load UI

📌 Expected result
🔘 Parser tab hidden/disabled with a clear message
