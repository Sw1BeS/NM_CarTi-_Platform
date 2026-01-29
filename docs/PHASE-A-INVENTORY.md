# Phase A: Telegram Reality Inventory & Risk Map

## 1. Component Map

### 🤖 Bots / Scenario Engine
- **Lifecycle & Polling**: [`apps/server/src/modules/Communication/bots/bot.service.ts`](file:///srv/cartie/apps/server/src/modules/Communication/bots/bot.service.ts)
    - Implements `BotManager` and `BotInstance`.
    - Uses `axios` for Bot API (Polling/Webhooks).
    - Contains **HARDCODED** template logic (`handleClientBot`, `handleDeepLink`) mixed with dynamic `runTelegramPipeline`.
- **Messaging**: [`apps/server/src/modules/Communication/telegram/messaging/outbox/telegramOutbox.ts`](file:///srv/cartie/apps/server/src/modules/Communication/telegram/messaging/outbox/telegramOutbox.ts)
    - Wrapper for sending messages (`sendMessage`, `sendPhoto`, etc.).
    - Logs all outgoing messages to `BotMessage` table.
- **Auth verification**: [`apps/server/src/modules/Communication/telegram/core/telegramAuth.ts`](file:///srv/cartie/apps/server/src/modules/Communication/telegram/core/telegramAuth.ts) (Web App initData).

### 📡 MTProto Connector (Channels)
- **Service**: [`apps/server/src/modules/Integrations/mtproto/mtproto.service.ts`](file:///srv/cartie/apps/server/src/modules/Integrations/mtproto/mtproto.service.ts)
    - Uses `gramjs` (`telegram` package).
    - Handles: `sendCode`, `signIn` (User Auth), `getClient` (Session management).
    - Features: `resolveChannel`, `getHistory`, `addEventHandler`.
    - **Missing**: Mapping logic from `raw message` -> `Inventory` item.

### 🖥️ Web UI
- **Hub**: [`apps/web/src/pages/app/TelegramHub.tsx`](file:///srv/cartie/apps/web/src/pages/app/TelegramHub.tsx)
    - Main controller, tabs for `MTPROTO`, `FLOWS`, `SETTINGS`.
- **Components**:
    - `apps/web/src/modules/Telegram/MTProtoSources` (inferred).
    - `AddBotModal`, `BotSettings` in `TelegramHub.components.tsx`.

## 2. Configuration & Env Vars

### Environment Variables (.env)
- **Status**: ⚠️ `TG_API_ID` and `TG_API_HASH` are MISSING in root `.env`.
- **Required**:
    ```env
    TG_API_ID=...      # Required for MTProto
    TG_API_HASH=...    # Required for MTProto
    ```

### Database Configs
- **Bots**: Table `BotConfig` (token, template, settings).
- **MTProto**: Table `mTProtoConnector` (sessionString, phone, status).
- **Sessions**: Table `BotSession` (state, variables).

## 3. Risk Map (Top 3)

| Risk | Description | Mitigation Strategy |
|------|-------------|---------------------|
| **1. Missing Credentials** | `TG_API_ID/HASH` missing. MTProto will fail immediately. | Add to `.env` (ask user or provide placeholders). |
| **2. Dual Brain Logic** | `bot.service.ts` has hardcoded flows (`handleClientBot`) AND calls `pipeline`. | **Phase B Fix**: Decide on ONE source of truth. Likely prioritize hardcoded for stability if pipeline is shaky, or clean split. |
| **3. No Inventory Mapping** | `mtproto.service.ts` fetches raw messages but doesn't parse them into Cars. | **Phase C Priority**: Implement strict parsing logic (Start Phase C). |

## 4. Next Steps (Phase B)
- Define the canonical flow.
- Choose between Hardcoded Flow vs Pipeline (Recommendation: Stick to hardcoded for Stage 1 speed/stability if pipeline is complex).
