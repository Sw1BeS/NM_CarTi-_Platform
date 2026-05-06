# CarTié MiniApp Stabilization Design

Date: 2026-05-06

## Decision

Implement Variant A: targeted stabilization plus a premium UI slice for the current Lead and B2B MiniApps.

This is not a broad rewrite. The work keeps Inventory as the shared source of truth, keeps existing bot/platform entities, avoids a DB migration for the first pass, and fixes the broken LeadBot/MiniApp scenarios at the source instead of hiding symptoms.

## Inputs

- Current production `main` after MiniApp stabilization commits through `99fcb55`.
- User-approved visual direction: dark premium Telegram-native MiniApp screens with stronger home/catalog/detail/forms/contacts, with metallic silver CTAs replacing turquoise.
- Telegram official contract: MiniApp write flows must use `Telegram.WebApp.initData` and backend validation; contact collection should use native `request_contact`.
- Auto.RIA-style form pattern: searchable dependent make/model selectors, broad structured options, and free-text escape hatches.
- Read-only code findings from Telegram, UI/forms, and media/inventory audits in this session.

## Goals

1. LeadBot buttons open the right surface and stop causing `initData` failures for write actions.
2. Lead request flows create a pending intent, close the MiniApp, and continue contact collection in Telegram through native contact request.
3. Sell flow is bot-native for Lead until the upload/session path is stable enough for MiniApp.
4. MiniApp request submission errors are contract-specific, not generic `Network error`.
5. Lead and B2B MiniApp variants keep separate labels, routes, and request semantics.
6. Vehicle cards/details use one presentation layer and no raw artifacts such as `running`, `in_transit`, or Telegram `file_id` values.
7. Catalog card/photo click opens the listing detail; only detail gallery clicks open zoom.
8. Forms become richer without becoming a marketplace rewrite.
9. Contacts/socials are config-driven.
10. Basic CRM history is tied to Telegram identity and existing lead/request records.

## Non-Goals

- No separate MiniApp database.
- No duplicated inventory store for LeadBot.
- No new bot service.
- No full MiniApp rewrite or design-system migration.
- No schema migration unless implementation proves existing JSON/session fields cannot safely hold the data.
- No remote branch deletion or infrastructure restructuring.

## Track 1: Telegram Launch And Contact Handoff

### Current Problems

- Runtime Lead reply keyboard still opens `Продати авто` as MiniApp request flow while presets define it as scenario-like behavior.
- Some fallback links can become external links or `startapp` links without enough slug/write context, causing write screens to open without valid `initData`.
- `POST /api/miniapp/lead-intents` requires valid raw `initData`; when a button opens the app as a normal URL, it fails correctly but the user sees a broken flow.
- Contact request is only sent after a valid pending intent is created, so wrong bot resolution or wrong launch surface breaks the handoff.

### Design

- Treat Lead write actions as private-chat actions:
  - `Підібрати авто`: `KeyboardButton.web_app` to Lead MiniApp request intent.
  - `Запросити умови/ціну`: MiniApp car detail/list action posts a lead intent, then backend sends contact keyboard and asks the MiniApp to close.
  - `Продати авто`: bot-native flow trigger from the LeadBot menu, not a MiniApp form in this pass.
- For non-private contexts, do not expose write MiniApp buttons as bare URLs. Return a safe "open the bot in private chat" action or route to the native bot flow.
- Keep standard Telegram menu button as `web_app` and preserve its current UX.
- Align runtime menu and preset menu behavior so the same action names map to the same flow.
- In reply/inline markup helpers, preserve slug and intent when a read-only MiniApp link is allowed; never degrade write actions into an external URL.
- Constrain bot selection for MiniApp contact handoff to the resolved BotConfig that validated the MiniApp launch.

### Error Contract

MiniApp write endpoints return stable codes:

- `TELEGRAM_INITDATA_REQUIRED`
- `TELEGRAM_INITDATA_INVALID`
- `VALIDATION_ERROR`
- `BOT_FLOW_UNAVAILABLE`
- `CONTACT_REQUEST_SEND_FAILED`

Frontend maps these to Ukrainian messages and next action. Invalid initData says to reopen through the exact bot/menu; network errors say retry; validation errors mark fields.

## Track 2: CRM And Conversation History

### Current Problems

- LeadBot can be a business-client communication channel, but free text in menu state is treated as "use commands/menu" instead of a useful customer message.
- Lead/B2B request history is fragmented across `Lead`, `LeadActivity`, `B2bRequest`, `BotSession`, and bot messages.

### Design

- Use existing identity keys:
  - primary customer key: `companyId + botId + telegramUserId`;
  - chat context key: `chatId`;
  - phone is added after native contact share and used for merge/dedup.
- On Lead free text in `CL_MENU`, create or update a lightweight Lead record when a Telegram user is present, append `LeadActivity` with message payload, and keep the bot response helpful instead of only command-oriented.
- On pending MiniApp intent, store the intent in `BotSession.variables` with `submitId`, kind, car IDs, criteria, and created timestamp.
- On contact share, merge the session intent into the existing request path and append a LeadActivity that links the contact handoff to the created/updated request.
- For B2B free text, keep it scoped to B2B context and do not create Lead customer requests. Store the message as bot/session/activity metadata or platform event depending on existing helpers.
- Do not add a new CRM module; expose the history through existing Lead/B2B request data and payload fields.

## Track 3: Inventory, Media, And Lead/B2B Boundaries

### Current Problems

- Some listings have no browser-loadable media even when Telegram-side media metadata exists.
- B2B inventory photo input may store Telegram `file_id` values as if they were public URLs.
- Showcase fallback can mix Lead and B2B inventory when resolving by bot/company without explicit surface scope.
- Frontend image rendering has weak broken-image fallback.

### Design

- Add/strengthen one server-side vehicle presentation helper used by MiniApp DTOs and Telegram rendering:
  - `title`, `subtitle`, `priceLabel`, `mileageLabel`, `statusLabel`, `specChips`, `detailRows`, `badges`, `mediaUrls`, `hasImages`, `imageCount`.
- Filter public DTO media to browser-loadable URLs only. Do not emit raw Telegram `file_id` in `thumbnail` or `mediaUrls`.
- If B2B bot receives photos as Telegram files, download/store them through existing media storage before making them public. If download fails, keep the Telegram file reference in private metadata and return a placeholder publicly.
- Add a shared `MiniAppImage` component with `onError` fallback and optional next-image fallback.
- Scope inventory fallback by surface:
  - Lead/public catalog uses public customer inventory only.
  - B2B catalog uses B2B workspace/deal inventory rules and B2B labels.
- Keep media reconciliation out of this pass except for preventing broken public DTOs and broken UI states.

## Track 4: MiniApp UI Variants

### Visual Direction

- Dark graphite shell.
- Premium metallic silver CTA gradient, not turquoise.
- Clean white primary text and muted slate secondary text.
- Compact cards with 8-14px radii.
- Mobile-first Telegram-native layout.
- No purple/blue decorative gradients, beige/brown theme, or oversized marketing hero.

### Shared UI Primitives

Use local primitives rather than initializing a full shadcn project:

- `MiniAppShell`
- `MiniAppButton`
- `MiniAppPanel`
- `MiniAppChip`
- `MiniAppInput`
- `MiniAppSelect`
- `MiniAppImage`
- `VehicleCard`
- `BottomNav`

Composition follows shadcn-style rules: predictable props, controlled state, accessible labels, clear variants, no card-inside-card nesting.

### Lead Variant

Bottom nav:

- `Головна`
- `Каталог`
- `Заявки`
- `Контакти`
- `Профіль`

Lead home:

- greeting and CarTié brand block;
- featured car from inventory;
- quick actions: catalog, подбор, sell via bot-native flow, contacts;
- featured/available/in-transit sections using inventory DTOs.

Lead request behavior:

- pick request form for подбор;
- price/terms request from a car card/detail uses selected car context and does not show the full pick form;
- no phone input anywhere in the MiniApp.

### B2B Variant

Bottom nav:

- `Головна`
- `Угоди`
- `Склад`
- `Підтримка`
- `Профіль`

B2B copy and actions remain workspace/deal oriented. Do not reuse Lead customer phrasing for B2B.

### Contacts

Contacts view reads `miniAppConfig.contacts` and `socialLinks` first:

- Telegram channel;
- Telegram chat/bot;
- Instagram;
- website;
- phone;
- custom links.

Fallback is limited to bot username and public site if configured. No fake hardcoded contacts.

## Track 5: Forms And Vehicle Options

### Shared Vehicle Catalog

- Extract a shared vehicle options module from existing `carDb.ts` and MiniApp form data.
- Expand it to a broader make/model catalog that is easy to extend.
- Enrich options from current inventory where available.
- Support dependent brand -> model selection.
- Always include "Інша марка" and "Інша модель" free-text fallback.

### Lead Pick Form

Fields:

- brand;
- model;
- year from/to;
- budget from/to;
- body type;
- fuel/engine;
- mileage;
- city;
- comment.

### Lead Sell Flow

For this pass, Lead sell is bot-native:

- brand;
- model;
- year;
- mileage;
- price;
- city;
- body type;
- condition;
- damage;
- photos;
- comment;
- native contact.

MiniApp may show an intro/start action, but it should start the bot flow and close, not collect phone manually.

### B2B Forms

Keep B2B forms separate and deal/workspace oriented. Do not convert B2B requests into Lead customer подбор requests.

## Implementation Order

1. Tests for launch/write contracts, error codes, and Lead/B2B menu separation.
2. Telegram menu and fallback fixes.
3. Lead intent/contact handoff hardening and basic CRM activity capture.
4. Media/public DTO hardening and shared image fallback.
5. Shared vehicle presentation helper wiring.
6. Shared vehicle options module and richer Lead pick form.
7. UI primitive extraction and premium Lead/B2B screen pass.
8. Browser visual QA, server/web builds, Telegram live smoke.

## Verification

Server:

- `npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts templatePreset.service.test.ts telegramReplyMarkup.test.ts miniAppLeadIntents.test.ts requestContract.service.test.ts showcase.service.miniapp.test.ts`
- `npm --prefix apps/server test -- miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppAuth.service.test.ts`
- `npm --prefix apps/server run build -- --pretty false`

Web:

- `npm --prefix apps/web run build`
- Browser screenshots for Lead and B2B MiniApp home/catalog/detail/request/contacts.
- Visual comparison against the approved concept direction with metallic silver CTAs.

Production smoke:

- `/api/health`
- `/api/miniapp/config?slug=cartie`
- `/api/miniapp/showcases/cartie/inventory?status=AVAILABLE`
- `/api/miniapp/showcases/cartie/inventory?status=PENDING`
- `/api/miniapp/showcases/cardealer_lviv_bot/inventory`
- Manual Telegram: Lead pick submit closes MiniApp and bot asks contact; sell starts bot-native flow; price request from detail closes MiniApp and bot asks contact; B2B keeps B2B screens.

## Risks And Controls

- Telegram write actions cannot be fully validated without live private-chat checks. Control: keep unit tests plus `infra/verify_telegram_live.sh` and manual Telegram smoke.
- Existing DB may contain media metadata without public URLs. Control: public DTO filters and UI placeholders now; reconciliation remains a separate task.
- Full Auto.RIA-level catalog completeness is large. Control: build extendable catalog with inventory enrichment and free-text fallback.
- `MiniApp.tsx` is large. Control: extract only shared primitives and high-risk pieces first; avoid full rewrite in this pass.
