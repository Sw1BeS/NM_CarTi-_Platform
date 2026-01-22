# Integrations Module

> **Purpose**: External service integrations  
> **Submodules**: `meta`, `mtproto`, `sendpulse`, `viber`, `whatsapp`

---

## Overview

Third-party service integrations:
- Meta (Facebook/Instagram) CAPI events
- MTProto (Telegram user client for channel scraping)
- SendPulse (Email/SMS marketing)
- Viber webhooks
- WhatsApp webhooks

---

## Module Structure

```
modules/Integrations/
├── integration.routes.ts       # Generic integration CRUD
├── integration.service.ts
├── meta/
│   └── meta.service.ts         # Meta CAPI tracking
├── mtproto/
│   ├── mtproto.routes.ts       # Connector management
│   ├── mtproto.service.ts
│   ├── mtproto.worker.ts       # Live sync worker
│   └── mtproto.types.ts
├── sendpulse/
│   └── sendpulse.service.ts
├── viber/
│   └── viber.service.ts
└── whatsapp/
    └── whatsapp.service.ts
```

---

## Key Entities

- `Integration` - Generic integration config
- `MTProtoConnector` - Telegram user session
- `ChannelSource` - Telegram channel to scrape
- `CarListing` - Auto listing from channels

---

## Critical Endpoints

- `GET /api/integrations` - List integrations
- `POST /api/integrations` - Configure integration
- `POST /api/webhooks/whatsapp` - WhatsApp webhook (public)
- `POST /api/webhooks/viber` - Viber webhook (public)
- `GET /api/mtproto/connectors` - List MTProto sessions

---

## Integration Points

- **Prisma**: Direct calls for integration configs, MTProto data (⚠️ Phase 3 refactor)
- **External SDKs**: Meta Graph API, Telegram MTProto, SendPulse API
- **Workers**: `mtprotoWorker.startLiveSync()` for channel monitoring

---

## Verification Checklist

✅ Meta CAPI events fire correctly  
✅ MTProto can connect and scrape channels  
✅ WhatsApp/Viber webhooks receive messages  
✅ SendPulse sends emails/SMS  
✅ Integration configs save and load

---

**Owner**: Integrations domain  
**Last Updated**: 2026-01-22
