# 60 DATA CONTENT AUDIT (`data`, `storage`, `_logs`)

Дата: **2026-02-19**  
Режим: full-content runtime audit

## 1) `data` (Postgres data path)

### Объем и структура
- Размер: **73M**
- Файлы: **1779**
- Основной контент: `data/cartie2/postgres/*` (WAL + base files)

Источник: `docs/audit/release-20260218T152454Z/artifacts/folder_metrics_src.tsv`.

### DB integrity (факт)
- Базовые количества:
  - `workspace_count=3`, `global_user_count=11`
  - `bot_count=1`, `lead_count=64`, `request_count=19`, `variant_count=39`, `car_count=66`
- Orphans:
  - `orphan_car_company=1`
  - остальные ключевые orphan checks = `0`
- job status:
  - `import_job_status`: FAILED=3, DONE=1
  - `parsing_job_status`: FAILED=3, DONE=1

Источник: `docs/audit/release-20260218T152454Z/artifacts/db_audit.txt`.

### Точечная проблема
- Выявлен 1 orphan car (без `companyId/workspace` связи):
  - `CarListing.id=inv_1769065400923`, `companyId=NULL`, `source=INTERNAL`

Рекомендация:
- добавить DB-level или app-level invariant для `CarListing.companyId` в write path,
- добавить periodic orphan cleanup report в release health checks.

## 2) `storage` (media)

### Объем и структура
- Основной путь: `storage/media/...`

### Media integrity
- До reconcile:
  - `dbRefs=2499`
  - `fsFiles=2495`
  - `missingRefs=7`
  - `orphanFiles=3`
  - `criticalMissingRefs=7`
  - `criticalOrphanFiles=2`
- Execute reconcile (`--execute --clear-missing-refs --delete-orphans`):
  - очищено `7` битых ссылок в `CarListing`
  - удалено `2` orphan файла
- После reconcile (dry-run):
  - `dbRefs=2492`
  - `fsFiles=2493`
  - `missingRefs=0`
  - `orphanFiles=1` (`_smoke/ping.txt`, non-critical)
  - `criticalMissingRefs=0`
  - `criticalOrphanFiles=0`

Источники:
- `docs/audit/release-20260218T152454Z/artifacts/media_reconcile_execute_2026-02-19.json`
- `docs/audit/release-20260218T152454Z/artifacts/media_reconcile_post_2026-02-19.json`

### Вывод
- Критичный media drift закрыт.
- Reconcile-job внедрён (`apps/server/scripts/reconcile_media.ts`) и может запускаться регулярно.
- Остался один non-critical служебный orphan (`_smoke/ping.txt`).

## 3) `_logs` (incidents, secrets, PII)

### Объем и структура
- Размер: **20M**
- Файлы: **64**
- Главные runtime файлы:
  - `_logs/infra2_api_current.log` (~19M)
  - `_logs/infra2_web_current.log` (~1M)

### Incident patterns
По web log (`level=error`) доминируют reverse-proxy ошибки во время рестартов/недоступности API:
- `dial tcp: lookup api: i/o timeout` — 422
- `connect: connection refused` — 108
- `server misbehaving (DNS)` — 33

Источник: `docs/audit/release-20260218T152454Z/artifacts/web_error_message_counts.txt`.

На дату аудита (**2026-02-18**):
- API errors: 0
- WEB errors: 2 (короткое окно рестарта)

Источники:
- `docs/audit/release-20260218T152454Z/artifacts/api_errors_2026-02-18.txt`
- `docs/audit/release-20260218T152454Z/artifacts/web_errors_2026-02-18.txt`

### Secret/PII
- В runtime web логах встречается `Authorization`, но значение маскировано как `REDACTED`.
- Явных bearer/jwt leak строк по быстрым сигнатурам не найдено.
- Логи содержат IP/UA метаданные (операционный PII риск низкий/средний, зависит от retention).

## 4) Retention и governance

### Текущие gaps
1. Нет формального retention SLA для `_logs`.
2. Нет автоматического media reconciliation.
3. Нет регулярного отчета по orphan/mismatch в DB/media.
4. Нет отдельного operational dashboard по reverse-proxy incident rates.

### Рекомендованные политики
- `_logs`:
  - ротация по размеру и сроку (например 14/30 дней),
  - выделение runtime/error логов отдельно от исторических tree-dump артефактов.
- `storage/media`:
  - weekly reconcile: `missing refs`, `orphan files`, дельта по росту.
- `data/postgres`:
  - backup + restore test cadence,
  - регулярный check vacuum/analyze + WAL growth review.

## 5) Статус к релизу
- Data path: в целом работоспособен, но есть один orphan и job failure history.
- Storage path: критичные mismatch закрыты, reconcile policy реализована.
- Logs: инциденты трассируются, но нужна формализация retention и incident SLO.
