# Release Notes: Telegram Integration v1.0

**Status:** 🚀 Ready for Production
**Date:** 2026-01-29

## Executive Summary
The Cartie Platform is now fully integrated with Telegram, featuring bi-directional communication, automated inventory syncing, and intelligent visual parsing.

## Key Features

### 1. Automated Inventory Sync
- **Scheduler**: Automatically pulls messages from connected channels every 15 minutes.
- **Rules Engine**: "Teach" the system how to parse messages using the **Visual Mapper**.
    - Supports Regex, Line Index, and Keywords.
    - Falls back to AI heuristics if no rules are defined.
- **Safety**: Rate-limited (2s delay) to prevent bans.

### 2. Dealer Bot Ecosystem
- **Dealer Bot**: Handles lead capture, dealer offers, and support requests.
- **Deep Linking**: `/start offer_123` allows dealers to submit offers directly from channel broadcasts.
- **Flows**:
    - `Lead Capture`: "I want to buy..."
    - `Offer Submission`: "I have this car..."
    - `Support`: "Help me..."

### 3. Analytics & Admin
- **Telegram Pulse**: Real-time stats in the Dashboard (Active Sources, Listing Count, daily Leads).
- **Multi-Tenancy**: All data is strictly isolated by Workspace.

## Migration Guide
1. **Deploy**: Run `deploy_prod.sh`.
2. **Environment**: Ensure `TG_API_ID` and `TG_API_HASH` are set.
3. **Verify**: Check `GET /api/integrations/mtproto/stats` returns 200.

## Known Limitations
- **Media**: Currently imports car descriptions/text. Media download is basic.
- **Auth**: MTProto session requires periodic re-auth if Telegram revokes it (handled via UI).
