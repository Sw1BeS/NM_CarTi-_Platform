# Telegram QA Checklist

## Setup
1. Run `npm run seed:stage1` in `apps/server`.
2. Ensure you have a valid Telegram Bot Token in `apps/server/.env` (or via `BotConfig` update).
3. Ensure MTProto credentials (API_ID/HASH) are set if testing MTProto.

## Bot Flows
- [ ] **Lead Capture**:
    - Start bot `/start`.
    - Click "Buy Car" (or equivalent menu item).
    - Answer questions (Name, Car, Budget).
    - Verify Lead is created in DB (`prisma.lead.findMany`).
    - Verify Admin notification is sent (if configured).

- [ ] **Catalog**:
    - Start bot `/start`.
    - Click "Find Car".
    - Filter options (Brand, Model).
    - Verify results are shown.
    - Verify "Open Mini App" button appears.

- [ ] **B2B**:
    - Start bot `/start`.
    - Click "B2B Request".
    - Submit details.
    - Verify `B2BRequest` is created.

## Channel Posts (Webhook/Polling)
- [ ] **Post Intake**:
    - Add bot to a channel as Admin.
    - Post a car listing (text with price/year + photo).
    - Verify `Draft` is created in DB.
    - Verify Photo is downloaded to `apps/server/uploads/bot/...`.

## MTProto Sync
- [ ] **Connect**:
    - Go to Telegram Dashboard -> Channels.
    - Add Account (Phone number).
    - Enter Code (sent to Telegram app).
    - Verify status becomes "READY".

- [ ] **Sync**:
    - Add Channel Source (e.g. `@some_car_channel`).
    - Click "Sync".
    - Check logs for "Processed X messages".
    - Verify `CarListing` items created in DB.
    - Verify Photos downloaded to `apps/server/uploads/mtproto/...`.
