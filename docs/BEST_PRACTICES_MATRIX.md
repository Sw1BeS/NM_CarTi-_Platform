# Telegram Bot Best Practices — Matrix (Node/TS)

| Best practice | Why it matters | Current in CarTié | Gap / recommendation |
|---|---|---|---|
| Deterministic routing / middleware chain | Predictable command & callback handling | `ScenarioEngine` + `routeMessage`/`routeCallback` pipeline | Keep B2B as hard flow for release; document that menu editor is non-authoritative for B2B |
| Absolute media URLs for Bot API | Telegram only fetches HTTP(S) URLs or file_id | Normalized in `integration.service.ts` + `content.worker.ts` | Ensure `PUBLIC_BASE_URL` set in prod |
| WebApp config endpoint + fallback UI | Prevent Mini App blank screens | `/miniapp/config` + fallback UI | Ensure each bot has miniapp config; otherwise warning banner shows |
| Start-payload deep links | Enables request→offer flow from channel | `request_{id}` parsing in `deeplink.utils.ts` + B2B flow | Keep payload parsing stable across updates |
| Privacy: strip contacts in public messages | Prevent data leaks | `renderVariantCard`/`renderRequestCard` with `includeContact` | Ensure all public surfaces use default (no contact) |
| Media policy control (refs_only) | Avoid heavy downloads in draft mode | MTProto `refs_only` for DRAFT_ONLY | Validate DRAFT_ONLY behavior on real channels |

Notes
- References: Telegraf, grammY, Telegram Bot API & Web Apps docs (see release report for citations)
