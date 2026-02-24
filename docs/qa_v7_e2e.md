# QA v7 E2E (Lead + B2B + MiniApp)

Дата перевірки: 2026-02-24

## 1) Lead Bot `/start` (private)

1. Відкрити DM з `@Cartie_Client_Bot`, надіслати `/start`.
2. Перевірити ReplyKeyboard (рівно 4 кнопки):
- `Купити авто`
- `Продати авто`
- `Підтримка`
- `ℹ️ Інформація`
3. Перевірити inline-кнопки:
- `Відкрити MiniApp`
- `🔐 Конфіденційність`

Expected:
- welcome текст `common.welcome_lead` (UA).
- `web_app` кнопка лише у private.

## 2) Lead BUY (9 кроків + review/edit)

1. Натиснути `Купити авто`.
2. Пройти 9 кроків; кожен екран має `Крок X/9`.
3. Перевірити inline `⬅️ Назад` і `❌ Скасувати` на кроках.
4. Для optional кроків перевірити `Пропустити`.
5. На кроці коментаря ввести `+380501234567` -> має бути `common.err.contacts_forbidden`.
6. На кроці контакту:
- у private показується `request_contact`;
- manual `+380...` також приймається.
7. На review перевірити кнопки:
- `✅ Підтвердити`
- `✏️ Змінити`
- `❌ Скасувати`
8. Через `✏️ Змінити` відкрити список полів, перейти у вибране поле, змінити значення, повернутися в review.

Expected:
- після confirm: `🔎 Підбираю варіанти…`.
- 1–3 картки авто з кнопками `✅ Цікавить це авто` + `⭐ В обране/🗑 Прибрати з обраного`.
- control message: `Що робимо далі?`.

## 3) Favorites flow

1. Додати 2+ авто в обране.
2. Відкрити `⭐ Обране (N)`.
3. Перевірити пагінацію по 3 записи (`lb_fvp/lb_fvn`).
4. Натиснути `Звʼязатися по обраному`.

Expected:
- один агрегований адмін-лід з усіма carIds.

## 4) Lead SELL + admin actions

1. Пройти SELL wizard (кроки + review).
2. Перевірити review/edit-list/jump.
3. Submit -> адмін отримує `🟣 [LEAD SELL]` + 4 inline дії:
- `ls_save`
- `ls_pubc`
- `ls_pubb`
- `ls_b2br`
4. Натиснути кожну дію двічі.

Expected:
- перший клік: create/publish success.
- повторний клік: idempotent `вже виконано`.

## 5) Support tickets

1. Відкрити `Підтримка`.
2. Якщо OPEN ticket є -> перевірити `Доповнити / Новий`.
3. Заповнити текст + контакт + review.
4. Submit.

Expected:
- користувач: `support.received`.
- адміну: `🆘 [SUPPORT]`.

## 6) B2B `/start` unregistered

1. У DM `@CarDealer_Lviv_Bot` -> `/start`.
2. Перевірити, що до реєстрації НЕ показуються `Створити запит`/`Мій інвентар`.
3. Перевірити inline:
- `🏢 Я новий партнер`
- `👤 Я представник партнера`
- `📌 Правила`
- `ℹ️ Інформація`
- `💳 Тарифи`
- `🔐 Конфіденційність`

## 7) B2B Registration

1. New partner flow: company/city/name/contact/note + review.
2. Submit -> admin `🟡 [B2B REG]` з `br_ap/br_rj`.
3. Approve -> користувач отримує `b2b.reg.approved` і `CDL-XXXXXX`.
4. Agent flow: code + name + contact + review.

Expected:
- OWNER/AGENT створюються коректно.
- `lastName` і `role` заповнюються.

## 8) B2B Request/Variant privacy

1. Registered user створює request wizard + review + publish.
2. Channel пост не містить контактів, кнопка `Є авто`.
3. Інший партнер створює variant (через private wizard).
4. Автор request бачить variant БЕЗ контактів + `Підходить/Не підходить`.
5. `FIT` відправляє `🔥 [FIT]` адміну з контактами.

Expected:
- контакти ніколи не публікуються в channel/post автору.

## 9) MiniApp parity

1. Відкрити MiniApp з Telegram.
2. Catalog: toggle favorite.
3. Multi-select авто у каталозі/обраному.
4. Натиснути `Надіслати запит`.

Expected:
- один submit з `carListingIds[]`.
- у сервері lead payload містить `carIds[]`.
- BackButton/history працюють; viewport не блокує vertical swipe примусово.

---

## Фактичні виводи верифікації (2026-02-24)

### `corepack pnpm -C apps/server test`

- Result: `Test Files 40 passed (40)`
- Result: `Tests 146 passed (146)`

### `corepack pnpm -C apps/server build`

- Result: exit code `0` (TypeScript build successful)

### `corepack pnpm -C apps/web build`

- Result: `✓ built in 53.68s`
- Note: Vite warning about large chunks (`Inbox-*.js > 500kB`), build success.

### `corepack pnpm -C apps/server prisma migrate status`

```text
26 migrations found in prisma/migrations
Database schema is up to date!
```

### `corepack pnpm -C apps/server tsx scripts/check_telegram_health.ts`

```text
Lead admin: 5097128570 -> -1003785260526
Lead channel: 3662808163 -> -1003662808163
B2B admin: 5286062875 -> -1003702407477
B2B channel: 3818257920 -> -1003818257920
```

Все 4 контури доступні, bot-admin права підтверджені.

