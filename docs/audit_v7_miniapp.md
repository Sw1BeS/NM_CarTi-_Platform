# Аудит MiniApp v7 (Lead + B2B)

Дата: 2026-02-24  
Скоуп: `apps/web` MiniApp UX parity та `routeWebApp` прийом payload.

## Поточний стан vs вимоги v7

| Вимога v7 | Поточна реалізація | Статус | Доказ (файл:рядок) |
|---|---|---|---|
| Catalog view + car cards + favorite toggle | Виділено в `CatalogView` з повним фільтром/картками; toggle улюбленого йде через API | OK | `apps/web/src/pages/public/miniapp/views/CatalogView.tsx:61`, `apps/web/src/pages/public/MiniApp.tsx:350` |
| Favorites view | Виділено в `FavoritesView` з рендером карток обраного | OK | `apps/web/src/pages/public/miniapp/views/FavoritesView.tsx:21` |
| Multi-select в обраному/каталозі | Є `selectedRequestCarIds`, toggle multi-select, selection bar | OK | `apps/web/src/pages/public/MiniApp.tsx:223`, `apps/web/src/pages/public/MiniApp.tsx:1297` |
| Кнопка `Надіслати запит` робить один submit з кількома `carIds` | Payload містить `carListingIds`; server приймає `carIds` масивом і створює єдиний lead | OK | `apps/web/src/pages/public/MiniApp.tsx:1229`, `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:113` |
| Telegram BackButton + внутрішня history | Є history helpers + BackButton hook | OK | `apps/web/src/pages/public/miniapp/navigation.ts:1`, `apps/web/src/pages/public/MiniApp.tsx:281`, `apps/web/src/pages/public/MiniApp.tsx:612` |
| Scroll/viewport policy | Встановлюються viewport CSS vars; `disableVerticalSwipes` не викликається примусово | OK | `apps/web/src/pages/public/miniapp/telegramViewport.ts:10` |
| Усі UI-тексти українською у MiniApp потоках | Ключові тексти форм/профілю/submit українською | OK | `apps/web/src/pages/public/miniapp/views/RequestView.tsx:60`, `apps/web/src/pages/public/miniapp/views/ProfileView.tsx:27` |
| Явні файли `CatalogView.tsx`/`FavoritesView.tsx` із плану | Реалізовано у виділених view-компонентах і підключено в `MiniApp.tsx` | OK | `apps/web/src/pages/public/miniapp/views/CatalogView.tsx:1`, `apps/web/src/pages/public/miniapp/views/FavoritesView.tsx:1`, `apps/web/src/pages/public/MiniApp.tsx:17` |

## Server payload parity

- Парсер приймає payload v1 з `carIds`.
- `routeWebApp` передає `carIds` у `createOrMergeLead` payload і в адмін-нотифікацію.

Доказ:
- `apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts:1`
- `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:71`
- `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:129`
- `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:177`

## Висновок

MiniApp відповідає v7 по каталогу/обраному/multi-select/send-lead/back/viewport та структурно має окремі `CatalogView`/`FavoritesView`.
