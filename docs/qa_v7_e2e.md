# QA End-to-End Checklist — MEGA PROMPT v7

## Pre-Deploy Gate

- [ ] `cd apps/server && npx tsc --noEmit` — compiles without errors
- [ ] `cd apps/server && npx vitest --run` — all tests pass
- [ ] `curl http://127.0.0.1:3002/health` — 200 OK

## Lead BUY Flow (@Cartie_Client_Bot)

- [ ] `/start` → Ukrainian menu with 4 buttons
- [ ] Tap "Купити авто" → "Крок 1/9. Марка"
- [ ] Select brand → "Крок 2/9. Модель"
- [ ] Select model → "Крок 3/9. Рік"
- [ ] Select year → "Крок 4/9. Бюджет"
- [ ] Select budget → "Крок 5/9. Пробіг"
- [ ] Select mileage → "Крок 6/9. Паливо"
- [ ] Select fuel → "Крок 7/9. Місто"
- [ ] Select city → "Крок 8/9. Коментар"
- [ ] Enter comment → "Крок 9/9. Контакт"
- [ ] Share contact → Review with all fields
- [ ] Tap "✅ Підтвердити" → "Дякуємо! Заявку прийнято"
- [ ] Admin group received 🟢 [LEAD BUY] notification
- [ ] Lead created in DB with name/username
- [ ] Tap "✏️ Змінити" on review → field list shown
- [ ] Tap "❌ Скасувати" → returns to menu
- [ ] "⬅️ Назад" works on every step

## Lead SELL Flow (@Cartie_Client_Bot)

- [ ] Tap "Продати авто" → "Крок 1/13. Марка"
- [ ] Walk through all 13 steps (brand→model→year→price→mileage→fuel→KPP→drive→condition→city→desc→photos→contact)
- [ ] Review shows all fields
- [ ] "✅ Підтвердити" → "Заявку на продаж прийнято"
- [ ] Admin group received 🟣 [LEAD SELL] notification

## Support Flow (@Cartie_Client_Bot)

- [ ] Tap "Підтримка" → "Опишіть вашу проблему"
- [ ] Send text → "Дякуємо! Звернення отримано"
- [ ] Admin group received 🆘 [SUPPORT] notification
- [ ] SupportTicket created in DB

## B2B Flow (@CarDealer_Lviv_Bot)

- [ ] Unregistered user → access request with inline button
- [ ] Admin receives 🟡 [B2B REG] notification with ✅ Approve / ❌ Reject
- [ ] Registered user → B2B menu (Новий запит / Інвентар / Правила / Інфо)
- [ ] Create request → walks through wizard → review → confirm
- [ ] Admin receives 🔵 [B2B REQUEST] notification
- [ ] Channel post published with "Є варіант" deeplink button
- [ ] Variant submission → admin receives 🟠 [B2B VARIANT] notification
- [ ] Client Fit/Not Fit buttons → 🔥 [FIT] notification to seller

## MiniApp

- [ ] Opens from bot menu button → shows loading → home screen
- [ ] Inventory tab → car cards display with images
- [ ] Tap car → detail view → "Цікавить" button works
- [ ] Favorites toggle → ♥️ icon changes
- [ ] Multi-select → "Request" with selected cars
- [ ] BackButton works on every view
- [ ] B2B mode if slug matches

## Regression

- [ ] Callback data ≤ 64 bytes for all inline buttons
- [ ] No forbidden contacts in comment fields accepted
- [ ] Phone validation rejects invalid formats
- [ ] Year validation rejects out-of-range values
- [ ] Session timeout returns user to menu
- [ ] Rate limiting works (> 30 actions/min → throttle message)

## Infrastructure

- [ ] `bash scripts/deploy/deploy_safe.sh` succeeds
- [ ] `bash scripts/deploy/rollback_safe.sh` succeeds
- [ ] Docker healthchecks green for db, api, web
- [ ] No PII in logs (check `docker logs infra2-api-1 --tail 200`)
