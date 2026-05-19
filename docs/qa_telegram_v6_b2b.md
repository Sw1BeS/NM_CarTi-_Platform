# QA: Telegram V6 & B2B Flow

This document outlines the testing procedures for the newly implemented Telegram Lead wizards, B2B Exchange flows, and Web UI enhancements.

## 1. Lead BUY & SELL Wizards
**Objective:** Verify that the step-by-step inline wizard works correctly, and input validation handles edge cases.

**Steps:**
1. Open the Telegram Client Bot.
2. Send the `/buy` command.
3. **Pledge:** Select Brand -> Select Model -> Enter Year (e.g. 2018) -> Enter Budget (e.g. 25000) -> Enter Phone.
4. Verify the confirmation screen displays all options correctly.
5. Click **"Підтвердити"**. Verify the Lead is created in the backend (check DB `Lead` table or Inbox).
6. Repeat the process for the `/sell` command.

## 2. B2B Registration & Validation
**Objective:** Verify that B2B partners can register smoothly via invite codes parsed during the `/start` command initialization or manually.

**Steps:**
1. Generate an `inviteCode` in the `PartnerCompany` table for an existing company (e.g., `CDL-TEST`).
2. Have a new user click the deep link: `https://t.me/your_b2b_bot?start=CDL-TEST`.
3. Verify that the bot identifies the user and automatically creates/links a `PartnerUser` associated with the correct `PartnerCompany`.
4. Send a text message in the B2B bot, fill out the Request form, and verify that the `b2bRequest` generated has the company's `partnerId`.

## 2a. B2B MiniApp Access Request Gate
**Objective:** Verify that a non-approved Telegram user can request B2B access from the MiniApp without receiving partner data.

**Steps:**
1. Open the B2B MiniApp from Telegram with a Telegram user that is not linked to an approved `PartnerUser`.
2. Verify the restricted screen says access is awaiting approval and does not show requests, variants, partner inventory, or contacts.
3. Tap **"Надіслати запит на доступ"**.
4. Verify the MiniApp shows a submitted status with the access request ID/status.
5. Verify the admin chat receives a `[B2B ACCESS]` notification with short inline callbacks for approve/reject.
6. Tap the same action again and verify the flow stays idempotent through `b2bWhitelistService.ensureAccess`.
7. Open the same URL outside Telegram or without valid `initData`; verify it shows a user-facing error and does not create a real access request.

## 3. B2B Variant Submissions
**Objective:** Verify that dealers can submit vehicle variants correctly via inline keyboards and the author of the request gets notified.

**Steps:**
1. Check the B2B channel post. It should have the button **"Є варіант"**.
2. Click **"Є варіант"**. It should open the B2B bot with the payload `/start b2bv_<requestId>`.
3. The bot should prompt the dealer for a vehicle description + photos.
4. Type a description (e.g., "Маю ідеальний VW Touareg 2022").
5. The bot should reply "Варіант надіслано автору запиту".
6. Verify that a `RequestVariant` row is created in the DB with status `SUBMITTED`.
7. Verify that the author of the `b2bRequest` receives an inline message with the variant text and buttons ["✅ Підходить", "❌ Не підходить"].

## 3a. B2B MiniApp Active Request Feed
**Objective:** Verify that an approved partner can browse active network requests and submit an offer without seeing requester contact data.

**Steps:**
1. Open the B2B MiniApp with an approved partner Telegram user.
2. Tap **"Запити мережі"**.
3. Verify active requests load from `/api/miniapp/b2b/requests/active`.
4. Verify the partner's own requests are excluded and requester contacts are redacted.
5. Tap **"Запропонувати авто"** on a request, submit a variant, and verify it enters admin/requester review.

## 4. Web MiniApp Enhancements
**Objective:** Verify that users can toggle Favorites (now using the Star icon) and multi-select vehicles in the MiniApp.

**Steps:**
1. Open the MiniApp via Telegram Hub or direct web link (if allowed).
2. Go to the **Catalogue (Склад)** tab.
3. Tap the **Star Icon (★)** in the top right corner of any car card.
4. Verify the Star immediately turns yellow. Verify the `Favorite` API endpoint was hit.
5. Navigate to the **Favorites (Обране)** tab and verify the chosen vehicle is displayed.
6. Return to Catalog, tap **"➕ Додати до мультивибору"** under 2-3 different cars.
7. Verify the **"Обрано авто: N"** bar appears at the bottom.
8. Tap **"Надіслати запит"** on the floating action bar.
9. Verify the Request view loads properly. Submit the request and verify the payload type is `lead_submit_multi` with an array of `carIds`.

## 4a. Lead MiniApp "Мої заявки"
**Objective:** Verify that LeadBot users can see their own request history from the MiniApp without exposing raw contact payloads.

**Steps:**
1. Open the Lead MiniApp from Telegram with a user that has at least one existing request.
2. Go to **"Мої заявки"** / status screen.
3. Verify the MiniApp calls `/api/miniapp/requests/my` with signed `initData`.
4. Verify recent requests render as cards with public ID, title, status, type/source, and date.
5. Tap **"Показати статус"** and verify the selected request appears in the status panel.
6. Open the same screen outside Telegram or without valid `initData`; verify it shows a user-facing error and does not trust query `telegramUserId`.
7. Confirm the response does not include raw `payload`, phone, or contact fields.

## 5. Support Tickets
**Objective:** Verify that `SupportTicket` creation works seamlessly behind the scenes.

**Steps:**
1. Open any bot and type a message that does NOT match an active command or wizard.
2. Verify the bot replies acknowledging the support request or creates a support ticket.
3. Check the DB `SupportTicket` table to ensure the `thread` JSON was updated correctly with the incoming text message message.
