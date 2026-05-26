# Directory Map

Generated: 2026-05-26T15:50:52.636Z
Root: `/srv/cartie`
Git: `360d414`

## `/srv` resources

| Path | Type | Size | Class | Action note |
| --- | --- | --- | --- | --- |
| `/srv/_quarantine` | dir | 4.0K | quarantine | Temporary holding area; should usually stay empty after archive/export/delete. |
| `/srv/audit-artifacts` | dir | 676K | audit_evidence | Server and project audit outputs. |
| `/srv/backups` | dir | 6.1G | backup_retention | Large backup area; prune only with explicit retention policy. |
| `/srv/cartie` | dir | 2.3G | active_product_workspace | Primary workspace for the Cartie product. |
| `/srv/cleanup-artifacts` | dir | 1.4G | cleanup_evidence | Cleanup archives, manifests, and transfer evidence. |

## `/srv/cartie` top-level resources

| Path | Type | Size | Class | Action note |
| --- | --- | --- | --- | --- |
| `_archive` | dir | 120K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_150603` | dir | 4.0K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_150614` | dir | 672K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_152017_miniapp_preview` | dir | 140K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260411_005957` | dir | 452K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260430_114227_miniapp_live_patch` | dir | 100K | historical_archive | Historical snapshots; keep out of active architecture graph. |
| `_logs` | dir | 134M | runtime_logs | Application and deployment logs; rotate, do not use as source. |
| `.agent` | dir | 2.3M | agent_tooling | Local agent rules, workflows, and operational memory. |
| `.deploy` | dir | 13M | deployment_state | Deployment artifacts, rollback evidence, and env-key manifests; protected by default. |
| `.dockerignore` | file | 4.0K | project_metadata | Project ignore metadata; keep. |
| `.env` | file | 4.0K | secret_bearing | Secret-bearing config; inventory path only, never content. |
| `.env.example` | file | 4.0K | env_template | Public environment template; keep scrubbed and versionable. |
| `.git` | dir | 29M | git_metadata | Repository metadata; never clean manually. |
| `.github` | dir | 12K | ci_metadata | Repository automation metadata. |
| `.gitignore` | file | 4.0K | project_metadata | Project ignore metadata; keep. |
| `apps` | dir | 555M | active_source | Core server and web apps. |
| `ARCHITECTURE_MIGRATION.md` | file | 8.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `ARCHITECTURE.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `CODEX_AUDIT_REPORT.md` | file | 24K | historical_doc | Top-level historical report; review before trusting as current. |
| `data` | dir | 89M | runtime_data_do_not_delete | Postgres and imported/runtime data volumes. |
| `deploy_output.log` | file | 32K | runtime_logs | Deployment log; rotate or archive with release evidence. |
| `DEPLOYMENT.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `docs` | dir | 12M | documentation_mixed | Current docs plus older audit/release notes; now has generated map and project knowledge. |
| `env` | dir | 8.0K | secret_bearing_dir | Environment config directory; path-only inventory, no value inspection. |
| `FINAL_PRE_LAUNCH_AUDIT_PLAN.md` | file | 36K | historical_doc | Top-level historical report; review before trusting as current. |
| `FINAL_SUMMARY.md` | file | 4.0K | historical_doc | Top-level historical report; review before trusting as current. |
| `FINAL_TELEGRAM_MINIAPP_AUDIT.md` | file | 40K | historical_doc | Top-level historical report; review before trusting as current. |
| `FIX_PLAN.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `fix.sql` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `FULL_AUDIT_REPORT.md` | file | 48K | historical_doc | Top-level historical report; review before trusting as current. |
| `IMPLEMENTATION_PLAN_AUDIT.md` | file | 24K | historical_doc | Top-level historical report; review before trusting as current. |
| `incident-response.md` | file | 4.0K | misc_review | Needs owner/classification if it grows or becomes active. |
| `infra` | dir | 92K | active_infra | Dockerfiles, compose, Caddy/nginx-adjacent runtime config. |
| `MODULE_MAP.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `NERD-METHOD_СarTie_SalesDrive_Meta_Roadmap_.pdf` | file | 72K | product_doc_artifact | Product/business documentation artifact. |
| `node_modules` | dir | 20K | generated_dependencies | Reinstallable dependencies. |
| `PATCH_PLAN.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `README.md` | file | 8.0K | current_doc | Primary project overview; keep near root. |
| `RELEASE_BLOCKERS.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `RELEASE_BLUEPRINT.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `RELEASE_QA_CHECKLIST.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `scripts` | dir | 112K | ops_tooling | Operational scripts, smoke checks, deploy helpers, inspection generators. |
| `SMOKE_TESTS.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `stage2-m1-sources-destinations.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m2-import-by-date.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m3-ingestion-unification.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m4-media-mvp.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m5-miniapp-portal.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m6-content-calendar.md` | file | 4.0K | historical_doc | Stage 2 planning/release note; review before trusting as current. |
| `storage` | dir | 1.5G | runtime_media_do_not_delete | Uploaded/imported media and Telegram media storage. |
| `SUMMARY.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `TELEGRAM_MINIAPP_DEEP_AUDIT.md` | file | 36K | historical_doc | Top-level historical report; review before trusting as current. |
| `TEST_CHECKLIST.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `TEST_PLAN.md` | file | 4.0K | operational_doc_review | Operational or architecture note; reconcile with generated map before using. |
| `type_coverage_baseline.json` | file | 128K | misc_review | Needs owner/classification if it grows or becomes active. |
| `verification` | dir | 424K | misc_review | Needs owner/classification if it grows or becomes active. |
| `verify_b2b.ts` | file | 4.0K | misc_review | Needs owner/classification if it grows or becomes active. |
| `verify_bot_create.js` | file | 4.0K | misc_review | Needs owner/classification if it grows or becomes active. |

## Active inventory file counts

| Top | Files |
| --- | --- |
| `apps` | 582 |
| `docs` | 273 |
| `.agent` | 206 |
| `infra` | 15 |
| `scripts` | 11 |
| `verification` | 6 |
| `.dockerignore` | 1 |
| `.env` | 1 |
| `.env.example` | 1 |
| `.github` | 1 |
| `.gitignore` | 1 |
| `ARCHITECTURE_MIGRATION.md` | 1 |
| `ARCHITECTURE.md` | 1 |
| `CODEX_AUDIT_REPORT.md` | 1 |
| `deploy_output.log` | 1 |
| `DEPLOYMENT.md` | 1 |
| `env` | 1 |
| `FINAL_PRE_LAUNCH_AUDIT_PLAN.md` | 1 |
| `FINAL_SUMMARY.md` | 1 |
| `FINAL_TELEGRAM_MINIAPP_AUDIT.md` | 1 |

Runtime folders (`data`, `storage`, `_logs`, `.deploy`) are classified, but excluded from the active code graph.
