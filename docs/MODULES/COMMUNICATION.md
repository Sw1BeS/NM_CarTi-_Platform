# Communication Module

> **Purpose**: Bot management and Telegram integration  
> **Submodules**: `bots`, `telegram`

---

## Overview

Handles all bot-related functionality including:
- Multi-bot configuration and lifecycle management
- Telegram Bot API integration
- Message routing (callbacks, inline queries, regular messages, webapps)
- Scenario-based conversation flows
- Outbox for reliable message delivery

---

## Module Structure

```
modules/Communication/
├── bots/
│   ├── bot.service.ts      # BotManager - multi-bot orchestration
│   ├── bot.routes.ts       # Bot CRUD API
│   └── bot.types.ts
└── telegram/
    ├── core/
    │   ├── telegram.routes.ts
    │   └── telegram.service.ts
    ├── routers/
    │   ├── callback.router.ts   # Inline button handlers
    │   ├── inline.router.ts     # Inline query handlers
    │   ├── message.router.ts    # Text message handlers
    │   └── webapp.router.ts     # Mini App handlers
    ├── scenario/
    │   └── scenario.engine.ts   # State machine for conversations
    └── outbox/
        └── outbox.service.ts    # Reliable message delivery
```

---

## Key Entities

- `BotConfig` - Bot configuration (token, settings)
- `Scenario` - Conversation flow definition
- `TelegramMessage` - Message log
- `TelegramOutboxEntry` - Queued outgoing messages

---

## Critical Endpoints

- `GET /api/bots` - List bot configs
- `POST /api/bots` - Create bot
- `POST /api/bots/:id/start` - Start bot
- `POST /api/bots/:id/stop` - Stop bot
- `GET /api/scenarios` - List scenarios
- `POST /api/messages/send` - Send message via bot

---

## Integration Points

- **Prisma**: Direct calls for bot configs, messages, scenarios (⚠️ to be refactored in Phase 3)
- **Telegram SDK**: `telegram` npm package for Bot API
- **Bot Manager**: `botManager.startAll()` in server bootstrap

---

## Verification Checklist

✅ Bot can start/stop successfully  
✅ Messages send and receive correctly  
✅ Scenarios transition between states  
✅ Callbacks handle inline button clicks  
✅ Outbox delivers messages reliably

---

**Owner**: Communication domain  
**Last Updated**: 2026-01-22
