# Аудит DB gap v7 (Prisma)

Дата: 2026-02-24  
Скоуп: `apps/server/prisma/schema.prisma`, сервісні контракти `partnerId`, invite-code policy.

## Матриця вимог v7 -> schema

| Вимога v7 | Стан у схемі | Статус | Доказ (файл:рядок) |
|---|---|---|---|
| `PartnerCompany.inviteCode @unique` | Поле `inviteCode String? @unique` присутнє | OK | `apps/server/prisma/schema.prisma:927`, `apps/server/prisma/schema.prisma:934` |
| `PartnerUser.role (OWNER/AGENT)` | `role PartnerUserRole @default(AGENT)` + enum існує | OK | `apps/server/prisma/schema.prisma:84`, `apps/server/prisma/schema.prisma:951`, `apps/server/prisma/schema.prisma:955` |
| `PartnerUser.lastName` | Поле `lastName String?` присутнє | OK | `apps/server/prisma/schema.prisma:954` |
| `B2bAccessRequest.payload Json` | Поле `payload Json? @db.JsonB` присутнє | OK | `apps/server/prisma/schema.prisma:624`, `apps/server/prisma/schema.prisma:633` |
| `SupportTicket` model | Модель та індекси OPEN/CLOSED підтримки присутні | OK | `apps/server/prisma/schema.prisma:600` |
| Єдиний inventory + партнерська привʼязка | `CarListing.partnerCompanyId` + relation на `PartnerCompany` | OK | `apps/server/prisma/schema.prisma:678`, `apps/server/prisma/schema.prisma:697` |
| Бізнес-alias `partnerId` без rename колонки | У API/route читається `partnerId` і мапиться у `partnerCompanyId` | OK | `apps/server/src/modules/Inventory/inventory/inventory.routes.ts:16`, `apps/server/src/modules/Inventory/inventory/inventory.routes.ts:202` |

## Alias-стратегія `partnerId` (compat)

- БД лишається на `CarListing.partnerCompanyId` (без руйнівного rename).
- У прикладному шарі дозволено вхідні `partnerId` та `partnerCompanyId`, обидва ведуть до однієї колонки.

Доказ:
- `readPartnerCompanyId` читає обидва поля — `apps/server/src/modules/Inventory/inventory/inventory.routes.ts:16`.
- Збереження в Prisma йде в `partnerCompanyId` — `apps/server/src/modules/Inventory/inventory/inventory.routes.ts:223`.

## Invite code contract

| Вимога | Реалізація | Статус | Доказ |
|---|---|---|---|
| Формат `CDL-XXXXXX` (A-Z0-9, 6) | Генератор додає префікс `CDL-` + 6 символів з whitelist алфавіту | OK | `apps/server/src/services/b2bRegistration.service.ts:38` |
| Унікальність invite-code | Retry-перевірка в БД до 200 спроб | OK | `apps/server/src/services/b2bRegistration.service.ts:131` |
| OWNER/AGENT + lastName при апруві/реєстрації | OWNER і AGENT створюються/оновлюються з `lastName` | OK | `apps/server/src/services/b2bRegistration.service.ts:295`, `apps/server/src/services/b2bRegistration.service.ts:399` |

## Міграції

- Поточний стан: схема БД актуальна (`Database schema is up to date`, `26 migrations found`).
- Нова руйнівна migration для rename не потрібна (v7 поля вже присутні).

Команда перевірки:
- `corepack pnpm -C apps/server prisma migrate status`

