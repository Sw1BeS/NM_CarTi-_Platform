# MiniApp Submission Mechanism Audit (V6)

## 1. Current Submission Mechanism
**File:** `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts`
**Analysis:** Currently, submissions rely completely on Telegram's `web_app_data` event.
`web_app_data` is sent automatically by the Telegram client when the Mini App calls `Telegram.WebApp.sendData()`.

## 2. The Problem with Direct Links & Menu Bot
**Limitation:** `Telegram.WebApp.sendData()` **ONLY** works if the Mini App was opened via a specialized "Keyboard Button" of type `web_app` sent by the bot.
If the Mini App is opened via:
- Menu Button (bottom left)
- Direct link (`t.me/BotName/appname` or `/startapp`)
- Inline buttons in a group or channel

Then calling `sendData()` does absolutely nothing, or throws an error, and the bot NEVER receives the `web_app_data` update.

## 3. Required Changes
To support menu buttons and startapp launches:
1. **Frontend (Mini App):** Must stop relying purely on `sendData()`. Instead, it should make a standard HTTP REST API call (e.g., `POST /api/miniapp/submit`) matching the `miniappPayload` structure. It must pass the `initData` from Telegram to verify authenticity.
2. **Backend (Server):** Implement a new Express route (or reuse existing webhook if structured) that accepts the HTTP POST from the Mini App, validates `initData`, and triggers the exact same logic currently found in `routeWebApp.ts`.
3. **Payload Extension:** Expand payload to include `fav_toggle` and `lead_submit_multi` as required by the `miniappPayload.ts` rules.
