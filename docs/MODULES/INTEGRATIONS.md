# Integrations Module

> Purpose: External service integrations
> Submodules: meta, mtproto, sendpulse, viber, whatsapp, autoria

## Module Structure
```
apps/server/src/modules/Integrations/
├── integration.routes.ts
├── integration.service.ts
├── autoria.service.ts
├── meta.service.ts
├── meta/
│   └── meta.service.ts
├── mtproto/
│   ├── mtproto.routes.ts
│   ├── mtproto.service.ts
│   ├── mtproto.utils.ts
│   └── mtproto.worker.ts
├── sendpulse/
│   └── sendpulse.service.ts
├── viber/
│   └── viber.service.ts
└── whatsapp/
    └── whatsapp.service.ts
```

## Key Endpoints
- GET /api/integrations
- POST /api/integrations
- POST /api/webhooks/whatsapp
- POST /api/webhooks/viber
- GET /api/mtproto/* (see mtproto.routes.ts)

## Integration Points
- Meta, SendPulse, WhatsApp, Viber, MTProto
- MTProto worker started from `apps/server/src/index.ts`
- Some integration helpers are imported in `apps/server/src/routes/apiRoutes.ts`

## Verification Checklist
- Integrations list returns
- Webhooks accept POSTs
- MTProto worker reports status

Last updated: 2026-01-22
