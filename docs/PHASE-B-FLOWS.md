# Phase B: End-to-End TG Flow Definition

## 1. Customer Lead Capture (Bot)
**Status**: ✅ Implemented (Hardcoded in `bot.service.ts`)
- **Flow**: `/start` -> Name -> Car -> Budget -> City -> Request Contact -> Confirm.
- **Outcome**: Creates `Lead` AND `B2BRequest`.
- **Validation**:
    - `LeadCode` generated.
    - Admin notified (if `adminChatId` set).

## 2. Lead -> Request -> Broadcast
**Status**: ⚠️ Partial (Request created, but NOT posted to Channel)
- **Gap**: No automatic broadcast to Dealer Channel.
- **Target Flow**:
    1. `B2BRequest` created (via Bot or Admin).
    2. System checks for `DEALER_CHANNEL_ID` in `BotConfig` or `.env`.
    3. Formats message:
       ```
       📋 NEW REQUEST #L-12345
       🚗 BMW X5 2020
       💰 $50k-60k
       📍 Kyiv

       👇 Submit Offer:
       [Button: Submit Offer](t.me/MyBot?start=offer_L-12345)
       ```
    4. Posts to Channel using `telegramOutbox`.

## 3. Dealer Offer Submission
**Status**: ⚠️ Partial (Deep link parsing exists, but logic is empty)
- **Gap**: `case 'offer'` in `handleDeepLink` only sends a text message. Does NOT start an offer flow.
- **Target Flow**:
    1. Dealer clicks "Submit Offer" -> Opens Bot -> `/start offer_L-12345`.
    2. Bot: "Submit offer for #L-12345. Enter Price (USD):".
    3. Dealer: "55000".
    4. Bot: "Description/Comments?".
    5. Dealer: "Ready stock, grey color".
    6. Bot: "Attach photos (optional)".
    7. Bot: "Confirm?".
    8. **Outcome**: Creates `RequestVariant` (Offer) in DB.
    9. **Notification**: Admin gets "New Offer from Dealer X".

## 4. Close & Resolve
**Status**: ❌ Missing
- **Target Flow**:
    1. Admin clicks "Accept Offer" in CRM.
    2. Bot notifies Dealer: "Your offer accepted! Contact client: +380..."
    3. Bot notifies Client: "Offer found! Dealer: ..." (Optional).

## Implementation Plan for Phase B
1.  **Modify `bot.service.ts`**:
    - Add `postRequestToChannel()` helper.
    - Call it after `B2BRequest` creation.
2.  **Implement `OFFER_*` states**:
    - Enhance `handleDeepLink` to set state `OFFER_PRICE`.
    - Handle steps: Price -> Desc -> Photos -> Save `RequestVariant`.
