# 90 RELEASE GATES AND ROLLBACK

Дата: **2026-02-19**  
Релизное окно: **2026-03-03**  
Политика: breaking changes допустимы только при выполнении compatibility/deprecation плана.

## 1) Обязательные release gates (go/no-go)

### Gate G0. Scope Freeze
- Критерий:
  - утверждён список P0/P1/P2 (`80_RELEASE_BACKLOG.md`);
  - утверждены владельцы и даты.
- Артефакт: freeze record в релизной папке.

### Gate G1. Build & Unit Tests
- Критерий:
  - `apps/server` build = pass;
  - `apps/server` tests = pass;
  - `apps/web` build = pass.
- Факт baseline:
  - все три шага уже `exit 0` (`artifacts/server_build.exit`, `server_test.exit`, `web_build.exit`).

### Gate G2. Route/Contract Coverage
- Критерий:
  - 100% endpoint ownership (owner/auth/tenant/contract);
  - compatibility matrix для breaking endpoints;
  - `/api/v2` envelope задокументирован.
- Проверка:
  - route inventory vs owners list;
  - smoke на каждый endpoint класс (read/write/public/webhook).

### Gate G3. Script Reliability
- Критерий:
  - 100% скриптов имеют статус `OK` или `Deprecated`;
  - `Needs Fix = 0`;
  - строгие exit codes и env guards.
- Текущий статус:
  - `PASS` (матрица `OK=24`, `Deprecated=10`, `Needs Fix=0`);
  - evidence: `scripts/script_status_manifest.json`, `artifacts/script_audit_run_2026-02-19.txt`.

### Gate G4. Data Integrity
- Критерий:
  - orphan checks в пределах допустимых порогов;
  - media missing/orphan закрыты или формально mitigated;
  - import/parsing job failures разобраны.
- Текущий статус:
  - media drift `PASS` по critical: `criticalMissingRefs=0`, `criticalOrphanFiles=0`;
  - non-critical остаток: `_smoke/ping.txt` + исторический `orphan_car_company=1` (mitigated, не блокирует release gate).
  - evidence: `artifacts/media_reconcile_execute_2026-02-19.json`, `artifacts/media_reconcile_post_2026-02-19.json`.

### Gate G5. Security
- Критерий:
  - prod secret preflight strict-pass;
  - нет dev fallback в prod runtime;
  - auth/tenant matrix проверен на критичных потоках.

### Gate G6. E2E Critical Flows
- Критерий:
  - PASS по сценариям:
    - login
    - bot create
    - telegram webhook ingest
    - lead/request lifecycle
    - mtproto import
    - miniapp request
    - content publish

### Gate G7. Operational Readiness
- Критерий:
  - alerting/monitoring активны;
  - rollback rehearsal выполнен;
  - on-call runbook обновлён.

## 2) Итоговое правило go/no-go

- `GO`: все `P0` закрыты и `G0..G7 = PASS`.
- `NO-GO`: любой из `P0` открыт или хотя бы один gate в статусе fail.
- `CONDITIONAL GO`: только при formal sign-off на перенос части `P1/P2` в post-release с owner+дата.

## 3) Порядок миграции в релизном окне

1. **Preflight**:
   - проверить env/secrets policy;
   - сделать backup DB snapshot;
   - зафиксировать commit/tag release candidate.
2. **Schema/Data step**:
   - выполнить миграции Prisma;
   - применить безопасные data migration (idempotent batches).
3. **Backend deploy**:
   - rolling restart API;
   - health и route smoke.
4. **Frontend deploy**:
   - выкладка web + cache bust;
   - публичные страницы и miniapp smoke.
5. **Worker/scheduler enable**:
   - включить workers после проверки readiness DB.
6. **Post-deploy verify**:
   - script-based verify;
   - контроль логов на 5xx/critical errors.

## 4) Rollback plan (обязательный)

### Триггеры rollback
1. Рост 5xx выше порога в течение 10 минут после деплоя.
2. Невозможность пройти critical E2E flow.
3. Data corruption risk или массовые tenant/auth ошибки.

### Порядок rollback
1. Остановить новые write-heavy jobs/workers.
2. Вернуть предыдущий backend image/tag.
3. При необходимости вернуть предыдущий frontend artifact.
4. Если проблема в миграции данных:
   - выполнить заранее подготовленный down-path или restore из snapshot.
5. Выполнить post-rollback smoke:
   - auth/login
   - inventory read
   - request create/read
   - telegram webhook ack
6. Зафиксировать incident report и root-cause owner.

### Ограничения rollback
- Нельзя откатывать schema без подтверждённого data compatibility.
- Для необратимых миграций rollback = restore snapshot + replay допустимых событий.

## 5) Verify sequence (канонический)

1. `npm --prefix apps/server run build`
2. `npm --prefix apps/server test`
3. `npm --prefix apps/web run build`
4. `bash verification/routes_smoke_test.sh <WEB_URL> <API_URL>`
5. `bash verification/check_showcase.sh <SHOWCASE_URL> <SLUG>`
6. `bash scripts/smoke_read.sh`
7. `bash scripts/smoke_write.sh` (только в controlled env с `ENABLE_WRITE=1`)
8. Выборочно:
   - `npx tsx apps/server/scripts/check_telegram_health.ts`
   - `npx tsx apps/server/scripts/check_users.ts`

Примечание: текущие проблемные скрипты (`qa_smoke.ts`, `smoke_test_basic.sh`, и др.) должны быть исправлены до включения в обязательные gates.

## 6) Матрица ответственных в релизе

| Контур | Ответственный |
|---|---|
| Backend API/DB | Backend Lead |
| Frontend/Web/MiniApp | Frontend Lead |
| Infra/Deploy/Caddy | DevOps |
| QA/Smoke/E2E | QA Lead |
| Data integrity | Data Ops |
| Архитектурные решения и sign-off | Architecture Owner |

## 7) Вывод по readiness на дату аудита (2026-02-18)

- Уже PASS: базовые build/test gates (`G1` baseline).
- Не PASS: `G2`, `G3`, `G4`, `G5`, `G6`, `G7` (нужны закрытия P0/P1).
- Итог: на **2026-02-18** статус релиза = **NO-GO (ожидаемо до выполнения плана 18.02–03.03)**.
