# CarTie MiniApp-First Recovery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or inline execution with tests. Keep the scope small per task and do not rewrite the whole app.

**Goal:** Make MiniApp the main product surface for Lead and B2B flows, while Telegram Bot remains the launch, identity, contact, notification, channel, and fallback connector.

**Architecture:** Inventory stays the single source of truth. Lead MiniApp and B2B MiniApp are separate variants over the same API layer. Bot flows must not duplicate MiniApp logic; they only continue steps Telegram handles better: valid launch, native phone contact, notifications, channel posts, admin messages, media fallback.

**Tech Stack:** React/Vite MiniApp, Express, Prisma/Postgres, Telegram Bot API, Telegram Mini Apps, Meta CAPI.

---

## Product Decision

The previous plan treated several flows as bot-native by default. The better target for CarTie is MiniApp-first:

- MiniApp is where users browse, create requests, manage deals, add cars, see statuses, contacts, favorites, and profile.
- Bot is the Telegram connector:
  - opens MiniApp with valid `initData`;
  - requests phone through native `request_contact` only when needed;
  - sends notifications and reminders;
  - publishes channel posts;
  - delivers admin/B2B messages;
  - provides fallback when MiniApp upload/session is impossible.

This means we should stop adding rich UX to bot step wizards unless it is a Telegram-only capability.

---

## Two MiniApps

### Lead MiniApp

Audience: public buyer/seller/client.

Main tabs:
- `Головна`
- `Каталог`
- `Заявки`
- `Контакти`
- `Профіль`

Functions:
- browse inventory and transit cars;
- open car detail;
- favorite cars;
- request price/terms for one or many cars;
- create pickup/import request;
- create sell-car draft with photos if upload works;
- view own request statuses;
- contact manager/socials;
- keep user profile and known contact state.

Bot responsibilities for Lead:
- open MiniApp correctly from menu and buttons;
- ask phone once via `request_contact` if no verified phone exists;
- notify manager/admin after request;
- continue sell flow in bot only if MiniApp photo/session upload fails.

### B2B MiniApp

Audience: dealers/partners/admins.

Main tabs:
- `Головна`
- `Запити`
- `Склад`
- `Варіанти`
- `Профіль`

Functions:
- partner registration/access request;
- partner profile and subpartners;
- create B2B request;
- see my requests;
- see received variants;
- submit vehicle variant to another request;
- mark variants `Підходить` / `Не підходить`;
- admin FIT queue;
- manage own inventory: add car, edit price/status/photos.

Bot responsibilities for B2B:
- open MiniApp correctly;
- remove old reply keyboards;
- publish request post to private CarDealer channel;
- send partner/admin notifications;
- request/verify contacts when needed;
- fallback for Telegram photo upload.

---

## Phase 0: Stop The Current Breakage

### Task 0.1: Fix B2B Old Keyboard

Problem: B2B `/start` still sends persistent reply keyboard. Telegram clients keep it in chat and it looks like an old broken menu.

Implementation:
- Replace registered B2B reply keyboard with inline keyboard.
- Send `{ remove_keyboard: true }` before the new B2B menu.
- Inline buttons should either open MiniApp with `web_app` in private chat or start safe bot fallback.

Files:
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- add/extend B2B menu tests near Telegram routing tests.

Acceptance:
- B2B `/start` no longer sends `reply_markup.keyboard`.
- B2B `/start` clears stale keyboard.
- B2B MiniApp button opens `/p/app/cardealer_lviv_bot` with valid Telegram context.

### Task 0.2: Unify MiniApp Launch Buttons

Problem: standard menu works, but platform/custom buttons can still open as direct links or stale URLs.

Implementation:
- All private in-chat MiniApp buttons use `web_app`.
- Group/channel/public write flows use private bot deep link, not direct MiniApp URL.
- Stored `menuConfig` must be normalized even if runtime template menu is generated.
- Preserve query params: `entry`, `type`, `status`, `carId`, `requestId`, `v`.

Files:
- `apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `apps/server/src/services/templatePreset.service.ts`
- repair script for both Lead and B2B menu configs.

Acceptance:
- Lead and B2B standard menu buttons are `web_app`.
- Lead and B2B runtime buttons are `web_app` in private chat.
- No write-flow button opens MiniApp as normal external browser URL.

### Task 0.3: Kill Legacy Broken Submit Paths

Problem: old `web_app_data` handlers can bypass `/lead-intents`, causing duplicate requests and repeated phone prompts.

Implementation:
- Route legacy Lead `web_app_data` submissions into the same request contract as `/lead-intents`.
- Or reject legacy Lead writes with a clear message telling user to reopen MiniApp.
- Keep read-only/share compatibility only if it does not create a request.

Files:
- `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts`
- `apps/server/src/services/requestContract.service.ts`

Acceptance:
- Lead submit has exactly one backend path.
- Known contact is reused.
- Duplicate `submitId` does not create a new request.

---

## Phase 1: MiniApp-First Lead

### Task 1.1: Lead Request Center In MiniApp

Build `Заявки` as a real user request center, not just a form.

Screens:
- create pickup request;
- request price/terms for selected cars;
- sell-car draft;
- my active requests;
- completed/cancelled requests.

Rules:
- no manual phone input;
- if contact known, submit finalizes directly;
- if contact missing, MiniApp submits intent and bot asks native contact once;
- after submit, MiniApp shows success and may close.

Acceptance:
- Buy/pick request works from MiniApp.
- Price request from car detail works.
- Sell draft does not become a pickup request.
- Phone is not requested after every submit.
- Operator/admin notification shows full request context, not only an internal car code.

### Task 1.2: Better Lead Forms

Use searchable selects, not brand button grids.

Fields:
- brand multi-select;
- model dependent multi-select;
- year from/to;
- budget from/to;
- body type;
- fuel/engine;
- mileage;
- city;
- comment.

Data source:
- curated local taxonomy;
- observed inventory brand/model values;
- free text fallback `Інше`.

Acceptance:
- user can search BMW/Mercedes/etc.;
- model list depends on brand;
- request payload stores normalized labels and raw fallback.

### Task 1.3: Lead Catalog And Photos

Rules:
- catalog card/photo click opens car detail;
- detail image click opens gallery;
- transit and stock are backend filters;
- empty state shows pickup CTA.

Acceptance:
- no catalog click opens only zoom;
- no Telegram `file_id` leaks into public images;
- vehicle labels are user-facing Ukrainian labels.

### Task 1.4: Lead Request Handoff Context

Every request created from a car or selected cars must carry a readable vehicle snapshot. Operators should not receive only `carListingId`, `REQ-*`, or another opaque code.

Request payload should include:
- `selectedCars`: array with `id`, `title`, `year`, `priceLabel`, `statusLabel`, `thumbnail`, `publicUrl`;
- `vehiclePresentation`: one-car summary when request is for a specific car;
- `requestSummary`: human-readable text for Telegram/admin notification;
- `sourceView`: `catalog`, `detail`, `favorites`, `home`, or `request_form`;
- `customerIntent`: `PRICE_TERMS`, `PICKUP`, `SELL`, `SUPPORT`;
- `managerAction`: short next step, for example `Передзвонити`, `Уточнити умови`, `Підібрати альтернативи`.

Admin/Bot message format:
- request public ID;
- customer name, Telegram username/id, phone if known;
- intent label;
- selected car title, year, price, status, location;
- thumbnail/photo when available;
- direct CRM/request link;
- direct MiniApp car link;
- comment/criteria.

Acceptance:
- manager can understand which car the request is about without opening raw JSON.
- if selected car was deleted/hidden later, request still keeps the snapshot that existed at submit time.
- multi-car request lists all selected cars with readable labels.
- Telegram admin notification and CRM request detail use the same presenter.

---

## Phase 2: MiniApp-First B2B

### Task 2.1: B2B Access And Profile

MiniApp should support:
- request access;
- register partner company;
- invite/add subpartner;
- show partner profile;
- show role: owner/agent/admin.

Bot still sends admin notifications and approval buttons.

Acceptance:
- unknown B2B user sees access request UI;
- approved user sees B2B dashboard;
- subpartner belongs to parent `PartnerCompany`.

### Task 2.2: B2B Request Board

Move the main B2B request workflow into MiniApp.

Screens:
- create request;
- my requests;
- request detail;
- channel post link/status.

Backend:
- every B2B request has `publicId` like `CD-YYYY-000123`;
- every MiniApp-created B2B request sets `requesterPartnerId`;
- no B2B MiniApp request creates a customer Lead.

Bot:
- publishes the request to private CarDealer channel;
- sends notifications.

Acceptance:
- partner creates request in MiniApp;
- channel receives no-contact request post;
- request appears in partner `Мої запити`.

### Task 2.2a: B2B Request And Variant Context

B2B requests and variants must be understandable in follow-up messages and MiniApp lists. Public IDs are useful, but never enough by themselves.

B2B request snapshot should include:
- public ID `CD-YYYY-000123`;
- requested make/model/year/budget/mileage/fuel/city;
- requester company name without contact data;
- channel post URL/message ID;
- status and next action.

B2B variant snapshot should include:
- request public ID;
- offered car title, year, mileage, price, fuel, condition;
- photo thumbnails;
- seller partner company name;
- contact fields stored internally but hidden from requester until FIT;
- admin-only full contact block after FIT.

Acceptance:
- requester sees clear vehicle info, not just variant/request IDs.
- admin FIT message includes both sides and exact vehicle context.
- channel/private messages and MiniApp detail screen render from the same snapshot/presenter.

### Task 2.3: B2B Variant Board

Move variant submission and decisions into MiniApp.

Screens:
- submit variant for request;
- received variants;
- variant detail;
- `Підходить` / `Не підходить`;
- admin FIT queue.

Rules:
- requester never sees seller contact before FIT;
- admin sees full contacts only after FIT;
- free text is checked for phone/contact leakage.

Acceptance:
- seller submits variant with photos;
- requester sees variant without contacts;
- FIT sends full contact package to admin;
- NOT_FIT does not leak contacts.

### Task 2.4: B2B Inventory In MiniApp

MiniApp should handle:
- add car;
- edit car;
- upload/manage photos;
- edit price;
- mark sold/reserved/available;
- publish/share car.

Bot fallback:
- if photo upload fails in MiniApp, continue photo upload in Telegram bot.

Acceptance:
- partner inventory is scoped by `partnerCompanyId`;
- partner cannot edit another partner inventory;
- no separate inventory storage is created.

---

## Phase 3: Shared Data Layer

### Task 3.1: Vehicle Presentation

One presenter for:
- MiniApp cards;
- detail page;
- favorites;
- Telegram car post;
- request/variant previews.

Output:
- title;
- subtitle;
- price;
- mileage;
- engine/battery;
- drive;
- condition;
- damage;
- status;
- location;
- badges;
- media URLs.

Acceptance:
- technical values like `running`, `in_transit`, `awd`, `diesel` do not appear raw in UI.

### Task 3.1a: Request Presentation Snapshot

Create one request presentation helper for Lead and B2B follow-up.

Presenter output:
- `requestTitle`;
- `intentLabel`;
- `customerLabel`;
- `contactLabel`;
- `vehicleLines`;
- `criteriaChips`;
- `statusLabel`;
- `adminNextAction`;
- `links`: CRM URL, MiniApp car URL, channel post URL;
- `telegramText`;
- `miniAppCard`.

Rules:
- IDs remain available for debugging, but are never the primary visible label.
- Use `VehiclePresentation` for cars.
- Snapshot selected vehicle data into request payload at submit time.
- Rendering must work even if the current `CarListing` changes later.

Acceptance:
- Lead admin notification, B2B channel post, B2B variant message, and CRM request detail use the same readable request presentation.
- no user-facing message says only `carListingId`, `variantId`, or raw `publicId` without context.

### Task 3.2: Vehicle Availability

Current `CarListing.status` is overloaded. Keep heuristic fallback now, plan migration later.

Short term:
- derive stock/transit from hashtags/text/status.

Migration later:
- `availabilityState`: `IN_STOCK`, `IN_TRANSIT`, `IMPORT_TO_ORDER`, `SOLD`, `RESERVED`.
- `publicationStatus`: `DRAFT`, `REVIEW`, `PUBLISHED`, `HIDDEN`.

Acceptance:
- `status=PENDING` MiniApp tab shows transit cars even if legacy DB status is `AVAILABLE`.

---

## Phase 4: CRM And Meta

### Task 4.1: CRM Identity

Short term without migration:
- dedupe by `submitId`;
- dedupe by Telegram user;
- reuse known phone;
- append events/notes instead of creating clones.

Migration later:
- add `LeadIdentity` for Telegram, phone, website visitor, Meta external id.

Acceptance:
- same Telegram user does not create duplicate customer records on every request.
- operator sees request history by user.

### Task 4.2: Meta Readiness

Unify Meta CAPI:
- one company-scoped service;
- stable `event_id`;
- hashed phone/email/name only;
- external_id from Telegram/customer identity;
- `_fbc/_fbp` when available;
- idempotency in `IntegrationEventLog`;
- no raw PII or access tokens in logs.

Acceptance:
- Lead, Contact, ViewContent, Search, SubmitApplication events can be sent per company.
- duplicate event is skipped by event_id.

---

## Execution Order

1. B2B old keyboard and launch buttons.
2. Legacy submit path cleanup.
3. Lead MiniApp request center and contact reuse.
4. B2B MiniApp request board with partner ownership.
5. B2B variant board and FIT queue.
6. B2B inventory management.
7. Shared vehicle presentation and media cleanup.
8. CRM identity migration proposal.
9. Meta CAPI consolidation.

---

## Minimal Test Gate

Server:

```bash
npm --prefix apps/server test -- miniAppLeadHandoff.routes.test.ts clientLeadMiniAppMenu.test.ts telegramReplyMarkup.test.ts miniappUrl.test.ts miniAppAuth.service.test.ts requestContract.service.test.ts
npm --prefix apps/server run build -- --pretty false
```

Web:

```bash
npm --prefix apps/web run build
```

Production smoke:

```bash
curl -fsS https://cartie2.umanoff-analytics.space/api/health
curl -fsS 'https://cartie2.umanoff-analytics.space/api/miniapp/config?slug=cartie'
curl -fsS 'https://cartie2.umanoff-analytics.space/api/miniapp/config?slug=cardealer_lviv_bot'
bash infra/verify_telegram_live.sh
```

Manual Telegram:
- Lead standard menu opens MiniApp with initData.
- Lead custom buttons open MiniApp with initData.
- B2B `/start` removes old keyboard.
- B2B MiniApp opens from bot.
- Lead request submits and asks phone only if unknown.
- B2B request created in MiniApp appears under the partner and posts to channel.
