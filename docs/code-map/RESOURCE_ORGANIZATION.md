# Resource Organization

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

## Decisions

| Path | Class | Decision | Note |
| --- | --- | --- | --- |
| `_archive` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_150603` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_150614` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260410_152017_miniapp_preview` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260411_005957` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_codex_release_backup_20260430_114227_miniapp_live_patch` | historical_archive | archive_or_move_after_review | Historical snapshots; keep out of active architecture graph. |
| `_logs` | runtime_logs | rotate | Application and deployment logs; rotate, do not use as source. |
| `.agent` | agent_tooling | keep | Local agent rules, workflows, and operational memory. |
| `.deploy` | deployment_state | preserve_until_owner_retention_policy | Deployment artifacts, rollback evidence, and env-key manifests; protected by default. |
| `.dockerignore` | project_metadata | keep | Project ignore metadata; keep. |
| `.env` | secret_bearing | preserve_private | Secret-bearing config; inventory path only, never content. |
| `.env.example` | env_template | keep | Public environment template; keep scrubbed and versionable. |
| `.git` | git_metadata | keep | Repository metadata; never clean manually. |
| `.github` | ci_metadata | keep | Repository automation metadata. |
| `.gitignore` | project_metadata | keep | Project ignore metadata; keep. |
| `apps` | active_source | keep | Core server and web apps. |
| `ARCHITECTURE_MIGRATION.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `ARCHITECTURE.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `CODEX_AUDIT_REPORT.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `data` | runtime_data_do_not_delete | preserve_with_backups | Postgres and imported/runtime data volumes. |
| `deploy_output.log` | runtime_logs | rotate | Deployment log; rotate or archive with release evidence. |
| `DEPLOYMENT.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `docs` | documentation_mixed | reconcile_then_keep_or_archive | Current docs plus older audit/release notes; now has generated map and project knowledge. |
| `env` | secret_bearing_dir | preserve_private | Environment config directory; path-only inventory, no value inspection. |
| `FINAL_PRE_LAUNCH_AUDIT_PLAN.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `FINAL_SUMMARY.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `FINAL_TELEGRAM_MINIAPP_AUDIT.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `FIX_PLAN.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `fix.sql` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `FULL_AUDIT_REPORT.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `IMPLEMENTATION_PLAN_AUDIT.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `incident-response.md` | misc_review | review | Needs owner/classification if it grows or becomes active. |
| `infra` | active_infra | keep | Dockerfiles, compose, Caddy/nginx-adjacent runtime config. |
| `MODULE_MAP.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `NERD-METHOD_СarTie_SalesDrive_Meta_Roadmap_.pdf` | product_doc_artifact | keep | Product/business documentation artifact. |
| `node_modules` | generated_dependencies | reinstallable | Reinstallable dependencies. |
| `PATCH_PLAN.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `README.md` | current_doc | keep | Primary project overview; keep near root. |
| `RELEASE_BLOCKERS.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `RELEASE_BLUEPRINT.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `RELEASE_QA_CHECKLIST.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `scripts` | ops_tooling | keep | Operational scripts, smoke checks, deploy helpers, inspection generators. |
| `SMOKE_TESTS.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `stage2-m1-sources-destinations.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m2-import-by-date.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m3-ingestion-unification.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m4-media-mvp.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m5-miniapp-portal.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `stage2-m6-content-calendar.md` | historical_doc | archive_or_move_after_review | Stage 2 planning/release note; review before trusting as current. |
| `storage` | runtime_media_do_not_delete | preserve_with_backups | Uploaded/imported media and Telegram media storage. |
| `SUMMARY.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `TELEGRAM_MINIAPP_DEEP_AUDIT.md` | historical_doc | archive_or_move_after_review | Top-level historical report; review before trusting as current. |
| `TEST_CHECKLIST.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `TEST_PLAN.md` | operational_doc_review | reconcile_then_keep_or_archive | Operational or architecture note; reconcile with generated map before using. |
| `type_coverage_baseline.json` | misc_review | review | Needs owner/classification if it grows or becomes active. |
| `verification` | misc_review | review | Needs owner/classification if it grows or becomes active. |
| `verify_b2b.ts` | misc_review | review | Needs owner/classification if it grows or becomes active. |
| `verify_bot_create.js` | misc_review | review | Needs owner/classification if it grows or becomes active. |

## Cleanup rule

Protected by default: active source, runtime data/media/logs, deployment state, secret-bearing paths, git metadata, and rollback/evidence directories.

Only delete after all four are true: classification is not protected, an archive exists outside the working path, a restore path is known, and Cartie smoke checks still pass after removal.
