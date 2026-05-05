# ПОЛНЫЙ АУДИТ РЕПОЗИТОРИЯ CARTIE PLATFORM

**Дата аудита:** 2026-05-05  
**Аудитор:** AI Code Expert  
**Статус репозитория:** Production-ready с замечаниями

---

## 📋 СОДЕРЖАНИЕ

1. [Общая информация](#1-общая-информация)
2. [Архитектура проекта](#2-архитектура-проекта)
3. [Зависимости и технологии](#3-зависимости-и-технологии)
4. [Бэкенд аудит](#4-бэкенд-аудит)
5. [Фронтенд аудит](#5-фронтенд-аудит)
6. [База данных и Prisma](#6-база-данных-и-prisma)
7. [Инфраструктура и DevOps](#7-инфраструктура-и-devops)
8. [Скрипты и автоматизация](#8-скрипты-и-автоматизация)
9. [Документация](#9-документация)
10. [Тестирование](#10-тестирование)
11. [Безопасность](#11-безопасность)
12. [Проблемы и рекомендации](#12-проблемы-и-рекомендации)
13. [План действий](#13-план-действий)

---

## 1. ОБЩАЯ ИНФОРМАЦИЯ

### 1.1 Статистика репозитория

| Метрика | Значение |
|---------|----------|
| TypeScript/JavaScript файлов | 439 |
| Markdown документов | 112+ |
| Тестовых файлов (.test.ts) | 47 |
| Строк в schema.prisma | 2,201 |
| Модулей бэкенда | 11 основных |
| Страниц фронтенда | 20+ |
| API маршрутов | 18 файлов маршрутов |

### 1.2 Структура проекта

```
/workspace/
├── apps/
│   ├── server/          # Express.js бэкенд
│   └── web/             # React/Vite фронтенд
├── docs/                # Документация (112+ файлов)
├── env/                 # Конфигурации окружения
├── infra/               # Docker, Caddy, скрипты развертывания
├── scripts/             # Утилиты и скрипты миграции
├── storage/             # Хранилище медиафайлов
├── verification/        # Скрипты верификации
└── .github/workflows/   # CI/CD конфигурация
```

### 1.3 Тип проекта

**Cartie Platform** — многопользовательская B2B автомобильная платформа с:
- Telegram интеграцией (Bot API + MTProto)
- Генерацией лидов
- Управлением инвентарем автомобилей
- B2B запросами между дилерами
- Контент-календарем и публикациями
- Мини-приложением для Telegram

---

## 2. АРХИТЕКТУРА ПРОЕКТА

### 2.1 Технологический стек

| Слой | Технология | Версия |
|------|------------|--------|
| **Frontend** | React | 19.2.3 |
| | Vite | 6.4.1 |
| | Tailwind CSS | 4.1.18 |
| | React Router | 7.12.0 |
| | Lexical (Editor) | 0.39.0 |
| | Framer Motion | 12.27.5 |
| | Recharts | 3.6.0 |
| **Backend** | Node.js | 20.x (CI), 22-bookworm (prod) |
| | Express | 4.22.1 |
| | TypeScript | 5.8.3-5.9.3 |
| | Prisma ORM | 5.22.0 |
| | Zod (валидация) | 3.25.76 |
| **Database** | PostgreSQL | 15 (Alpine) |
| **Infra** | Docker Compose | v2 |
| | Caddy | Reverse Proxy |
| **Telegram** | GramJS (telegram) | 2.26.22 |
| | Bot API | webhook/polling |

### 2.2 Архитектурные модули бэкенда

```
apps/server/src/modules/
├── Core/                    # Ядро системы
│   ├── auth/               → JWT аутентификация
│   ├── companies/          → Управление workspace'ами
│   ├── entities/           → Динамические сущности
│   ├── health/             → Health checks
│   ├── superadmin/         → Кросс-workspace администрирование
│   ├── system/             → Настройки, feature flags
│   ├── templates/          → Шаблоны сценариев
│   └── users/              → Пользователи и роли
│
├── Communication/          # Коммуникации
│   ├── bots/               → CRUD BotConfig
│   └── telegram/           → Telegram Bot API + MTProto
│       ├── core/
│       ├── messaging/
│       ├── routing/
│       └── scenarios/
│
├── Integrations/           # Внешние интеграции
│   ├── external-search/    # Автопоиск (Auto.RIA, OLX)
│   ├── meta/               → Meta Pixel / CAPI
│   ├── mtproto/            → MTProto парсинг каналов
│   ├── parsing/            → Парсинг контента
│   ├── sendpulse/          → Email/SMS рассылки
│   ├── viber/              → Viber Business
│   └── whatsapp/           → WhatsApp Business API
│
├── Inventory/              # Каталог автомобилей
│   └── inventory/          → CarListing CRUD, поиск, фильтры
│
├── Marketing/              # Маркетинг
│   └── campaigns/          → Кампании и рассылки
│
├── Orchestration/          # Оркестрация
│   └── skillpacks/         → Пакеты навыков (новая фича)
│
├── Parser/                 → Парсинг и нормализация
│
├── Sales/                  # Продажи B2B
│   └── requests/           → B2bRequest, RequestVariant
│
└── v41/                    → Legacy совместимость
```

### 2.3 Сервисный слой

**Основные сервисы** (`apps/server/src/services/`):

| Сервис | Назначение | Строк кода |
|--------|-----------|------------|
| `templatePreset.service.ts` | Пресеты шаблонов | 43,280 |
| `requestContract.service.ts` | Контракты B2B запросов | 35,582 |
| `channel-ingestion.service.ts` | Импорт из каналов | 18,386 |
| `cardRenderer.ts` | Рендер карточек авто | 17,265 |
| `miniapp.service.ts` | Telegram MiniApp | 13,797 |
| `b2bRegistration.service.ts` | Регистрация партнеров | 13,508 |
| `dto.ts` | Data Transfer Objects | 25,803 |
| `enhanced-parsing.utils.ts` | Улучшенный парсинг | 8,456 |
| `b2bWhitelist.service.ts` | Whitelist партнеры | 6,764 |
| `parser.ts` | Базовый парсер | 7,593 |
| `mtproto-mapping.service.ts` | MTProto маппинг | 5,616 |
| `b2bRouting.service.ts` | Роутинг B2B | 4,790 |
| `mediaStorage.service.ts` | Хранение медиа | 4,281 |
| `publicSlug.service.ts` | Публичные slug'и | 4,098 |
| `publication.service.ts` | Публикации | 3,875 |
| `normalization.service.ts` | Нормализация данных | 4,121 |
| `quota.service.ts` | Квоты использования | 2,871 |
| `supportTicket.service.ts` | Тикеты поддержки | 1,953 |

**Всего сервисов:** 40+ файлов на ~250K строк кода

### 2.4 Слои приложения

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  Pages → Components → Services → API Client (axios)     │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│                   Backend (Express)                      │
│  Routes → Middleware → Services → Repositories → Prisma │
└─────────────────────────────────────────────────────────┘
                          ↓ SQL
┌─────────────────────────────────────────────────────────┐
│                  Database (PostgreSQL)                   │
│  60+ моделей, индексы, триггеры, JSONB поля            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. ЗАВИСИМОСТИ И ТЕХНОЛОГИИ

### 3.1 Бэкенд зависимости (production)

| Пакет | Версия | Назначение | Критичность |
|-------|--------|-----------|-------------|
| `@prisma/client` | 5.22.0 | ORM | 🔴 Критично |
| `express` | 4.22.1 | Web фреймворк | 🔴 Критично |
| `axios` | 1.13.2 | HTTP клиент | 🟡 Важно |
| `jsonwebtoken` | 9.0.3 | JWT токены | 🔴 Критично |
| `bcryptjs` | 2.4.3 | Хеширование паролей | 🟡 Важно |
| `zod` | 3.25.76 | Валидация схем | 🟡 Важно |
| `cors` | 2.8.5 | CORS middleware | 🟢 Стандарт |
| `dotenv` | 16.6.1 | Переменные окружения | 🟢 Стандарт |
| `node-cron` | 3.0.3 | Планировщик задач | 🟡 Важно |
| `telegram` | 2.26.22 | GramJS для MTProto | 🔴 Критично |
| `cheerio` | 1.1.2 | HTML парсинг | 🟢 Опционально |
| `big-integer` | 1.6.52 | Большие числа | 🟢 Опционально |
| `ulid` | 2.4.0 | ULID генератор | 🟢 Стандарт |

### 3.2 Бэкенд dev-зависимости

| Пакет | Версия | Назначение |
|-------|--------|-----------|
| `typescript` | 5.9.3 | Типизация |
| `tsx` | 4.21.0 | TS execution |
| `ts-node` | 10.9.2 | TS runtime |
| `ts-node-dev` | 2.0.0 | TS dev server |
| `prisma` | 5.22.0 | Prisma CLI |
| `vitest` | 1.6.1 | Тестирование |
| `supertest` | 7.2.2 | API тесты |
| `@types/*` | различные | TypeScript определения |

### 3.3 Фронтенд зависимости (production)

| Пакет | Версия | Назначение | Критичность |
|-------|--------|-----------|-------------|
| `react` | 19.2.3 | UI библиотека | 🔴 Критично |
| `react-dom` | 19.2.3 | React DOM | 🔴 Критично |
| `react-router-dom` | 7.12.0 | Роутинг | 🔴 Критично |
| `vite` | 6.4.1 | Build tool | 🔴 Критично |
| `tailwindcss` | 4.1.18 | CSS framework | 🔴 Критично |
| `@tailwindcss/postcss` | 4.1.18 | PostCSS plugin | 🟡 Важно |
| `axios` | 1.13.2 | HTTP клиент | 🟡 Важно |
| `lexical/*` | 0.39.0 | Rich text editor | 🟡 Важно |
| `framer-motion` | 12.27.5 | Анимации | 🟢 Опционально |
| `recharts` | 3.6.0 | Графики | 🟢 Опционально |
| `reactflow` | 11.11.4 | Flow builder | 🟡 Важно |
| `lucide-react` | 0.562.0 | Иконки | 🟢 Стандарт |
| `dompurify` | 3.3.1 | Sanitization | 🟡 Безопасность |
| `emoji-mart` | 5.6.0 | Эмодзи | 🟢 Опционально |
| `clsx` | 2.1.1 | className utility | 🟢 Стандарт |
| `tailwind-merge` | 3.4.0 | Tailwind utility | 🟢 Стандарт |

### 3.4 Анализ зависимостей

**✅ Положительно:**
- Все зависимости актуальные (2024-2025 версии)
- React 19 — последняя мажорная версия
- Tailwind CSS v4 — новейшая версия
- Нет известных уязвимостей в критичных пакетах
- Минимальное количество зависимостей (нет bloating)

**⚠️ Замечания:**
- `bcryptjs` имеет известную альтернативу `bcrypt` (native, быстрее)
- `node-cron` — для production рассмотреть BullMQ с Redis
- `telegram` (GramJS) требует careful session management

---

## 4. БЭКЕНД АУДИТ

### 4.1 Структура исходного кода

```
apps/server/src/
├── __tests__/              # Unit тесты
├── config/                 # Конфигурация
├── middleware/             # Express middleware
├── modules/                # Бизнес-модули (11 папок)
├── repositories/           # Data access layer
├── routes/                 # API маршруты (18 файлов)
├── scripts/                # Миграционные скрипты
├── seeds/                  # Seed данные
├── services/               # Бизнес-логика (40+ файлов)
├── utils/                  # Утилиты
├── validation/             # Zod схемы
└── workers/                # Фоновые задачи
```

### 4.2 API Маршруты

| Файл маршрута | Префикс | Назначение | Строк |
|--------------|---------|-----------|-------|
| `apiRoutes.ts` | `/api` | Основной роутер | 1,412 |
| `b2bV2.routes.ts` | `/api/b2b` | B2B запросы v2 | 9,205 |
| `entityRoutes.ts` | `/api/entities` | Динамические сущности | 10,990 |
| `miniAppRoutes.ts` | `/api/miniapp` | Telegram MiniApp | 25,885 |
| `publicRoutes.ts` | `/p` | Публичные страницы | 16,100 |
| `qaRoutes.ts` | `/api/qa` | QA инструменты | 6,801 |
| `legacyAdmin.routes.ts` | `/api/admin` | Legacy админка | 4,739 |
| `legacyAnalytics.routes.ts` | `/api/analytics` | Аналитика | 16,825 |
| `legacyBots.routes.ts` | `/api/bots` | Боты | 19,659 |
| `legacyCampaigns.routes.ts` | `/api/campaigns` | Кампании | 13,295 |
| `legacyContent.routes.ts` | `/api/content` | Контент | 18,800 |
| `legacyDrafts.routes.ts` | `/api/drafts` | Черновики | 8,117 |
| `legacyLeads.routes.ts` | `/api/leads` | Лиды | 8,162 |
| `legacyMessaging.routes.ts` | `/api/messaging` | Сообщения | 23,751 |
| `legacyScenarios.routes.ts` | `/api/scenarios` | Сценарии | 8,237 |
| `legacyTelegramProxy.routes.ts` | `/api/tg-proxy` | Telegram proxy | 12,561 |

**Всего API endpoints:** 100+

### 4.3 Middleware

| Middleware | Назначение |
|-----------|-----------|
| `auth.middleware.ts` | JWT верификация |
| `error.middleware.ts` | Глобальная обработка ошибок |
| `rateLimit.middleware.ts` | Rate limiting |
| `validate.middleware.ts` | Zod валидация запросов |
| `workspace.middleware.ts` | Multi-tenancy isolation |

### 4.4 Репозитории

| Репозиторий | Модель |
|------------|--------|
| `BotConfigRepository.ts` | BotConfig |
| `LeadRepository.ts` | Lead |
| `RequestRepository.ts` | B2bRequest |
| `WorkspaceRepository.ts` | Workspace |
| `UserRepository.ts` | GlobalUser/User |

### 4.5 Ключевые проблемы бэкенда

#### 🔴 КРИТИЧНЫЕ

1. **In-Memory MTProto сессии**
   - Файл: `modules/Integrations/mtproto/mtproto.service.ts`
   - Проблема: `private static clients: Map<string, TelegramClient>`
   - Риск: Все сессии теряются при рестарте сервера
   - Решение: Реализовать Connection Manager с восстановлением из БД

2. **Отсутствие идемпотентности вебхуков**
   - Файл: `modules/Communication/telegram/routing/`
   - Проблема: Нет deduplication по `update_id`
   - Риск: Дублирование обработки при retry от Telegram
   - Решение: Redis/DB cache с TTL 24h

3. **Смешение ответственности в роутах**
   - Файл: `routes/legacy*.ts`
   - Проблема: Бизнес-логика внутри route handlers
   - Риск: Сложность тестирования, violation of SRP
   - Решение: Вынести всю логику в сервисы

#### 🟡 ВАЖНЫЕ

4. **Feature Flags в production**
   - Файл: `utils/constants.ts`, `prisma/seed.ts`
   - Проблема: `FEATURE_FLAGS.USE_V4_DUAL_WRITE` активен
   - Риск: Dual-write усложняет отладку
   - Решение: Завершить миграцию или удалить dual-write

5. **TODO комментарии в коде**
   ```typescript
   // TODO: Implement Google Sheets API (integration.service.ts:290)
   // TODO: EditMessage support (mtproto.service.ts:444)
   // TODO: Migrate callers to use UnifiedWorkspace (company.service.ts:19)
   ```

6. **Logger уровень 'error' для MTProto**
   - Проблема: Невозможно дебажить потерянные сообщения
   - Решение: Добавить configurable log levels

#### 🟢 РЕКОМЕНДАЦИИ

7. **Отдельный Worker процесс**
   - Проблема: Тяжелые MTProto операции блокируют Express
   - Решение: BullMQ worker или отдельный процесс

8. **TypeScript `any` usage**
   - Файл: `type_coverage_baseline.json` содержит 100+ entries
   - Проблема: Потеря типобезопасности
   - Решение: Постепенная замена на proper types

---

## 5. ФРОНТЕНД АУДИТ

### 5.1 Структура исходного кода

```
apps/web/src/
├── App.tsx                 # Главный компонент (9,065 строк)
├── components/             # Переиспользуемые компоненты
│   ├── Editor/            # Lexical editor компоненты
│   ├── ui/                # UI primitives
│   ├── CarPicker.tsx      # Выбор автомобиля
│   ├── CommandPalette.tsx # Командная палитра
│   ├── EmptyState.tsx     # Пустые состояния
│   ├── Layout.tsx         # Основной layout (18,461 строк)
│   ├── NotFound.tsx       # 404 страница
│   └── SkeletonLoader.tsx # Загрузочные скелетоны
├── config/                 # Конфигурация
├── contexts/               # React Contexts
├── modules/                # Бизнес-модули
├── pages/                  # Страницы приложения
│   ├── app/               # Основное приложение
│   ├── public/            # Публичные страницы
│   └── superadmin/        # Супер-админ панель
├── providers/              # Провайдеры
├── services/               # API клиенты
├── types/                  # TypeScript типы
├── utils/                  # Утилиты
├── translations.ts         # Переводы (44,450 строк)
└── translations.empty-states.ts  # Переводы empty states
```

### 5.2 Страницы приложения

| Страница | Маршрут | Описание |
|---------|---------|----------|
| `Dashboard.tsx` | `/` | Аналитика, KPI, активность |
| `Login.tsx` | `/login` | JWT логин |
| `TelegramHub.tsx` | `/telegram` | Боты, кампании, MTProto |
| `ScenarioBuilder.tsx` | `/scenarios` | Визуальный конструктор |
| `AutomationBuilder.tsx` | `/automations` | ReactFlow автоматизации |
| `Leads.tsx` | `/leads` | Inbox лидов |
| `Inbox.tsx` | `/inbox` |Unified messages |
| `Requests.tsx` | `/requests` | B2B запросы |
| `Inventory.tsx` | `/inventory` | Каталог авто |
| `Integrations.tsx` | `/integrations` | Настройки интеграций |
| `Content.tsx` | `/content` | Управление контентом |
| `ContentCalendar.tsx` | `/calendar` | Календарь публикаций |
| `Companies.tsx` | `/companies` | Switcher workspace'ов |
| `Settings.tsx` | `/settings` | Настройки пользователя |
| `CompanySettings.tsx` | `/company` | Настройки workspace |
| `Marketplace.tsx` | `/marketplace` | Библиотека шаблонов (RESTRICTED) |
| `Search.tsx` | `/search` | Глобальный поиск |
| `Health.tsx` | `/health` | Мониторинг здоровья |
| `Entities.tsx` | `/entities` | Динамические сущности |
| `QAStageA.tsx` | `/qa` | QA тестирование |

**Публичные страницы:**
- `/p/request` — Публичный запрос
- `/p/app` — Mini App
- `/p/dealer` — Дилерский портал
- `/p/proposal/:id` — Предложение

### 5.3 Компоненты

**Ключевые компоненты:**

| Компонент | Строк | Назначение |
|----------|-------|-----------|
| `Layout.tsx` | 18,461 | Основной layout с навигацией |
| `App.tsx` | 9,065 | Роутинг и провайдеры |
| `CommandPalette.tsx` | 5,144 | Глобальный поиск команд |
| `CarPicker.tsx` | 4,814 | Выбор автомобиля |
| `translations.ts` | 44,450 | Интернационализация |
| `translations.empty-states.ts` | 9,570 | Empty state тексты |

### 5.4 Проблемы фронтенда

#### 🔴 КРИТИЧНЫЕ

1. **Огромный App.tsx (9K строк)**
   - Проблема: Нарушение Single Responsibility Principle
   - Риск: Сложность поддержки и тестирования
   - Решение: Разбить на smaller router components

2. **Огромный Layout.tsx (18K строк)**
   - Проблема: Вся логика навигации в одном файле
   - Риск: Merge conflicts, difficult onboarding
   - Решение: Вынести navigation logic в отдельные hooks

#### 🟡 ВАЖНЫЕ

3. **Переводы в одном файле (44K строк)**
   - Проблема: Сложность управления переводами
   - Решение: Разбить по модулям/страницам

4. **Отсутствие Storybook**
   - Проблема: Нет документации компонентов
   - Решение: Добавить Storybook для UI components

5. **Нет code splitting для тяжелых страниц**
   - Проблема: Большой initial bundle
   - Решение: Dynamic imports для route-based splitting

#### 🟢 РЕКОМЕНДАЦИИ

6. **React 19 migration check**
   - ✅ Используется React 19.2.3
   - ⚠️ Проверить использование новых features (Actions, useOptimistic)

7. **Tailwind CSS v4**
   - ✅ Используется новейшая версия
   - ⚠️ Проверить совместимость плагинов

---

## 6. БАЗА ДАННЫХ И PRISMA

### 6.1 Схема базы данных

**Файл:** `apps/server/prisma/schema.prisma` (2,201 строка)

**Модели (60+):**

#### Core Models
- `Workspace` — Многопользовательский tenant
- `GlobalUser` — Кросс-workspace пользователь
- `Account` — Sub-workspace (дилеры)
- `Membership` — Роли и permissions
- `Company` — Legacy (совместимость)
- `User` — Legacy (совместимость)

#### Communication Models
- `BotConfig` — Конфигурация ботов
- `BotSession` — Сессии ботов
- `Scenario` — Сценарии диалогов
- `Campaign` — Рассылки
- `Lead` — Лиды
- `LeadActivity` — Активность лидов
- `BotMessage` — Сообщений бота
- `ChatMacro` — Макросы чата
- `ChatNote` — Заметки чата

#### Sales Models
- `B2bRequest` — B2B запросы
- `RequestVariant` — Варианты ответов
- `MessageLog` — Лог сообщений
- `B2bAccessRequest` — Запросы доступа
- `PartnerCompany` — Компании-партнеры
- `PartnerUser` — Пользователи партнеров

#### Inventory Models
- `CarListing` — Автомобили
- `NormalizationAlias` — Нормализация брендов/моделей
- `ExternalSource` — Внешние источники

#### Content Models
- `Draft` — Черновики
- `Template` — Шаблоны публикаций
- `PublicationJob` — Задачи публикаций
- `PublicationResult` — Результаты публикаций
- `ChannelPost` — Посты в каналах

#### Integration Models
- `Integration` — Интеграции
- `IntegrationEventLog` — Лог событий
- `MTProtoConnector` — MTProto подключения
- `ChannelSource` — Источники каналов

#### System Models
- `SystemSettings` — Настройки системы
- `SystemLog` — Логи системы
- `QuotaUsage` — Использование квот
- `SupportTicket` — Тикеты поддержки
- `PublicSequence` — Публичные sequence'ы
- `ParsingJob` — Задачи парсинга

#### v4.1 Generic Models (40+)
- `EntityType`, `FieldDefinition`, `Record`, `FieldValue`
- `Relationship`, `Permission`, `Role`, `Workflow`

### 6.2 Миграции

**Директория:** `apps/server/prisma/migrations/`

| Миграция | Дата | Назначение |
|---------|------|-----------|
| `20240320000000_add_showcase` | 2024-03 | Витрины |
| `20260119000000_v41_baseline` | 2026-01-19 | v4.1 baseline |
| `20260120031338_system_customization_fields` | 2026-01-20 | Кастомизация |
| `20260120180951_sync_car_listing_schema` | 2026-01-20 | Синхронизация авто |
| `20260121181040_add_sendpulse` | 2026-01-21 | SendPulse интеграция |
| `20260122064604_add_performance_indexes` | 2026-01-22 | Индексы производительности |
| `20260123150000_add_lead_company_id` | 2026-01-23 | Company для лидов |
| `20260124000000_add_request_type` | 2026-01-24 | Типы запросов |
| `20260130000000_stage2_m1_registry` | 2026-01-30 | Registry |
| `20260130120000_stage2_m6_content_publication` | 2026-01-30 | Публикации |
| `20260201152000_stage2_m5_miniapp_favorites` | 2026-02-01 | MiniApp favorites |
| `20260203120000_add_operator_user_roles` | 2026-02-03 | Роли операторов |
| `20260203130000_platform_gap_closure` | 2026-02-03 | Gap closure |
| `20260203194500_add_scenario_botid` | 2026-02-03 | Scenario botId |
| `20260203200000_add_request_botid` | 2026-02-03 | Request botId |
| `20260216133000_add_scheduled_job_table` | 2026-02-16 | Scheduled jobs |
| `20260220143000_mega_prompt_phase2_additive` | 2026-02-20 | Mega prompt |
| `20260223124500_partner_admin_group_chat_id` | 2026-02-23 | Partner admin groups |
| `20260309120000_orchestration_intake_skillpacks` | 2026-03-09 | Skill packs |

**Всего миграций:** 20+

### 6.3 Индексы

**Критические индексы:**
- Составные индексы для `companyId + status + createdAt`
- Unique индексы для `tgUserId`, `token`, `slug`
- Full-text поиск через PostgreSQL (не настроен явно)

### 6.4 Проблемы базы данных

#### 🔴 КРИТИЧНЫЕ

1. **Dual Schema (Legacy + v4.1)**
   - Проблема: Одновременное существование `Company`/`User` и `Workspace`/`GlobalUser`
   - Риск: Путаница, data inconsistency
   - Решение: Полная миграция или удаление legacy

2. **Отсутствие foreign key constraints для некоторых связей**
   - Проблема: Некоторые связи без `onDelete: Cascade`
   - Риск: Orphaned records
   - Решение: Audit всех relations

#### 🟡 ВАЖНЫЕ

3. **JSONB поля без схемы**
   - Проблема: `payload Json @db.JsonB` без валидации
   - Риск: Data corruption
   - Решение: Zod validation на уровне сервиса

4. **Отсутствие soft delete**
   - Проблема: Hard delete для критичных данных
   - Решение: Добавить `deletedAt` поля

---

## 7. ИНФРАСТРУКТУРА И DEVOPS

### 7.1 Docker Compose (Production)

**Файл:** `infra/docker-compose.cartie2.prod.yml`

```yaml
services:
  db:       # PostgreSQL 15 Alpine
  api:      # Node.js backend
  web:      # Caddy + frontend
```

**Конфигурация:**
- Ports: `5433` (DB), `3002` (API), `8082` (Web)
- Healthchecks: Все сервисы
- Volumes: Persistent storage для DB и медиа
- Network: Internal network

### 7.2 Dockerfile

**Backend:** `infra/Dockerfile.api`
- Base: `node:22-bookworm-slim`
- Optimized layer caching ✅
- Multi-stage build

**Frontend:** `infra/Dockerfile.web`
- Base: `node:22-bookworm-slim` + Caddy
- Build-time env injection
- Static assets optimization

### 7.3 Caddy Configuration

**Файл:** `infra/Caddyfile`

```caddy
:8080 {
    reverse_proxy /api/* api:3001
    reverse_proxy /* web:80
}
```

### 7.4 Скрипты развертывания

| Скрипт | Назначение | Статус |
|-------|-----------|--------|
| `deploy_prod.sh` | Production deploy | ✅ Optimized |
| `deploy_infra2.sh` | Infra v2 deploy | ✅ Ready |
| `deploy_manual.sh` | Manual deploy | ✅ Ready |
| `monitor.sh` | Monitoring | ✅ Active |
| `prod_verify.sh` | Production verification | ✅ Active |
| `security_preflight.sh` | Security check | ✅ Active |
| `verify_telegram_live.sh` | Telegram verification | ✅ Active |

### 7.5 CI/CD

**Файл:** `.github/workflows/ci.yml`

**Pipeline:**
1. Checkout
2. Node.js 20.x setup
3. PostgreSQL 15 container
4. Install dependencies
5. Prisma generate & migrate
6. Build backend + tests
7. Build frontend

**Triggers:**
- Push: `main`, `candidate/**`, `qa/**`, `extract/**`, `import/**`
- Pull Request: `main`

### 7.6 Проблемы инфраструктуры

#### 🔴 КРИТИЧНЫЕ

1. **Single Point of Failure**
   - Проблема: Один VPS для всего
   - Риск: Downtime при падении сервера
   - Решение: Load balancer + multiple instances

2. **No Redis/Memory Store**
   - Проблема: Нет кэша, сессий, очередей
   - Решение: Добавить Redis service

#### 🟡 ВАЖНЫЕ

3. **No Queue System**
   - Проблема: Cron вместо очередей задач
   - Решение: BullMQ + Redis

4. **Limited Monitoring**
   - Проблема: Basic healthchecks только
   - Решение: Prometheus + Grafana

5. **No Backup Strategy**
   - Проблема: Нет automated backups
   - Решение: pg_dump cron + S3

---

## 8. СКРИПТЫ И АВТОМАТИЗАЦИЯ

### 8.1 Скрипты миграции данных

| Скрипт | Назначение |
|-------|-----------|
| `backfill_inventory_normalization.ts` | Нормализация инвентаря |
| `backfill_partner_roles_codes_showcases.ts` | Партнерские роли |
| `backfill_partner_admin_groups.ts` | Админ группы партнеров |
| `backfill_telegram_identity.ts` | Telegram identity |
| `cleanup_external_hidden_listings.ts` | Очистка скрытых листингов |
| `migrate_inventory.ts` | Миграция инвентаря |
| `migrate_leads.ts` | Миграция лидов |
| `reconcile_media.ts` | Сверка медиа |
| `telegram_normalize_chat_ids.ts` | Нормализация chatId |
| `seed_definitions.ts` | Seed определений |
| `sync_bot_presets.ts` | Синхронизация пресетов |

### 8.2 Smoke тесты

| Скрипт | Назначение |
|-------|-----------|
| `smoke.sh` | Общий smoke test |
| `smoke_read.sh` | Read operations test |
| `smoke_write.sh` | Write operations test |
| `verify-deployment.sh` | Verification после deploy |

### 8.3 Verification скрипты

| Скрипт | Назначение |
|-------|-----------|
| `check_showcase.sh` | Проверка витрин |
| `routes_smoke_test.sh` | Тест маршрутов |
| `smoke_test_basic.sh` | Базовый тест |
| `verify_csv.py` | CSV валидация |
| `verify_miniapp.py` | MiniApp валидация |

### 8.4 SQL скрипты

| Файл | Назначение |
|-----|-----------|
| `fix.sql` | Hotfixes |
| `cleanup_demo_data.sql` | Очистка демо данных |

---

## 9. ДОКУМЕНТАЦИЯ

### 9.1 Основная документация

| Файл | Описание |
|-----|----------|
| `docs/ARCHITECTURE.md` | Архитектура платформы |
| `docs/README.md` | Общее описание |
| `docs/REFERENCE.md` | Справочник API |
| `docs/BACKLOG_NEXT.md` | Бэклог |
| `docs/BEST_PRACTICES_MATRIX.md` | Best practices |

### 9.2 Аудит отчеты

| Файл | Описание |
|-----|----------|
| `docs/audit/01-DISCOVERY.md` | Discovery фаза |
| `docs/audit/02-PERFORMANCE.md` | Performance анализ |
| `docs/audit/03-INTEGRATIONS.md` | Интеграции |
| `docs/audit/04-CODE-QUALITY.md` | Качество кода |
| `docs/audit/05-ARCHITECTURE.md` | Архитектура |
| `docs/audit/06-SECURITY.md` | Безопасность |
| `docs/audit/07-DEPLOYMENT.md` | Deployment |
| `docs/audit/08-10-FINAL-SUMMARY.md` | Итоговый отчет |

### 9.3 Планы и чеклисты

| Файл | Описание |
|-----|----------|
| `docs/PLAN.md` | Основной план |
| `docs/TEST_PLAN.md` | План тестирования |
| `docs/RELEASE_BLUEPRINT.md` | План релиза |
| `docs/RELEASE_QA_CHECKLIST.md` | QA чеклист |
| `docs/SMOKE_TESTS.md` | Smoke тесты |

### 9.4 Отчеты по этапам

| Файл | Описание |
|-----|----------|
| `docs/PHASE-A-INVENTORY.md` | Phase A инвентаризация |
| `docs/PHASE-B-FLOWS.md` | Phase B flow'ы |
| `docs/STAGE_2_REPORT.md` | Stage 2 отчет |
| `docs/STAGE_3_REPORT.md` | Stage 3 отчет |

### 9.5 Проблемы документации

#### 🟡 ВАЖНЫЕ

1. **Избыточная документация**
   - Проблема: 112+ MD файлов, сложно найти нужное
   - Решение: Консолидировать, добавить навигацию

2. **Устаревшие файлы**
   - Проблема: Некоторые отчеты дублируются
   - Решение: Archive old reports

---

## 10. ТЕСТИРОВАНИЕ

### 10.1 Статистика тестов

| Метрика | Значение |
|---------|----------|
| Тестовых файлов | 47 |
| Test coverage | Не измеряется явно |
| Фреймворк | Vitest |
| API тесты | Supertest |

### 10.2 Тестируемые сервисы

| Сервис | Тест файл | Строк теста |
|-------|----------|-------------|
| `b2bRegistration.service.ts` | `b2bRegistration.service.test.ts` | 2,452 |
| `b2bRouting.service.ts` | `b2bRouting.service.test.ts` | 5,455 |
| `b2bWhitelist.service.ts` | `b2bWhitelist.service.test.ts` | 3,743 |
| `carCardRenderer.v2.ts` | `carCardRenderer.v2.test.ts` | 1,760 |
| `cardRenderer.ts` | `cardRenderer.test.ts` | 3,894 |
| `channel-ingestion.service.ts` | `channel-ingestion.service.test.ts` | 2,057 |
| `normalization.service.ts` | `normalization.service.test.ts` | 1,291 |
| `parser.ts` | `parser.test.ts` | 579 |
| `publicId.service.ts` | `publicId.service.test.ts` | 627 |
| `quota.service.ts` | `quota.service.test.ts` | 1,353 |
| `requestContract.service.ts` | `requestContract.service.test.ts` | 6,107 |
| `templatePreset.service.ts` | `templatePreset.service.test.ts` | 1,344 |

### 10.3 Проблемы тестирования

#### 🔴 КРИТИЧНЫЕ

1. **Низкое покрытие тестами**
   - Проблема: 47 тестов на 439 файлов (~10%)
   - Риск: Regression bugs
   - Решение: Target 70%+ coverage

2. **Нет E2E тестов**
   - Проблема: Только unit/integration тесты
   - Решение: Playwright/Cypress для critical paths

#### 🟡 ВАЖНЫЕ

3. **Нет CI coverage reporting**
   - Проблема: Не отслеживается coverage trend
   - Решение: Add coverage reporter to CI

4. **Моки для внешних сервисов**
   - Проблема: Telegram, MTProto не мокаются полностью
   - Решение: Better mock strategies

---

## 11. БЕЗОПАСНОСТЬ

### 11.1 Текущие меры безопасности

| Мера | Статус |
|-----|--------|
| JWT аутентификация | ✅ Реализовано |
| HTTPS (Caddy) | ✅ Auto TLS |
| Environment variables | ✅ `.env` files |
| Input validation (Zod) | ✅ Частично |
| CORS | ✅ Настроено |
| Rate limiting | ⚠️ Базовое |
| SQL Injection protection | ✅ Prisma ORM |
| XSS protection | ⚠️ DOMPurify на фронтенде |

### 11.2 Проблемы безопасности

#### 🔴 КРИТИЧНЫЕ

1. **Secrets в `.env` файле**
   - Файл: `env/prod.env`
   - Проблема: Пароли в plain text
   - Решение: HashiCorp Vault / AWS Secrets Manager

2. **Отсутствие 2FA**
   - Проблема: Только password auth
   - Решение: TOTP/SMS 2FA

3. **JWT секреты в CI**
   - Файл: `.github/workflows/ci.yml`
   - Проблема: `JWT_SECRET: ci_dummy_jwt_secret`
   - Решение: GitHub Secrets

#### 🟡 ВАЖНЫЕ

4. **Rate Limiting**
   - Проблема: Базовая реализация
   - Решение: Redis-based rate limiting

5. **Audit Logging**
   - Проблема: Нет полного audit trail
   - Решение: Dedicated audit log table

6. **Input Sanitization**
   - Проблема: Не все inputs санизируются
   - Решение: Central sanitization middleware

---

## 12. ПРОБЛЕМЫ И РЕКОМЕНДАЦИИ

### 12.1 Сводная таблица проблем

| ID | Категория | Приоритет | Описание | Оценка усилий |
|----|-----------|-----------|----------|---------------|
| P1 | Backend | 🔴 Critical | In-Memory MTProto сессии | 2-3 дня |
| P2 | Backend | 🔴 Critical | Нет идемпотентности вебхуков | 1 день |
| P3 | Backend | 🔴 Critical | Mixed responsibility в роутах | 3-5 дней |
| P4 | Frontend | 🔴 Critical | App.tsx 9K строк | 3-4 дня |
| P5 | Frontend | 🔴 Critical | Layout.tsx 18K строк | 4-5 дней |
| P6 | Database | 🔴 Critical | Dual Schema Legacy+v4.1 | 5-7 дней |
| P7 | Infra | 🔴 Critical | Single Point of Failure | 2-3 дня |
| P8 | Testing | 🔴 Critical | Низкое покрытие тестами | Постоянно |
| P9 | Security | 🔴 Critical | Secrets в .env | 1-2 дня |
| P10 | Backend | 🟡 High | Feature Flags в prod | 1 день |
| P11 | Backend | 🟡 High | TODO comments | 1 день |
| P12 | Backend | 🟡 High | Logger level для MTProto | 0.5 дня |
| P13 | Infra | 🟡 High | No Redis/Queue | 2-3 дня |
| P14 | Frontend | 🟡 High | Переводы в одном файле | 2-3 дня |
| P15 | Database | 🟡 High | JSONB без схемы | 2-3 дня |
| P16 | Testing | 🟡 High | Нет E2E тестов | 3-5 дней |
| P17 | Security | 🟡 High | Нет 2FA | 2-3 дня |
| P18 | Backend | 🟢 Medium | TypeScript `any` usage | Постоянно |
| P19 | Frontend | 🟢 Medium | Нет Storybook | 1-2 дня |
| P20 | Frontend | 🟢 Medium | Нет code splitting | 1 день |
| P21 | Infra | 🟢 Medium | Limited monitoring | 2-3 дня |
| P22 | Infra | 🟢 Medium | No backup strategy | 1 день |
| P23 | Docs | 🟢 Medium | Избыточная документация | 2-3 дня |

### 12.2 Рекомендации по приоритетам

**Неделя 1-2 (Critical):**
1. Исправить MTProto session persistence
2. Добавить идемпотентность вебхуков
3. Вынести бизнес-логику из роутов
4. Refactor App.tsx и Layout.tsx

**Неделя 3-4 (High):**
5. Завершить миграцию с Legacy на v4.1
6. Добавить Redis и очереди задач
7. Увеличить coverage тестов до 50%
8. Настроить proper secrets management

**Месяц 2 (Medium):**
9. Добавить 2FA аутентификацию
10. Внедрить Storybook
11. Настроить мониторинг (Prometheus/Grafana)
12. Автоматические backup'ы

---

## 13. ПЛАН ДЕЙСТВИЙ

### 13.1 Фаза 1: Стабилизация (2 недели)

**Цель:** Устранить критические риски

| Задача | Ответственный | Срок | Статус |
|-------|--------------|------|--------|
| MTProto Connection Manager | Backend | Week 1 | ⏳ Pending |
| Webhook Idempotency | Backend | Week 1 | ⏳ Pending |
| Route Refactoring | Backend | Week 1-2 | ⏳ Pending |
| Component Split | Frontend | Week 2 | ⏳ Pending |

### 13.2 Фаза 2: Улучшение качества (3 недели)

**Цель:** Повысить maintainability

| Задача | Ответственный | Срок | Статус |
|-------|--------------|------|--------|
| Legacy Migration | Backend | Week 3-4 | ⏳ Pending |
| Test Coverage 50% | All | Week 3-5 | ⏳ Pending |
| Redis Integration | Infra | Week 4 | ⏳ Pending |
| Secrets Management | Infra | Week 4 | ⏳ Pending |

### 13.3 Фаза 3: Production Ready (3 недели)

**Цель:** Подготовка к scale

| Задача | Ответственный | Срок | Статус |
|-------|--------------|------|--------|
| 2FA Implementation | Backend | Week 6 | ⏳ Pending |
| Monitoring Setup | Infra | Week 6-7 | ⏳ Pending |
| E2E Tests | QA | Week 7-8 | ⏳ Pending |
| Documentation Cleanup | All | Week 8 | ⏳ Pending |

---

## 14. ЗАКЛЮЧЕНИЕ

### 14.1 Общая оценка

| Категория | Оценка | Комментарий |
|-----------|--------|-------------|
| **Архитектура** | 7/10 | Модульная, но есть technical debt |
| **Код** | 6/10 | Хорошее качество, но большие файлы |
| **Тесты** | 4/10 | Недостаточное покрытие |
| **Безопасность** | 6/10 | Базовая защита, нужны улучшения |
| **Инфраструктура** | 6/10 | Работает, но нет redundancy |
| **Документация** | 8/10 | Подробная, но избыточная |
| **Производительность** | 7/10 | Good, нужен кэш |

**Общая оценка:** 6.3/10 — **Production-ready с замечаниями**

### 14.2 Сильные стороны

✅ Современный технологический стек (React 19, TS 5.x, Node 22)  
✅ Модульная архитектура бэкенда  
✅ Подробная документация  
✅ Working CI/CD pipeline  
✅ Telegram интеграция (Bot + MTProto)  
✅ Multi-tenancy поддержка  
✅ Prisma ORM для type-safe DB access

### 14.3 Слабые стороны

❌ Критические architectural issues (in-memory sessions)  
❌ Огромные файлы компонетов (9K-18K строк)  
❌ Низкое покрытие тестами (~10%)  
❌ Dual schema confusion  
❌ Single point of failure  
❌ Missing security features (2FA, audit logs)

### 14.4 Итоговая рекомендация

**Проект готов к production использованию**, но требует немедленного устранения критических проблем (P1-P9) в течение ближайших 2-4 недель для обеспечения стабильности и безопасности.

**Приоритетные действия:**
1. Исправить MTProto session persistence
2. Добавить webhook idempotency
3. Refactor крупных компонентов
4. Увеличить test coverage
5. Настроить proper secrets management

---

**Аудит завершен:** 2026-05-05  
**Следующий аудит рекомендован:** 2026-06-05 (после исправлений)
