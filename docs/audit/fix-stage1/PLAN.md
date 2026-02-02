# Stage-1 Fix & Ship: Implementation Plan

## Overview
**Goal**: Bring CarTié to a sellable state (Stage-1) in one pass.
**Focus**: Telegram Module, MTProto Integration, Data Integrity.
**Constraints**: No architectural revolutions, no security audit focus, minimal questions.

## Success Criteria (P0)
1.  **Lead Identity**: New TG leads have `telegramUsername`, `telegramName`, `telegramChatId`, and a valid `clientName`.
2.  **Dedup/Pipeline**: `channel_post` respects `channelMode` (INVENTORY/CONTENT). No duplicates in `CarListing` by `(sourceChatId, sourceMessageId)`.
3.  **MTProto Import**: At least 1 active `ChannelSource`, successful manual sync creating `CarListing` with `source='MTPROTO'`.

## Project Type
**BACKEND** (Node.js/TypeScript, Prisma, Telegram API)

## Tech Stack
-   **Runtime**: Node.js (Existing)
-   **DB**: Postgres + Prisma
-   **Framework**: Express (Existing)
-   **Integration**: Telegram Bot API, GramJS (MTProto)

## File Structure & Changes
-   **Docs**: `/srv/cartie/docs/audit/fix-stage1/` (Audit proofs)
-   **Code**:
    -   `src/modules/Communication/telegram/core/leadService.ts` (Identity)
    -   `src/modules/Communication/telegram/routing/routeChannelPost.ts` (Pipeline)
    -   `prisma/schema.prisma` (Dedup constraint)
    -   `src/modules/Integrations/mtproto/*` (Connector verification)

## Task Breakdown

### 1. Baseline Snapshot
-   **Agent**: `devops-engineer`
-   **Action**: Run diagnostic commands, save to `BASELINE.md`.
-   **Verify**: `BASELINE.md` exists and contains health/docker/git info.

### 2. P0-1: Lead Identity Fix
-   **Agent**: `backend-specialist`
-   **Input**: `leadService.ts`
-   **Action**: Ensure `telegramName/Username` are persisted. Add fallback for `clientName`.
-   **Verify**: Unit test `test-lead-identity`, SQL query showing populated fields.

### 3. P0-3: Dual Pipeline Fix
-   **Agent**: `backend-specialist`
-   **Input**: `routeChannelPost.ts`, `schema.prisma`
-   **Action**: Implement `channelMode` logic. Add `@@unique` constraint. Run migration.
-   **Verify**: SQL verification of constraint. No duplicates found.

### 4. P0-2: MTProto E2E Import
-   **Agent**: `backend-specialist`
-   **Input**: MTProto modules.
-   **Action**: Authenticate session, add channel source, run sync.
-   **Verify**: `ChannelSource > 0`, `CarListing(MTPROTO) > 0`.

### 5. Final Artifacts
-   **Agent**: `backend-specialist`
-   **Action**: Generate summary and proof documents (SQL outputs).
-   **Verify**: All 4 proof files present in `docs/audit/fix-stage1/`.

## Phase X: Verification Checklist
- [ ] `api/health` is 200 OK
- [ ] Telegram Webhook processes messages
- [ ] No regression in Lead creation
- [ ] No duplicates in CarListing
