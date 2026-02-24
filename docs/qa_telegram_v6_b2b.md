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

## 5. Support Tickets
**Objective:** Verify that `SupportTicket` creation works seamlessly behind the scenes.

**Steps:**
1. Open any bot and type a message that does NOT match an active command or wizard.
2. Verify the bot replies acknowledging the support request or creates a support ticket.
3. Check the DB `SupportTicket` table to ensure the `thread` JSON was updated correctly with the incoming text message message.
