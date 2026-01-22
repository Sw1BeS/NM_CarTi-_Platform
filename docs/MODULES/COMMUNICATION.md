# Communication Module

> Purpose: Bot management and Telegram workflows
> Submodules: bots, telegram

## Overview
- Bot configuration and lifecycle
- Telegram webhook ingestion and routing
- Scenario pipeline and outbox delivery

## Module Structure
```
apps/server/src/modules/Communication/
├── bots/
│   ├── bot.routes.ts
│   ├── bot.service.ts
│   ├── botDto.ts
│   └── scenario.engine.ts
└── telegram/
    ├── core/
    │   ├── telegram.routes.ts
    │   ├── telegramAdmin.service.ts
    │   ├── telegramAuth.ts
    │   ├── leadService.ts
    │   └── utils/*
    ├── messaging/
    │   ├── telegramSender.ts
    │   └── outbox/telegramOutbox.ts
    ├── routing/
    │   ├── routeMessage.ts
    │   ├── routeInline.ts
    │   ├── routeCallback.ts
    │   └── routeWebApp.ts
    └── scenarios/
        ├── pipeline.ts
        └── middlewares/*
```

## Key Endpoints
- GET /api/bots
- POST /api/bots
- GET /api/scenarios
- POST /api/scenarios
- POST /api/telegram/webhook/:botId

## Integration Points
- Telegram Bot API via `telegram` package
- Bot lifecycle orchestration in `bot.service.ts`
- Prisma access via repositories and direct usage

## Verification Checklist
- Bot list loads
- Scenario list loads
- Telegram webhook accepts valid botId
- Outbox delivers messages

Last updated: 2026-01-22
