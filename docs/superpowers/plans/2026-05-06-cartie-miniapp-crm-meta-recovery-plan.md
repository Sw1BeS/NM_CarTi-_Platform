# CarTie MiniApp, Lead CRM, Meta, And Inventory Recovery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Execute one task at a time, keep checklist state current, and run the listed tests at each gate.

**Goal:** Fix the remaining LeadBot/MiniApp reliability issues, stop repeated phone prompts, make leads/requests CRM-grade enough for operators, separate Lead and B2B flows, normalize vehicle data for the two CarTie business directions, and consolidate Meta tracking without creating a new service or duplicating inventory.

**Architecture:** Keep `Inventory -> Request -> Lead/Contact -> Telegram/Admin/Meta` as the shared product backbone. MiniApp and bot surfaces should only render and submit through this backbone. First patch the launch/contact/idempotency bugs, then add a thin CRM identity layer, then normalize vehicle states/taxonomy and Meta events.

**Tech Stack:** TypeScript, Express, Prisma/Postgres, Vitest, React/Vite, Telegram Bot API, Telegram Mini Apps, Meta Conversions API.

**Sources checked:**
- Telegram Mini Apps launch modes, initData validation, menu/direct-link behavior: https://core.telegram.org/bots/webapps
- Telegram Bot API `KeyboardButton.request_contact` and `InlineKeyboardButton.web_app` private-chat constraint: https://core.telegram.org/bots/api
- Meta Conversions API Direct Integration Playbook: event_id, external_id, dedupe, Test Events, EMQ: https://storage.googleapis.com/lr-tech-docs-resources/PDFs/Conversions-API-Direct-Integration-Playbook_English.pdf
- WAI-ARIA combobox pattern for searchable selects: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- AUTO.RIA current used-car search shape: https://auto.ria.com/uk/legkovie/

---

## 2026-05-08 Accepted Implementation Delta

This pass executes the production recovery subset without schema migration:

- Normalize stale platform/menu MiniApp URLs through `normalizeMiniAppButtonUrl()` and preserve deep-link params (`entry`, `type`, `status`, `carId`, future query params).
- Keep Lead `/start` and private write buttons as Telegram `web_app`; Lead `SELL` is a bot-native continuation, not a MiniApp pickup request.
- Reject Lead writes to legacy `/api/miniapp/requests` with `LEAD_WRONG_ENDPOINT`; Lead MiniApp writes use `/api/miniapp/lead-intents`, while B2B/internal compatibility keeps `/api/miniapp/requests`.
- Reuse known verified Telegram contact for Lead users; do not ask for phone after every submit.
- Add submit idempotency using `tracking.submitId` and a deterministic `miniapp-submit:<company>:<bot>:<telegramUser>:<submitId>` key to avoid duplicate CRM requests after session finalization.
- Validate native Telegram contact ownership when `contact.user_id` is present.
- Use company-scoped Meta CAPI integration first, with stable `event_id`, hashed user data, idempotency log, and safe diagnostics; legacy env Meta remains only a fallback.
- Publish B2B requests with `CD-YYYY-000123` public IDs and both `Є авто` and `Відкрити в боті` buttons.
- Allow B2B FIT/NOT_FIT decisions from callback context without requiring an active variant draft, and send admin full contacts only on FIT.
- Improve Lead request form UX with searchable make/model comboboxes and multi-select for pickup criteria; B2B/sell contexts remain single-select.

Out of scope for this patch unless explicitly scheduled: Prisma schema migrations (`LeadIdentity`, split vehicle availability/publication status), broad admin CRM redesign, and destructive data repair scripts.

---

## 2026-05-13 Current Audit Delta And MVP Slices

Latest explicit decision wins: most Lead/B2B working surfaces should live in MiniApp, while Telegram remains the connector for valid MiniApp launch, native contact sharing, admin callbacks, channel posts, and message delivery. Native Telegram menu button opens the base MiniApp; persistent reply keyboard buttons open concrete MiniApp sections; message inline buttons remain message-specific actions such as B2B `Є авто`, FIT/NOT_FIT, admin claim/status actions.

### Current Code Map Confirmed

- Telegram runtime: `telegram.routes.ts`, `pipeline.ts`, `routeMessage.ts`, `routeCallback.ts`, `routeWebApp.ts`, `routeChannelPost.ts`, `telegramOutbox.ts`, `telegramSender.ts`, `miniappUrl.ts`, `telegramReplyMarkup.ts`, `callbackUtils.ts`.
- LeadBot: `routeMessage.ts` CLIENT_LEAD branches, `clientLeadMiniAppMenu.ts`, `leadBuyWizard.ts`, `leadSellWizard.ts`, `leadService.ts`, `miniAppRoutes.ts` `/lead-intents` and `/bot-flows`.
- B2B Bot: `routeMessage.ts` B2B branches, `b2bRegistrationWizard.ts`, `b2bRequestWizard.ts`, `b2bVariantWizard.ts`, `b2bSellWizard.ts`, `b2bRegistration.service.ts`, `b2bRouting.service.ts`, `b2bWhitelist.service.ts`, `b2bV2.routes.ts`.
- MiniApp: web route `/p/app` and `/p/app/:slug`, `MiniApp.tsx`, `MiniAppShell.tsx`, `CatalogView.tsx`, `RequestView.tsx`, `FavoritesView.tsx`, `ProfileView.tsx`, `miniappApi.ts`, `entryIntent.ts`, `leadIntentOutcome.ts`.
- CRM/request/contact: Prisma `Lead`, `LeadActivity`, `B2bRequest`, `RequestVariant`, newer `Contact`, `Case`, `Conversation`, plus `lead.repository.ts`, `request.repository.ts`, `requestContract.service.ts`, `miniapp.service.ts`, `legacyLeads.routes.ts`, `requests.routes.ts`.
- Inventory/showcase: Prisma `CarListing`, `Showcase`, `PartnerCompany`, `MiniAppFavorite`, `ShowcaseService`, `inventory.service.ts`, `mapInventoryOutput`, `vehiclePresentation.ts`, `requestPresentation.ts`, `cardRenderer.ts`, `carCardRenderer.v2.ts`.
- Admin/channel notifications: `routeMessage.ts`, `routeCallback.ts`, B2B wizards, lead sell wizard, `b2bRouting.service.ts`, `telegramOutbox.ts`, `IntegrationEventLog`.
- Meta: company-scoped `IntegrationService.metaPixelTrackEvent`, legacy `modules/Integrations/meta.service.ts`, legacy `modules/Integrations/meta/meta.service.ts`, web `MiniApp.tsx` tracking capture and `/miniapp/events`.
- SalesDrive: no current code/config enum was found for `SalesDrive`/`SALESDRIVE`; add only a read-only connector skeleton later, with env/secret-store credentials and write flags disabled by default.

### Confirmed Product Gaps

- Admin chat is still not a true workbench everywhere: some messages have no CRM/open/status action and do not always include human-readable vehicle context.
- Lead/B2B identity is not canonical: `Contact` exists, but most flows still operate on legacy `Lead` and JSON payloads.
- Request status history is fragmented: variants have richer history than requests; request assignment is a string field.
- B2B MiniApp is still thinner than the backend capabilities; existing API methods for my requests, variants, and fit queue are not fully rendered as a partner portal.
- Meta tracking exists but is split between company-scoped and legacy paths; MiniApp tracking metadata is not consistently linked to final CRM entities.
- SalesDrive connector is absent; do not use pasted credentials directly in code, logs, or commits.

### Target Architecture Without Overbuild

- Inventory owns car data.
- Showcase owns saved views/presets and rendering rules over inventory.
- CRM owns contact identity, leads, requests, statuses, assignments, timeline, dedupe, and external sync state.
- Telegram connector owns Bot API, MiniApp launch/auth, chat/menu/buttons, channel posting, and callbacks.
- Analytics connector owns browser/server event capture, `event_id` dedupe, CAPI dispatch, and logs.
- SalesDrive connector is a read-only/export-first integration until write sync is explicitly enabled by flags and owner approval.

### MVP Vertical Slices

1. Lead/MiniApp submit -> CRM/admin work item:
   - Keep `/api/miniapp/lead-intents`.
   - Reuse known verified phone.
   - Preserve submit idempotency.
   - Send admin message with readable vehicle/request context, CRM link, contact action, and user link.
   - Show persistent MiniApp submit error/recovery state instead of only toast.

2. B2B partner portal:
   - Keep partner identity on `PartnerCompany` + `PartnerUser`.
   - Render MiniApp tabs for active requests, received variants, my inventory/showcase, team, and admin fit queue where backend endpoints already exist.
   - Keep contacts hidden until FIT/admin-approved routing.

3. CRM identity/timeline:
   - Route all lead creation through `createOrMergeLead` or `LeadRepository`.
   - Add canonical resolver over Telegram ID + phone + external IDs.
   - Add append-only timeline/status events before adding destructive merges.

4. Meta and SalesDrive readiness:
   - Move runtime CAPI calls to company-scoped integration.
   - Attach MiniApp/UTM/fbp/fbc tracking to final Lead/Request.
   - Add SalesDrive read-only connector skeleton and dry-run import preview only; no writes without flags.

### Implemented In This Pass

- Added shared `leadAdminNotification` helper for MiniApp/Lead admin messages.
- Added actionable admin notification buttons for known-contact MiniApp leads and native-contact MiniApp handoff.
- Made legacy MiniApp web_app_data known-contact notifications use the same admin helper.
- Made legacy lead status callback parsing tolerate IDs containing underscores.
- Added persistent MiniApp request submit error panel with retry context and bot-open recovery, while keeping form data intact.
- Added tests covering actionable admin notifications for `/lead-intents` and native contact handoff.
- Allowed safe read-only MiniApp preview events without `initData` for admin/car links, while still rejecting lead/write events without signed Telegram init data.

---

## Current Dependency Map

### Telegram And MiniApp Launch

- Standard Telegram menu launch is built through `buildMiniAppUrl()` and is comparatively safe.
- Lead runtime `/start` menu uses `buildClientLeadMiniAppKeyboard()`, not saved platform `menuConfig`.
- Dynamic `menuConfig` is explicitly bypassed for `CLIENT_LEAD` and `B2B`, while the older dynamic menu path can still inject raw `btn.value` into `web_app.url`.
- Scenario runtime link repair exists, but only handles a narrow set of stale URLs.
- Telegram write flows need private `web_app` buttons or bot-native continuation; direct links are acceptable only for read-only/open intents.

### Lead Request Lifecycle

- Lead MiniApp write path is `POST /api/miniapp/lead-intents`.
- The route validates raw `initData`, rejects phone, writes `miniappPendingIntent` into `BotSession`, sends native `request_contact`, and tells the MiniApp to close.
- The contact handler finalizes `miniappPendingIntent` into `Lead` and `B2bRequest`.
- The route sends `request_contact` even when there is already a known phone or the same pending submit is detected.
- Pending dedupe is only session-local. After finalization clears the session, the same logical submit can create a new request.

### CRM Data

- `Lead` is currently a partly normalized log entity: no durable unique identity by Telegram user, no top-level request lifecycle, and app-level dedupe is scoped to a 14-day window.
- `createOrMergeLead()` merges duplicates but does not always update `Lead.phone` and returns `request: null` on duplicate, which forces request creation elsewhere.
- `Contact`/`Record` dual-write exists but is best-effort and not the active identity source for MiniApp handoff.
- `B2bRequest` is the operational request object for both customer requests and B2B requests, but its semantics are mostly in JSON payload.

### Inventory And Vehicle Data

- `CarListing.status` is overloaded: `PENDING` means review/not-auto-published in ingestion and "in transit" in MiniApp menus.
- Current DB sample showed no true `PENDING` rows but multiple `AVAILABLE` rows with transit text, so transit catalog depends on heuristics.
- `CarListing` stores canonical fields plus freeform `specs`, `mediaItems`, and `originalRaw`. Some public DTOs still risk exposing private Telegram media metadata if not filtered at the boundary.
- MTProto ingestion accepts weaker messages than Bot API channel ingestion, so noisy titles and non-car text can enter inventory.

### Meta And Admin/B2B

- There are three Meta implementations: per-company `Integration`, legacy `SystemSettings`, and env/global `MetaService`.
- The active lead/request calls use the env/global Meta service and pass mismatched user-data keys, so phone/email matching can be empty or unsafe.
- Per-company `Integration(type=META_PIXEL)` exists but is not the runtime path.
- `IntegrationEventLog.idempotencyKey` exists and can be used for Meta send idempotency.
- B2B admin callbacks rely on configured chat checks in some places, while stronger Telegram admin membership checks already exist in `telegramAdminAccess`.

---

## Confirmed Problems

- **Button compatibility:** platform-configured MiniApp buttons and runtime buttons do not share one URL normalization path. This explains why the standard menu works while "our buttons" can open stale/bare URLs or wrong contexts.
- **Repeated phone prompt:** `/lead-intents` unconditionally sends native contact request after creating/updating a pending intent.
- **Duplicate leads/requests:** lead dedupe is window-based and request dedupe is not durable for the Lead MiniApp handoff path.
- **Lead/B2B boundary drift:** frontend mostly separates Lead and B2B, but server `/miniapp/requests` remains permissive and legacy `web_app_data` can still create Lead request data through older paths.
- **Inventory direction mismatch:** "in stock" vs "in transit/import" is not a normalized field; it is inferred from status/text.
- **Meta tracking gap:** current CAPI implementation is split, not per-company, lacks stable `event_id`, and may send weak/empty matching fields.
- **Form UX:** current form uses small chip grids/static lists. AUTO.RIA-style vehicle flows need searchable dependent make/model selects, ranges, and multiselect where useful.

---

## Decision: Two Execution Phases

Do not try to ship the CRM/schema work before the launch/contact bugfixes. The first phase should be a narrow production recovery patch. The second phase can include additive schema changes and deeper admin/Meta/inventory changes.

---

# Phase 1: Production Recovery Patch

## Task 1: Shared MiniApp Button URL Normalization

**Files:**
- Modify `apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts`
- Modify `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- Modify `apps/server/src/modules/Communication/bots/scenario-engine/runtime/helpers.ts`
- Modify `apps/server/src/services/templatePreset.service.ts`
- Create or extend `apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.test.ts`
- Modify `apps/server/scripts/repair_client_miniapp_menu.ts` or create `apps/server/scripts/repair_miniapp_menu_config.ts`

- [ ] Add RED tests that stale values are repaired:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeMiniAppButtonUrl } from './miniappUrl.js';

describe('normalizeMiniAppButtonUrl', () => {
  const bot = {
    config: {
      defaultShowcaseSlug: 'cartie',
      miniAppConfig: { url: 'https://cartie2.umanoff-analytics.space/p/app/cartie' }
    }
  } as any;

  it('rewrites stale /p/app slug and preserves write params', () => {
    const url = normalizeMiniAppButtonUrl(bot, 'https://old.example/p/app/old?entry=request&type=BUY');
    expect(url).toContain('/p/app/cartie');
    expect(url).toContain('entry=request');
    expect(url).toContain('type=BUY');
  });

  it('converts direct startapp aliases to configured MiniApp URL', () => {
    const url = normalizeMiniAppButtonUrl(bot, 'https://t.me/cartie_bot/app?startapp=view_transit');
    expect(url).toContain('/p/app/cartie');
    expect(url).toContain('entry=inventory');
    expect(url).toContain('status=PENDING');
  });
});
```

- [ ] Implement `normalizeMiniAppButtonUrl(bot, rawValue, fallbackIntent?)` as the single repair entrypoint.
- [ ] Use it in dynamic menu rendering before `web_app.url = ...`.
- [ ] Use it in scenario-engine link resolution.
- [ ] Use it in preset patching.
- [ ] Generalize repair script to dry-run/apply all enabled bots:

```bash
npm --prefix apps/server test -- miniappUrl.test.ts clientLeadMiniAppMenu.test.ts telegramReplyMarkup.test.ts templatePreset.service.test.ts
npm --prefix apps/server tsx scripts/repair_miniapp_menu_config.ts --dry-run
npm --prefix apps/server tsx scripts/repair_miniapp_menu_config.ts --apply
```

## Task 2: Clear Contract For Platform MenuConfig

**Files:**
- Modify `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- Modify admin web bot menu settings copy only if current page exposes template menus.

- [ ] Decide runtime behavior: `CLIENT_LEAD` and `B2B` remain preset-driven, but platform `menuConfig` must still be normalized because chat-menu sync and scenario-rendered menus can use it.
- [ ] Add a test proving `CLIENT_LEAD` `/start` uses fixed two-column runtime menu and all stored `menuConfig` web app values are repairable.
- [ ] Add an admin-facing warning if editing preset-driven menus: "Runtime menu is generated by template; saved config is used for sync/repair."

## Task 3: Known Contact Reuse And No Repeated Phone Prompt

**Files:**
- Modify `apps/server/src/services/requestContract.service.ts`
- Modify `apps/server/src/routes/miniAppRoutes.ts`
- Modify `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- Modify `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- Add `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts`
- Add/extend `apps/server/src/modules/Communication/telegram/core/leadService.test.ts`

- [ ] Add RED tests:

```ts
it('does not send contact request when the same Telegram user already has a phone', async () => {
  // seed Lead: companyId, botId, userTgId: "219480233", phone: "+380635055252"
  // POST /api/miniapp/lead-intents with valid initData for same user
  // expect telegramOutbox.sendMessage not called with request_contact
  // expect response contactRequested false, finalized true
});

it('does not send another contact request for duplicate pending submitId', async () => {
  // seed BotSession state CL_MINIAPP_CONTACT with matching tracking.submitId
  // POST same submitId
  // expect response duplicate true and contactRequested false
});
```

- [ ] Add `findKnownLeadContact({ companyId, botId, telegramUserId })`:

```ts
const known = await prisma.lead.findFirst({
  where: {
    companyId,
    OR: [
      { userTgId: telegramUserId },
      { payload: { path: ['telegramUserId'], equals: telegramUserId } as any }
    ],
    phone: { not: null }
  },
  orderBy: { updatedAt: 'desc' }
});
```

- [ ] If known phone exists, create/finalize the intent immediately and notify bot/admin, but do not ask contact again.
- [ ] If duplicate pending submit exists, return the current state and do not send another contact request.
- [ ] Validate `message.contact.user_id === message.from.id` where Telegram provides it. If it differs, ask the user to share their own contact.
- [ ] Ensure duplicate lead merges update `Lead.phone` and `payload.phone`.

## Task 4: Durable Request Idempotency

**Files:**
- Modify `apps/server/src/services/requestContract.service.ts`
- Modify `apps/server/src/services/miniapp.service.ts`
- Modify `apps/server/src/repositories/request.repository.ts` if useful
- Add tests in `apps/server/src/services/requestContract.service.test.ts`

- [ ] Add shared helper:

```ts
export const buildMiniAppSubmitKey = (params: {
  companyId: string;
  botId?: string | null;
  telegramUserId?: string | null;
  submitId?: string | null;
}) => [
  'miniapp-submit',
  params.companyId,
  params.botId || 'no-bot',
  params.telegramUserId || 'anonymous',
  params.submitId || 'no-submit'
].join(':');
```

- [ ] Before creating `B2bRequest`, search by:
  - `payload.tracking.submitId`
  - `payload.idempotencyKey`
  - same company/bot/chat/request type + same selected car ids inside a short duplicate window
- [ ] Store `payload.idempotencyKey` on every request created from MiniApp and bot handoff.
- [ ] Keep returning the existing request on duplicate instead of creating another row.
- [ ] Add tests for duplicate `submitId` after session was finalized.

## Task 5: Lead/B2B Write Surface Guardrails

**Files:**
- Modify `apps/server/src/routes/miniAppRoutes.ts`
- Modify `apps/server/src/services/miniapp.service.ts`
- Extend route tests.

- [ ] `/api/miniapp/lead-intents` remains Lead-only and rejects B2B configs.
- [ ] `/api/miniapp/requests` becomes B2B/internal/legacy-only. For Lead configs it returns:

```json
{
  "error": "Lead MiniApp writes must use /api/miniapp/lead-intents",
  "code": "LEAD_WRONG_ENDPOINT"
}
```

- [ ] Legacy `web_app_data` paths must set the same idempotency key and surface type, so they do not fork a parallel Lead flow.
- [ ] MiniApp frontend uses `/lead-intents` for Lead PICK/PRICE_TERMS and `/bot-flows` for Lead SELL/SUPPORT.

## Task 6: Better Request Presentation For Operators

**Files:**
- Modify `apps/server/src/services/requestContract.service.ts`
- Modify `apps/server/src/services/dto.ts`
- Modify `apps/web/src/pages/app` request/lead views after locating current components with `rg "B2bRequest|LeadActivity|requestSubtype" apps/web/src/pages/app`

- [ ] Normalize request payload summary:

```ts
type RequestPresentation = {
  title: string;
  sourceLabel: 'MiniApp' | 'Telegram Bot' | 'B2B Bot' | 'Admin';
  customerLabel: string;
  contactLabel?: string;
  intentLabel: 'Підбір авто' | 'Ціна/умови' | 'Продаж авто' | 'B2B заявка';
  selectedCarLabels: string[];
  criteriaChips: string[];
  timeline: Array<{ at: string; label: string }>;
};
```

- [ ] Use the presenter for admin CRM lists/detail and bot admin notifications.
- [ ] Keep raw payload available for debugging but not primary UI.

# Phase 2: CRM, Meta, Inventory, And Rich Forms

## Task 7: Minimal CRM Identity Layer

**Decision:** use existing `Lead` immediately, but add an additive identity model if product accepts a DB migration. This is the smallest reliable way to stop identity drift across LeadBot, MiniApp, B2B bot, and future web leads.

**Prisma migration proposal:**

```prisma
model LeadIdentity {
  id          String   @id @default(cuid())
  companyId   String
  leadId      String
  provider    String   // TELEGRAM, PHONE, WEBSITE, META
  externalId  String   // tg user id, normalized phone, visitor id, meta external id
  confidence  String   @default("HIGH")
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @updatedAt
  payload     Json?    @db.JsonB

  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@unique([companyId, provider, externalId])
  @@index([leadId])
  @@index([companyId, provider])
}
```

- [ ] Add migration only after Phase 1 passes production smoke.
- [ ] Backfill identities from `Lead.userTgId`, `Lead.phone`, and `payload.telegramUserId`.
- [ ] Update create/merge logic to resolve identity first, then lead.
- [ ] Add an admin lead timeline: messages, requests, contact shares, favorites, Meta sends.

## Task 8: Consolidated Meta CAPI Integration

**Files:**
- Create `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`
- Modify `apps/server/src/modules/Integrations/integration.service.ts`
- Modify `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- Modify `apps/server/src/services/requestContract.service.ts`
- Modify `apps/server/src/modules/Sales/requests/requests.routes.ts`
- Add `apps/server/src/modules/Integrations/meta/metaCapi.service.test.ts`

- [ ] Disable direct env/global `MetaService` calls from lead/request flows after new service is wired.
- [ ] Resolve `Integration(type=META_PIXEL, isActive=true)` by company.
- [ ] Build events with stable `event_id`:

```ts
const eventId = `meta:${companyId}:${eventName}:${entityType}:${entityId}:${stage}`;
```

- [ ] Use `IntegrationEventLog.idempotencyKey = eventId` to skip duplicate sends.
- [ ] Hash normalized user data:

```ts
const sha256 = (value: string) =>
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
```

- [ ] Include `external_id` from Telegram user id or `LeadIdentity` id, `ph` from normalized phone, and optional `client_ip_address`/`client_user_agent` when available.
- [ ] Use `action_source: 'chat'` for Telegram bot leads and `action_source: 'website'` for browser/MiniApp web-origin events if product decides to classify MiniApp as web.
- [ ] Support `test_event_code` from integration config.
- [ ] Never log tokens, raw phone, raw email, or raw initData.
- [ ] Add tests:

```ts
it('sends hashed ph and external_id with stable event_id', async () => {});
it('skips duplicate event_id through IntegrationEventLog idempotencyKey', async () => {});
it('logs Graph error without token or raw PII', async () => {});
```

## Task 9: Inventory Direction And Vehicle State Split

**Files:**
- Modify `apps/server/prisma/schema.prisma`
- Add migration for `CarListing.availabilityState` and `publicationStatus`
- Modify ingestion services and showcase service
- Modify `apps/server/src/services/vehiclePresentation.ts`
- Modify DTO and renderer tests

**Prisma migration proposal:**

```prisma
enum VehicleAvailabilityState {
  IN_STOCK
  IN_TRANSIT
  IMPORT_TO_ORDER
  RESERVED
  SOLD
  UNKNOWN
}

enum VehiclePublicationStatus {
  DRAFT
  REVIEW
  PUBLISHED
  HIDDEN
}

model CarListing {
  availabilityState VehicleAvailabilityState @default(IN_STOCK)
  publicationStatus VehiclePublicationStatus @default(PUBLISHED)
}
```

- [ ] Backfill `availabilityState` from current `status`, hashtags/text (`#вдорозі`, `в дорозі`, `in_transit`, `прямує`), and channel/source rules.
- [ ] Backfill `publicationStatus` from current `status=HIDDEN/PENDING` and ingestion `autoPublish`.
- [ ] Keep legacy `status` during transition.
- [ ] Update stock/transit MiniApp tabs to query `availabilityState`, with current text fallback only for old rows.
- [ ] Normalize the two CarTie directions explicitly:
  - `IN_STOCK`: showroom/local stock.
  - `IN_TRANSIT` or `IMPORT_TO_ORDER`: import/import-to-order direction.
- [ ] Add tests proving `autoPublish=false` does not mean transit.

## Task 10: Vehicle Taxonomy And AutoRIA-Style Searchable Forms

**Files:**
- Create `apps/server/src/services/vehicleTaxonomy.service.ts`
- Create route `GET /api/miniapp/vehicle-taxonomy`
- Create `apps/web/src/pages/public/miniapp/components/SearchableSelect.tsx`
- Create `apps/web/src/pages/public/miniapp/components/MultiSelectCombobox.tsx`
- Modify `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
- Modify Lead/B2B sell/add-car views after locating current components.

- [ ] Backend taxonomy sources, in priority order:
  - curated local `carDb`
  - observed `CarListing` brand/model values from inventory
  - normalization aliases from parser/specs
  - "Other" free-text fallback
- [ ] API response:

```ts
type VehicleTaxonomyResponse = {
  brands: Array<{
    id: string;
    label: string;
    aliases: string[];
    models: Array<{ id: string; label: string; aliases: string[] }>;
  }>;
  bodyTypes: Array<{ id: string; label: string }>;
  fuels: Array<{ id: string; label: string }>;
  transmissions: Array<{ id: string; label: string }>;
  drives: Array<{ id: string; label: string }>;
  cities: Array<{ id: string; label: string }>;
};
```

- [ ] UI uses editable combobox behavior: input filters suggestions, `aria-expanded`, `aria-activedescendant`, keyboard selection, and selected chips.
- [ ] Support multiselect for preferred brands/models/body types in pick forms.
- [ ] Support single brand/model in sell/add-car forms with "Other" free text.
- [ ] Persist criteria as normalized ids plus labels:

```ts
criteria: {
  brands: [{ id: 'bmw', label: 'BMW' }],
  models: [{ brandId: 'bmw', id: 'x5', label: 'X5' }],
  yearFrom: 2020,
  yearTo: 2026,
  budgetFrom: 30000,
  budgetTo: 90000
}
```

## Task 11: MiniApp Sell/Add-Car Flow

**Decision:** do not put phone into MiniApp. For Lead users, use known contact or native contact request. For B2B partners, use verified partner identity.

- [ ] Lead customer sell intent can be a MiniApp draft if photos upload is stable; otherwise `/bot-flows SELL` remains the fallback.
- [ ] B2B add-car flow should create a `CarListing` draft or `RequestVariant` draft depending on current product contract, not a Lead pick request.
- [ ] Fields: brand, model, year, mileage, price, city, body type, fuel, transmission, drive, condition, damage, photos, comment.
- [ ] Photos:
  - Browser file input in MiniApp for draft upload when auth/initData is valid.
  - Bot-native photo continuation when upload fails or Telegram client is old.
- [ ] Add tests for Lead sell not creating BUY request and B2B add-car not creating Lead.

## Task 12: Admin Chats And B2B Safety

**Files:**
- Modify B2B callback handlers.
- Reuse `telegramAdminAccess.ts`.
- Add tests around B2B approve/reject/FIT actions.

- [ ] Require configured admin group/supergroup and Telegram admin membership for high-risk callbacks.
- [ ] Lock `/setup_admin` behind an owner/admin check or disable it for production bots.
- [ ] Add queue config validation: bot member, can send messages, chat type expected.
- [ ] Ensure B2B partner queue messages do not leak buyer contact unless explicit status says contact can be shared.

---

## Verification Gates

### Phase 1 Gate

```bash
npm --prefix apps/server test -- miniappUrl.test.ts clientLeadMiniAppMenu.test.ts telegramReplyMarkup.test.ts miniAppLeadHandoff.routes.test.ts requestContract.service.test.ts leadService.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppAuth.service.test.ts
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
git diff --check -- . ':!.agent'
```

Production smoke after deploy:

```bash
curl -fsS https://cartie2.umanoff-analytics.space/api/health
curl -fsS 'https://cartie2.umanoff-analytics.space/api/miniapp/config?slug=cartie'
curl -fsS 'https://cartie2.umanoff-analytics.space/api/miniapp/showcases/cartie/inventory?status=AVAILABLE'
curl -fsS 'https://cartie2.umanoff-analytics.space/api/miniapp/showcases/cartie/inventory?status=PENDING'
LOG_FILE=/srv/cartie/_logs/telegram_live_verify.log bash infra/verify_telegram_live.sh
```

Manual Telegram checks:

- Standard menu button opens Lead MiniApp with initData.
- Runtime Lead buttons open Lead MiniApp with initData in private chat.
- Any old platform-configured buttons are repaired or route to private bot, not external browser.
- First Lead request asks contact once.
- Later Lead requests from the same Telegram user do not ask contact again.
- Duplicate double tap does not create another request.
- B2B bot keeps B2B labels and does not show Lead pick/sell copy.

### Phase 2 Gate

```bash
npm --prefix apps/server test -- metaCapi.service.test.ts dto.inventory-normalization.test.ts showcase.service.miniapp.test.ts b2bRegistration.service.test.ts b2bRegistration.approve.test.ts b2bRouting.service.test.ts telegramAdminAccess.test.ts
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Data dry-runs before any production migration:

```bash
npm --prefix apps/server prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel apps/server/prisma/schema.prisma --script
npm --prefix apps/server tsx scripts/audit_vehicle_states.ts --dry-run
npm --prefix apps/server tsx scripts/audit_lead_identities.ts --dry-run
```

---

## Execution Order

1. Task 1, 2, 3, 4, 5 as one production recovery branch.
2. Deploy and manually verify Telegram launch/contact/retry behavior.
3. Task 6 if operator request UX still blocks daily work.
4. Task 7 and 9 only with explicit migration window.
5. Task 8 after Meta credentials and event naming are confirmed by the business.
6. Task 10 and 11 as UX/data improvement after reliability is stable.
7. Task 12 before scaling B2B admin group usage.
