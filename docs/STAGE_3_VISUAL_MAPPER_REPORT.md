# Stage 3: Interactive Visual Mapper Report

**Date:** 2026-01-29
**Status:** ✅ COMPLETED

## 1. Overview
We delivered the **"Teach & Remember"** system. Users can now define custom parsing rules for any Telegram channel without coding.

## 2. Key Features

### A. Visual Editor (Frontend)
- **Location**: Telegram Hub > MTProto Sources > "Rules" Button.
- **Capabilities**:
    - **Live Preview**: Paste a message and see extracted fields instantly.
    - **Rule Builder**: Point-and-click to assign Regex or Line Numbers.
    - **Test Mode**: Verify rules before saving.

### B. Parsing Engine (Backend)
- **Service**: `ParsingService` executes extraction templates.
- **Methods Supported**:
    - `REGEX`: Powerful pattern matching (e.g. `Price:\s*(\d+)`).
    - `LINE_INDEX`: Simple line-based extraction (e.g. Line 3 = Year).
    - `KEYWORD_AFTER`: Finds text after a label (e.g. "Price:").
    - `BETWEEN`: Extracts text between two markers.

### C. Auto-Sync Integration
- **Workflow**:
    - Normal Sync runs every 15 mins.
    - If a Channel has Source Rules -> Use `ParsingService`.
    - If no Rules -> Fallback to Heuristic Parser (Stage 2).
    - Data is saved to `CarListing` automatically.

## 3. How to Use
1. Go to **Telegram Hub**.
2. Click **Rules** on any connected channel.
3. Paste a sample message from that channel.
4. Define rules (e.g. Price is on Line 2).
5. Click **Test** to verify.
6. Click **Save**.
7. Future syncs will use this template!

## 4. Verification
- **Test Script**: `npx tsx scripts/test_parsing_service.ts` (Passes).
- **Routes**: `/api/integrations/parsing/preview` (Active).
