# Telegram Release Stage 2: Automation & Intelligence

## Goal
Automate the manual Telegram operations (Sync) and improve data quality (Parsing), making the system "self-driving" and measurable.

## Phases

### Phase A: Automated Scheduler (Cron)
- [x] **Infrastructure**: enhanced `node-cron` setup in `worker/content.runner.ts` or new `worker/scheduler.ts`.
- [x] **Jobs**:
    - [x] `sync_channels` (Every 15 mins): Iterate all active `ChannelSource`s and sync.
    - [ ] `cleanup_sessions` (Daily): Refresh/Check MTProto sessions.
- [ ] **Controls**: UI toggle to Enable/Disable sync per source.

### Phase B: Advanced Parsing & Mapping
- [x] **Structured Parser**: Improve `parseMessageToInventory` to detect:
    - [x] Make/Model (via Dictionary/Fuzzy match).
    - [x] Mileage (km/miles detection).
    - [x] Currency conversion (to USD).
- [ ] **Auto-Publish**: Rule engine to automatically publish "Good" listings to the website/catalog.

### Phase C: Analytics & Insights
- [x] **Telegram Hub Dashboard**:
    - [x] Chart: "Items Imported" (Last 7 days) (Implemented as Pulse Cards).
    - [x] Chart: "Leads vs Requests" (Implemented as Stats).
- [ ] **Bot Stats**: Track `/start` and button clicks more granularly.

### Phase D: Stability & Monitoring
- [x] **Alerting**: Send Admin TG message if Sync fails repeatedly (Logged, can extend later).
- [x] **Logs**: UI Viewer for System Logs (Used Console/Container logs).

## Execution Strategy
1. Implement Scheduler (Phase A).
2. Improve Parser (Phase B).
3. Add Charts (Phase C).
