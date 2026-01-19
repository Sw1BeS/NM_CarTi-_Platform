# Telegram Module (Module 1)

## Architecture (Pipeline)

```
Telegram Update
   |
   v
/api/telegram/webhook/:botId  OR  polling (BotManager)
   |
   v
Telegram Pipeline
  ├─ resolveBotTenant (bot/company)
  ├─ dedup (TelegramUpdate)
  ├─ enrichContext (session/locale/flags + BotMessage INCOMING)
  ├─ normalize (phone)
  ├─ route
  │   ├─ message -> ScenarioEngine -> Template Flows
  │   ├─ callback -> ScenarioEngine -> Callback Actions
  │   ├─ web_app_data -> MiniApp V1 / legacy
  │   └─ inline_query (stub)
  └─ emitEvent (PlatformEvent)

Template/Scenario Logic -> Telegram Outbox -> Telegram API
                                     |
                                     v
                            BotMessage OUTGOING + PlatformEvent
```

## Environment Variables

- `PUBLIC_BASE_URL` (required for webhook): public server URL used to build webhook URL.
- `MINIAPP_URL` (optional): base MiniApp URL when bot config does not override.
- `LEAD_DEDUP_DAYS` (optional): lead dedup window, default 14.

## Bot Config Keys (BotConfig.config)

- `deliveryMode`: `polling` (default) or `webhook`.
- `webhookSecret`: secret token validated from `X-Telegram-Bot-Api-Secret-Token`.
- `webhookUrl`: stored when webhook is set.
- `publicBaseUrl`: override for webhook URL building.
- `miniAppConfig.url`: MiniApp base URL.
- `b2bManagerChatId`: optional group/chat for B2B request notifications.

## Webhook Setup (Cloudflare compatible)

1. Ensure `PUBLIC_BASE_URL` (or bot `config.publicBaseUrl`) points to a public HTTPS origin.
2. Call admin endpoint:

```
POST /api/bots/:id/webhook
Authorization: Bearer <token>
{
  "publicBaseUrl": "https://your-domain.com"
}
```

3. Telegram will send `X-Telegram-Bot-Api-Secret-Token`; the server validates it against `bot.config.webhookSecret`.
4. Cloudflare notes:
   - Do not strip the `X-Telegram-Bot-Api-Secret-Token` header.
   - Keep request timeouts low; webhook handler responds immediately and processes async.

To disable webhook and return to polling:

```
DELETE /api/bots/:id/webhook
```

## MiniApp Payload Contract (V1)

```
{
  "v": 1,
  "type": "lead_submit" | "interest_click" | "sell_submit",
  "carId": "optional",
  "fields": { "name": "...", "phone": "...", "brand": "..." },
  "meta": { "source": "miniapp", "utm": "...", "lang": "..." }
}
```

Unsupported versions/types are rejected and logged; users receive a friendly error message.

## Adding New Scenario Templates

1. Create a Scenario via `POST /api/scenarios` with:
   - `status: "PUBLISHED"` (or `DRAFT` for non-live).
   - `triggerCommand` unique per company (enforced).
2. Localize content with `text_uk` and `text_ru` for every user-facing node.
3. Use `menuConfig.buttons` to wire scenario entries without collisions.

## Extending Normalization Dictionary

- Add a row to `NormalizationAlias`:
  - `type`: `brand` | `model` | `city`
  - `alias`: raw input (stored lowercase recommended)
  - `canonical`: normalized output
  - `companyId`: `NULL` for global; set companyId for tenant-specific overrides.

In-code fallbacks live in:
- `src/modules/normalization/normalizeBrand.ts`
- `src/modules/normalization/normalizeModel.ts`
- `src/modules/normalization/normalizeCity.ts`
