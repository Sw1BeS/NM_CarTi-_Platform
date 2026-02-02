# Master Plan: Stage 2 - Telegram Productization & Scale

## Goal
Transform the Telegram integration from a technical prototype (Stage 1) to a robust, sellable product module (Stage 2). Focus on operations, UX, and reliability.

## 📌 Milestones (Strict Sequential Execution)

### M1: Sources & Destinations Registry
- **Goal:** Unified management of all Telegram entities.
- **Backend:** `TelegramDestination` model. Status/Sync logic.
- **Frontend:** "Telegram > Sources" dashboard.
- **Validation:** User can pause/resume/sync a channel from UI.

### M2: Import by Date Range (MTProto)
- **Goal:** Product-grade import tool with precision.
- **Backend:** Date-based iteration, `preview` endpoint (dry-run).
- **Frontend:** Date picker + Mode select (Inventory vs Draft) + Preview list.
- **Validation:** Import of last 7 days works flawlessly without duplicates.

### M3: Ingestion Unification
- **Goal:** Eliminate "Dual Pipeline" completely.
- **Backend:** `ChannelIngestionService`. One logic for BotAPI `channel_post` and MTProto.
- **Data:** Strict unique constraint `[sourceChatId, sourceMessageId]`.
- **Validation:** Simultaneous posts via Bot and MTProto result in exactly 1 record.

### M4: Media MVP
- **Goal:** Visuals in the system.
- **Strategy:** Local storage / Proxy for MVP.
- **Backend:** Download media on ingestion (if `INVENTORY` mode). `MediaItem` in DB.
- **Frontend:** Carousel in Inventory & Mini App.
- **Validation:** 10 imported cars show photos.

### M5: Mini App Portal
- **Goal:** From "Viewer" to "Portal".
- **Features:** Favorites, Create Request, Status Check.
- **Tracking:** UTM/StartParam preservation in Leads.
- **Validation:** Lead created from Mini App contains source tracking data.

### M6: Content & Calendar
- **Goal:** Professional publishing tool.
- **Backend:** `Template` substitution ({brand}, {price}). `PublicationJob` scheduler.
- **Frontend:** Calendar view, Drag&Drop (optional), Status blocks.
- **Validation:** Scheduled post appears in channel at right time.

### M7: Observability
- **Goal:** Transparent operations.
- **Backend:** `IntegrationEventLog` for all sync/webhook events.
- **Frontend:** Logs viewer with filtering.
- **Validation:** Debugging a failed sync via UI logs only.

## 📂 Deliverables Structure
All technical details will be documented in `docs/stage2/`:
- `10_SOURCES_DESTINATIONS.md`
- `20_IMPORT_BY_DATE.md`
- `30_MEDIA_MVP.md`
- `40_MINIAPP_PORTAL.md`
- `50_CONTENT_CALENDAR.md`
- `60_LOGS_OBSERVABILITY.md`

## 🛡 Verification & Standards
- **Git:** `feat/stage2-tg-productize`
- **Testing:** `npm test` + UI Smoke Checks per milestone.
- **Security:** Basic secrets protection, no PII logging.
