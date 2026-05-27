# Meta Tracking Knowledge

Generated: 2026-05-27
Root: `/srv/cartie`
Status: research and design input only. No outbound Meta or SalesDrive calls were made.

This note is the operator-facing knowledge base for Meta tracking, Meta CAPI, CRM Conversion Leads, Telegram attribution, and the current Cartie implementation surface.

## Truth Hierarchy

Use this order when resolving conflicts:

1. Current live workspace under `/srv/cartie`.
2. Official platform docs and schemas.
3. Generated Cartie code maps in `docs/code-map/`.
4. Historical audits and third-party articles as context only.

The current local source of truth for Meta/SalesDrive/Telegram work starts with:

- `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts`
- `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `apps/server/src/services/requestContract.service.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/pages/public/MiniApp.tsx`
- `apps/web/src/pages/public/miniapp/trackingEvents.ts`
- `apps/server/prisma/schema.prisma`

## Meta CAPI Primitives

Meta Conversions API sends server events to a dataset/pixel endpoint:

```text
POST https://graph.facebook.com/<version>/<dataset_or_pixel_id>/events
```

Cartie already uses `v25.0` for the B2C bot dataset path and `v19.0` for older generic paths. New work should keep B2C CRM sends on the v25 dataset endpoint unless a later Meta migration requires otherwise.

Core request shape:

```json
{
  "data": [
    {
      "event_name": "Lead",
      "event_time": 1714000000,
      "event_id": "stable-business-event-id",
      "action_source": "website",
      "event_source_url": "https://example.com/thank-you",
      "user_data": {},
      "custom_data": {}
    }
  ],
  "test_event_code": "TEST123"
}
```

Implementation rules:

- `data` is top-level and contains one or more events.
- `test_event_code` is top-level, next to `data`, and must be removed or gated off before production sends.
- `event_time` must be the time the business event actually happened, not always the time the queue/sender processed it.
- `event_id` is the dedupe key. For Pixel plus CAPI pairs, browser `eventID` and server `event_id` must match.
- `event_name` participates in dedupe with `event_id`; do not reuse the same event ID across different event names.
- If a delayed event is too old, Meta can reject the batch. The official archived Swagger says CAPI events can be up to 7 days old.
- Prefer `Authorization: Bearer <token>` over putting tokens in query strings. Cartie B2C already does this; legacy generic senders still use query tokens.

## Customer Matching Data

Hash before sending:

- `em` email
- `ph` phone
- `fn`, `ln`
- `ct`, `st`, `zp`, `country`
- `external_id` is treated as hash-worthy in Cartie for consistency, even though Meta historically allowed unhashed external IDs.

Do not hash:

- `fbp`
- `fbc`
- `client_ip_address`
- `client_user_agent`
- `lead_id`
- `fbclid`
- messaging click identifiers such as `ctwa_clid`, when used in supported flows

Cartie should continue logging only summaries for Meta payloads. `IntegrationEventLog.meta` is visible through admin logs, so raw phone, email, token, and unhasanitized request payloads do not belong there.

## CRM Conversion Leads vs Generic Website CAPI

These are different use cases:

| Use case | Correct model | Cartie implication |
| --- | --- | --- |
| Website/MiniApp page event | CAPI web/server event with `action_source=website` and `event_source_url` when known | Good for MiniApp open/view/lead form telemetry. Needs browser identifiers and dedupe if Pixel also fires. |
| Telegram bot CRM stage | CRM/Conversion Leads style event with `action_source=system_generated`, `custom_data.event_source=crm`, `custom_data.lead_event_source=<CRM/source>` | Good for SalesDrive status feedback and B2C bot lifecycle. Do not call this "website". |
| Native Meta Lead Ads Instant Form | CRM event with real Meta `lead_id` | Only use `lead_id` if it came from Meta Lead Ads. Telegram direct-to-bot does not provide one. |
| Offline/physical store purchase | CAPI event with appropriate action source and business fields | Out of current Cartie scope unless SalesDrive statuses are formally mapped to purchases. |

Current Cartie B2C sender already follows the CRM shape:

- integration: `META_B2C_BOT`
- mode: `CRM_CONVERSION_LEADS`
- endpoint: `https://graph.facebook.com/v25.0/<META_B2C_BOT_DATASET_ID>/events`
- action source: `system_generated`
- custom data: `event_source=crm`, `lead_event_source=CarTié SalesDrive`

Known gaps:

- B2C CRM `event_time` is currently `Date.now()` in the sender, even when SalesDrive provides a status timestamp.
- SalesDrive webhook currently sends only `Contacted` for status `13`; `QualifiedLead`, `Scheduled`, and `Won/Purchase` are intentionally not enabled.
- Duplicate successful sends return early from `MetaCapiService`, but the duplicate skip should be logged as a first-class decision.
- Retry after an `ERROR` can collide with the unique `idempotencyKey` if a later attempt tries to create another log row with the same key.
- Legacy generic Meta senders still exist and are not canonical for B2C CRM.

## Telegram Attribution Constraints

Telegram direct bot deep links only carry a compact `start` parameter. Official Telegram docs specify:

- bot links use `https://t.me/<bot_username>?start=<parameter>`;
- the parameter can be up to 64 base64url characters;
- the bot receives it as `/start <parameter>`.

Mini Apps support `startapp`; a non-empty value is passed to the Mini App as `start_param` and `tgWebAppStartParam`.

Hard implication: a direct Meta ad click to `t.me/<bot>?start=...` cannot safely carry full `fbclid`, `fbc`, `fbp`, UTM set, IP, and user agent into the bot. A tracking redirect bridge is required if the campaign goes directly from Meta ad to Telegram bot and still expects strong event matching.

## Current Cartie Data Availability

| Field | Current availability | Source | Reliability | Gap |
| --- | --- | --- | --- | --- |
| Phone | Available after Telegram contact/manual phone | `Lead.phone`, request payload, SalesDrive webhook | High after contact | Not available at first `/start`. |
| Email | Rare | payloads/webhook support it | Low | Add an explicit capture path only if required by EMQ. |
| Telegram user/chat ID | Available | `BotSession`, `Lead`, request payload | High internally | Use only as hashed `external_id`. |
| SalesDrive order ID | Available after sync | `LeadIdentity`, request/request payload | High after sync | Needs stable join back into Meta CRM events. |
| `fbclid` | MiniApp URL yes, direct bot no | MiniApp URL query | Medium | Redirect bridge needed for direct-to-bot. |
| `fbc` | MiniApp can derive from `fbclid`; direct bot no | `trackingEvents.ts` | Medium | Bridge should persist first hit. |
| `fbp` | MiniApp generates/preserves cookie; direct bot no | `trackingEvents.ts` | Medium | Bridge should persist first hit. |
| IP/UA | MiniApp event HTTP request yes; Telegram bot no | Express request | Medium | Bridge captures browser click before Telegram handoff. |
| UTM set | MiniApp/request partial | `MiniApp.tsx`, request payload | Medium | Bridge should store full UTM set. |
| ad/campaign/adset IDs | Not canonical | none | None | Capture query params if Meta URLs include them. |
| Stage timestamp | Available from SalesDrive webhook | `statusTimestamp` | Medium | Sender must accept explicit event time. |

## Tracking Formats And Best Use

| Format | Strength | Weakness | Cartie fit |
| --- | --- | --- | --- |
| Browser Pixel | Fast, standard, browser-side dedupe source | Blockers, ITP, missing CRM truth | Useful for web/MiniApp views, not proof of CRM quality. |
| Direct backend CAPI | Full control and backend identifiers | Requires correct hashing, consent, retries, logging | Best for Cartie CRM and request lifecycle. |
| Server-side GTM | Central tag routing and transformations | Another runtime and ownership layer | Useful later if marketing owns many tags; overkill for current B2C bot bridge. |
| CAPI Gateway / Signals Gateway | Lower-code setup for website signals | Less control over Telegram/SalesDrive CRM joins | Not sufficient for direct-to-bot CRM stage feedback. |
| CRM Conversion Leads | Teaches Meta actual funnel quality | Needs clean stage taxonomy and identifiers | Correct model for SalesDrive statuses. |
| Telegram direct bot link | Frictionless UX | Loses browser identifiers | Needs `/r/bot` bridge. |
| Telegram MiniApp | Can capture URL, cookies, and HTTP event data | Requires initData and Telegram WebView behavior | Already partially implemented. |

## Recommended Cartie Architecture

Use a first-party redirect attribution bridge:

```text
Meta Ad
  -> /r/bot?campaign_token=...&utm_source=...&fbclid=...
  -> AttributionSession(shortToken, fbc/fbp/IP/UA/UTM/ad ids, TTL)
  -> 302 https://t.me/<bot_username>?start=<shortToken>
  -> Telegram /start stores shortToken in BotSession.variables
  -> phone/request submit joins AttributionSession to Lead/B2bRequest payload
  -> SalesDrive request sync carries attribution context
  -> SalesDrive webhook sends CRM CAPI enriched with real matching keys
```

Canonical owner should be a new attribution module, not more logic inside `routeMessage.ts` or `metaCapi.service.ts`.

Suggested owner files for later implementation:

- `apps/server/src/modules/Attribution/attributionSession.service.ts`
- `apps/server/src/modules/Attribution/trackingRedirect.routes.ts`
- Prisma model `AttributionSession`

Compatibility carriers:

- `BotSession.variables.attributionToken`
- `Lead.payload.attribution`
- `B2bRequest.payload.attribution`
- SalesDrive request comments/fields only as a bridge for external CRM context, not as canonical storage.

## Event Taxonomy For Cartie

Keep two lanes separate:

1. Generic web/MiniApp telemetry lane (`META_PIXEL`)
   - `MiniAppOpen`
   - `ViewContent` or mapped view events
   - `Lead`
   - `SubmitApplication`
   - `Contact`
   - This lane may use `action_source=website` or `chat` depending on the actual event origin.

2. B2C CRM Conversion Leads lane (`META_B2C_BOT`)
   - `Lead`
   - `Contacted`
   - `QualifiedLead`
   - `Scheduled`
   - `Won` or `Purchase` only after a value/currency rule is approved.
   - This lane should use `action_source=system_generated` and `custom_data.event_source=crm`.

Do not treat `miniapp.tracking_bound` as a Meta send. It is an internal debug binding.

## Privacy And Consent

Non-negotiables:

- No raw access token in URL, logs, screenshots, or admin payloads.
- No raw email/phone in `IntegrationEventLog.meta`.
- No fake `lead_id`.
- No production `test_event_code`.
- No sending of restricted/sensitive categories without legal review.
- Consent behavior must be consistent between browser Pixel/MiniApp events and server CAPI events.
- If Limited Data Use or opt-out handling is required, the event schema must carry `data_processing_options` consistently.

## QA Gates

Gate order for future implementation:

1. Raw Meta test event with fresh `META_B2C_BOT_TEST_EVENT_CODE`, sanitized output only.
2. Same payload through Cartie B2C sender, with DB log ID and `fbtrace_id`.
3. Duplicate same `event_id`; expect no outbound call and a logged duplicate skip.
4. App-generated `Contacted` from a controlled SalesDrive webhook fixture.
5. Redirect bridge local smoke: `/r/bot` creates attribution session and redirects to expected Telegram URL.
6. Bot `/start <token>` stores token without breaking existing aliases (`sell`, `stock`, `transit`, etc.).
7. Lead/request creation joins attribution and keeps raw PII out of logs.
8. SalesDrive sync/webhook carries stage context and sends only approved B2C CRM events.

No production Meta/SalesDrive write should be part of QA without explicit approval.

## Open Decisions

- Fresh Meta Test Events code.
- Approved bot username and redirect allowlist.
- SalesDrive status IDs for `Contacted`, `QualifiedLead`, `Scheduled`, `Won/Purchase`.
- Value/currency rule for revenue events.
- Email capture and consent strategy.
- Attribution session TTL and retention window.
- Whether to add CAPI Limited Data Use fields now or defer until consent requirements are formalized.

## Sources

- Meta Conversions API archived Swagger: https://raw.githubusercontent.com/facebookincubator/Facebook-Server-Side-API-Swagger/main/server-side-api.yaml
- Meta Conversions API docs entrypoint: https://developers.facebook.com/docs/marketing-api/conversions-api
- Meta CAPI customer info docs: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/
- Meta fbc/fbp docs: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/
- Meta CRM integration docs: https://developers.facebook.com/docs/marketing-api/conversions-api/guides/crm-integration/
- Meta Business Help, About Conversions API: https://www.facebook.com/business/help/AboutConversionsAPI
- Telegram deep links: https://core.telegram.org/api/links
- Telegram bot deep linking: https://core.telegram.org/bots/features#deep-linking
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- Google server-side tagging intro: https://developers.google.com/tag-platform/tag-manager/server-side/intro
- Google server-side tagging APIs: https://developers.google.com/tag-platform/tag-manager/server-side/api
