# AUDIT PHASE 3: INTEGRATION HEALTH

**Date**: 2026-05-22
**Status**: Completed

## 1. EXTERNAL APIS

### 1.1 Meta CAPI (`meta.service.ts`)
**Status**: ⚠️ Partial Implementation

-   **Reliability**:
    -   Uses direct `axios.post` calls without retry logic. Network failures result in lost events.
    -   **Fix**: Implement a durable queue (e.g., BullMQ) for event delivery with retries.
-   **Performance**:
    -   Reads `SystemSettings` from DB *synchronously* on every event trigger.
    -   **Fix**: Cache settings in memory (LRU) or Redis to reduce DB load.
-   **Security**:
    -   Correctly hashes PII (`ph`, `fn`) using SHA256 before sending.
-   **Maintainability**:
    -   Hardcoded API version `v19.0`.
    -   Tightly coupled to `SystemSettings` singleton.

### 1.2 SendPulse (`sendpulse.service.ts`)
**Status**: ⚠️ Minimal Implementation

-   **Scope**:
    -   Only implements `syncContact` (adding to address book).
    -   No direct transactional Email or SMS sending methods found.
-   **Authentication**:
    -   Implements token management with expiration.
    -   Uses in-memory storage for tokens, which is process-local (not shared across clustered instances).
-   **Error Handling**:
    -   Logs errors but swallows them (returns `void`), making it hard for callers to know if sync failed.

### 1.3 AutoRia (`autoria.service.ts`)
**Status**: ❌ Placeholder

-   **Implementation**:
    -   Contains mock logic (`if apiKey === 'TEST'`).
    -   Real API call is commented out or simplistic (just search, no detail fetching).
    -   **Recommendation**: Needs full implementation including `marka_id` mapping and detail retrieval.

---

## 2. TELEGRAM ECOSYSTEM

### 2.1 Bot API Messaging (`telegramOutbox.ts` & `telegramSender.ts`)
**Status**: ⚠️ Functional but Risk-Prone

-   **Message Queuing**:
    -   Uses an in-memory `Promise` chain per `chatId` to throttle messages.
    -   **Risk**: If the server restarts or crashes, all queued messages are lost.
    -   **Scalability**: Throttling is process-local. Multiple instances will not share rate limits, potentially leading to 429s from Telegram.
-   **Rate Limiting**:
    -   Handles 429 "Too Many Requests" gracefully by respecting `retry_after`.
    -   Throttles per-chat but lacks global bot-level throttling (30 msgs/sec limit might be hit with many concurrent users).
-   **Persistence**:
    -   Logs messages to `BotMessage` table using raw SQL (`prisma.$executeRaw`). This is performant but bypasses Prisma's type safety.
-   **Recommendation**:
    -   Move the message queue to Redis (BullMQ) to ensure persistence across restarts and shared rate limiting across instances.

### 2.2 MTProto Client (`mtproto.service.ts`)
**Status**: ⚠️ Stateful & Monolithic

-   **Architecture**:
    -   Maintains active Telegram clients in a static `Map<string, TelegramClient>`.
    -   **Critical Flaw**: Clients are tied to the running process. A deployment or restart disconnects all clients.
    -   **Scaling**: Cannot scale horizontally. If two servers try to connect the same session, Telegram will revoke the older connection.
-   **Concurrency**:
    -   `getClient` is not concurrency-safe. Simultaneous calls might trigger multiple connection attempts.
-   **Recovery**:
    -   Relies on `MTProtoLifeCycle` (not analyzed here) to restore sessions on boot. If this fails, channels stop syncing.
