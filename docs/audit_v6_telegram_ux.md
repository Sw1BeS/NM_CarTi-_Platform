# Telegram UX Audit (V6)

## 1. Why "кнопок нет" (No Buttons) in Admin Groups
**File:** `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts`
**Line:** 70-76
**Root Cause:** The function `resolveReplyMarkupForChat` explicitly checks if the chat is private. If it is NOT private (e.g., a supergroup like the admin group), and the attached markup contains a `ReplyKeyboard` (`hasReplyKeyboard` returns true), it **strips the ReplyKeyboard completely** and replaces it with a generic inline keyboard (`buildOpenBotAndMiniAppKeyboard`) that just links to the Mini App and Bot.
Because `routeMessage.ts` relies on `showMenu()` which sends a `ReplyKeyboard`, when an admin tries to trigger the menu in the group, it gets replaced, resulting in "no functional menu buttons" in the admin group.

### Solution:
- Do not rely on `showMenu` or `ReplyKeyboard` for admin groups.
- For non-private chats, return a specific admin help message with **inline buttons** for actions like `[ℹ️ Інструкція]`.

## 2. Incomplete Data Saving in Lead Flows
**File:** `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
**Root Cause:** In the Lead BUY inline wizard flow (`flowV2`), we collect fields like `interest`, `car`, `budget`, `city`, `comment`, and `phone`. When confirming, the data is pushed, but `createOrMergeLead` needs to be used correctly with the short callbacks.
Also, the current `handleClientLead` logic relies on step-by-step normal messages. The requirement states that "All steps, quick picks, skip/back/edit/pagination/favorites = INLINE buttons under messages". Currently, it's using normal text inputs instead of a persistent inline wizard where a single message is edited (or quick picks are provided as inline buttons).

### Solution:
- Completely refactor the Lead BUY and SELL flows into an inline-button-driven wizard (Wizard UI) using `callback_query` updates.
- Save progress in `session.variables` after every step.
