# 40 SCRIPT AUDIT

Дата обновления: **2026-02-19**  
Критерии: import/path актуальность, target env безопасность, идемпотентность, требуемые env/secrets, blast radius, соответствие текущим роутам/моделям.

## 1) Canonical status matrix

Status matrix перенесена в единый manifest:
- `scripts/script_status_manifest.json`

Автопроверка:
- `scripts/audit_scripts.sh`
- `scripts/audit_scripts.mjs`

Локальный результат (2026-02-19):
- `OK`: **25**
- `Deprecated`: **10**
- `Needs Fix`: **0**

Evidence:
- запуск `bash scripts/audit_scripts.sh` (pass)
- `docs/audit/release-20260218T152454Z/artifacts/script_audit_run_2026-02-19.txt`
- `docs/audit/release-20260218T152454Z/artifacts/media_reconcile_execute_2026-02-19.json`
- `docs/audit/release-20260218T152454Z/artifacts/media_reconcile_post_2026-02-19.json`

## 2) Script policy to release

- `OK`: активные скрипты, проходят syntax/static validation.
- `Deprecated`: frozen-скрипты, не входят в активный release contour.
- `Needs Fix`: запрещённый статус (должен быть 0 перед релизом).

## 3) CI integration

В CI (`.github/workflows/ci.yml`) добавлены:
- `Script Status Audit` -> `bash scripts/audit_scripts.sh`
- `Route Registry Smoke` -> `npx tsx scripts/verify_routes.ts`

Это закрывает script smoke-контур на каждом push/PR.

## 4) Deprecation decisions (P1-3)

В `Deprecated` переведены и защищены guard’ами (`ALLOW_DEPRECATED=1`):
- `apps/server/scripts/migrate_inventory.ts`
- `apps/server/scripts/migrate_leads.ts`
- `apps/server/scripts/patch_nav_leads.ts`
- `apps/server/scripts/test_parser.ts`
- `apps/server/scripts/test_parsing_service.ts`
- `apps/server/scripts/update_enum.ts`
- `apps/server/src/scripts/mtproto_qa.ts`
- `verification/verify_csv.py`
- `verification/verify_miniapp.py`
- `scripts/cleanup_demo_data.sql` (manual SQL one-off)

## 5) Additional hardening completed

- `apps/server/src/scripts/cleanupScenarios.ts`: destructive режим теперь только через `--execute` (default dry-run).
- `infra/monitor.sh`: strict mode + lock + restart cooldown + controlled health wait.
