# ADR: AttributionSession Owns Direct-To-Telegram Attribution

Date: 2026-05-27
Status: accepted for implementation branch

## Decision

Use `AttributionSession` as the canonical owner for first-party click attribution in direct Meta ad to Telegram bot flows.

Canonical flow:

```text
Meta Ad -> /r/bot -> AttributionSession -> Telegram /start token -> Lead/Request payload snapshot -> SalesDrive -> Meta CRM CAPI
```

## Context

Telegram bot deep links carry only a compact `start` payload. They do not preserve browser cookies, `fbclid`, IP, UA, or full UTM context. Without a first-party bridge, direct-to-bot campaigns lose the identifiers that materially improve Meta CAPI matching.

## Consequences

- New additive table: `AttributionSession`.
- New disabled-by-default public redirect route: `GET /r/bot`.
- Existing Telegram aliases remain reserved and win over attribution lookup.
- Lead/request payloads keep sanitized attribution snapshots for downstream SalesDrive and Meta CRM stage events.
- `MetaCapiService` remains a sender only; it does not own attribution capture.

## Alternatives Considered

- Payload-only patch in Telegram `/start`: rejected because Telegram does not provide browser identifiers.
- External sGTM/CAPI Gateway first: deferred because Cartie still needs a durable join key into Telegram/CRM.
- Fake Meta `lead_id`: rejected. Telegram direct-to-bot does not provide Meta Lead Ads `lead_id`.

## Rollback

- Set `ATTRIBUTION_REDIRECT_ENABLED=false`.
- Stop using `/r/bot` URLs in ads.
- Set `META_B2C_BOT_CAPI_ENABLED=false` to stop B2C CRM sends.
- Leave additive migration in place.
