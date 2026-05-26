# Documentation Digest

Generated: 2026-05-26T15:50:52.636Z
Root: `/srv/cartie`
Git: `360d414`

## Reading order

1. Generated `docs/code-map/*` and `docs/project-knowledge/*` for current workspace truth.
2. `README.md`, `docs/README.md`, and deploy runbooks for maintained instructions.
3. `docs/superpowers/plans/*` for recent planning trace.
4. `docs/audit/*`, top-level `FINAL_*`, and stage/release notes only as historical evidence.

## Known drift

- `docs/CANONICAL_DOCS_INDEX.md` still points at older Feb release audit material as source of truth; use generated docs plus runtime checks first.
- `docs/ARCHITECTURE.md` describes a small route count that no longer matches the current Express router surface.
- Older MiniApp docs mention `web_app_data`-style assumptions while current runtime is REST/initData-first.

## Existing docs corpus

| Path | Class | Title | Updated |
| --- | --- | --- | --- |
| `docs/deploy_runbook.md` | current_operational | Deploy Runbook — CarTié | 2026-02-24 |
| `docs/README.md` | current_operational | Cartie Documentation | 2026-05-05 |
| `README.md` | current_operational | CarTie Production Platform | 2026-05-05 |
| `docs/superpowers/plans/2026-05-06-cartie-miniapp-crm-meta-recovery-plan.md` | recent_planning_trace | CarTie MiniApp, Lead CRM, Meta, And Inventory Recovery Plan | 2026-05-18 |
| `docs/superpowers/plans/2026-05-06-cartie-miniapp-stabilization-implementation.md` | recent_planning_trace | CarTié MiniApp Stabilization Implementation Plan | 2026-05-06 |
| `docs/superpowers/plans/2026-05-06-cartie-platform-phase2-stabilization.md` | recent_planning_trace | CarTie Platform Phase 2 Stabilization Implementation Plan | 2026-05-06 |
| `docs/superpowers/plans/2026-05-12-cartie-miniapp-first-plan.md` | recent_planning_trace | CarTie MiniApp-First Recovery Plan | 2026-05-12 |
| `docs/superpowers/plans/2026-05-18-cartie-telegram-crm-salesdrive-tracking-plan.md` | recent_planning_trace | CarTie Telegram CRM Connector Stabilization Implementation Plan | 2026-05-18 |
| `docs/superpowers/specs/2026-05-06-cartie-miniapp-stabilization-design.md` | recent_planning_trace | CarTié MiniApp Stabilization Design | 2026-05-06 |
| `CODEX_AUDIT_REPORT.md` | top_level_historical_report | Cartie Platform Audit & Fix Plan (2025 Edition) | 2026-01-29 |
| `docs/audit_lead_b2b_upgrade_2026-02-23.md` | top_level_historical_report | Audit: Lead + B2B Bots & MiniApp Upgrade (2026-02-23) | 2026-02-23 |
| `docs/audit_telegram_bots_2026-02-23.md` | top_level_historical_report | Telegram Bots + MiniApp Audit (2026-02-23) | 2026-02-23 |
| `docs/audit_telegram_bots_recheck_2026-02-23.md` | top_level_historical_report | Telegram Bots + MiniApp Recheck Audit (2026-02-23) | 2026-02-23 |
| `docs/audit_v6_db_models.md` | top_level_historical_report | Database Models Audit (V6) | 2026-05-04 |
| `docs/audit_v6_miniapp_submission.md` | top_level_historical_report | MiniApp Submission Mechanism Audit (V6) | 2026-05-04 |
| `docs/audit_v6_telegram_ux.md` | top_level_historical_report | Telegram UX Audit (V6) | 2026-05-04 |
| `docs/audit_v7_db_gap.md` | top_level_historical_report | Аудит DB gap v7 (Prisma) | 2026-02-24 |
| `docs/audit_v7_miniapp.md` | top_level_historical_report | Аудит MiniApp v7 (Lead + B2B) | 2026-05-04 |
| `docs/audit_v7_telegram_ux.md` | top_level_historical_report | Аудит Telegram UX v7 (Cartié) | 2026-05-04 |
| `docs/AUDIT.md` | top_level_historical_report | Audit Report | 2026-01-23 |
| `docs/PHASE_H_REPORT.md` | top_level_historical_report | Phase H: Final Telegram-Ready Release Report | 2026-01-29 |
| `docs/PLAN-platform-audit.md` | top_level_historical_report | CARTIE PLATFORM AUDIT PLAN | 2026-01-27 |
| `docs/RELEASE_AUDIT_REPORT.md` | top_level_historical_report | RELEASE AUDIT REPORT (Frozen) | 2026-02-19 |
| `docs/STAGE_2_REPORT.md` | top_level_historical_report | Stage 2: Automation & Intelligence Report | 2026-01-29 |
| `docs/STAGE_3_REPORT.md` | top_level_historical_report | Stage 3: Production Hardening Report | 2026-01-29 |
| `docs/STAGE_3_VISUAL_MAPPER_REPORT.md` | top_level_historical_report | Stage 3: Interactive Visual Mapper Report | 2026-01-29 |
| `FINAL_PRE_LAUNCH_AUDIT_PLAN.md` | top_level_historical_report | 🚀 CARTIE PLATFORM: FINAL PRE-LAUNCH AUDIT & ACTION PLAN | 2026-05-05 |
| `FINAL_SUMMARY.md` | top_level_historical_report | Final Summary | 2026-01-28 |
| `FINAL_TELEGRAM_MINIAPP_AUDIT.md` | top_level_historical_report | 🚗 CarTié Platform — FINAL TELEGRAM & MINIAPP AUDIT REPORT | 2026-05-05 |
| `FULL_AUDIT_REPORT.md` | top_level_historical_report | ПОЛНЫЙ АУДИТ РЕПОЗИТОРИЯ CARTIE PLATFORM | 2026-05-05 |
| `IMPLEMENTATION_PLAN_AUDIT.md` | top_level_historical_report | 🚀 План внедрения исправлений CarTié Platform | 2026-05-05 |
| `TELEGRAM_MINIAPP_DEEP_AUDIT.md` | top_level_historical_report | Углубленный аудит Telegram & MiniApp модулей Cartie Platform | 2026-05-05 |
| `docs/audit/01-DISCOVERY.md` | historical_audit_or_release | PHASE 1: DISCOVERY & MAPPING | 2026-01-27 |
| `docs/audit/02-PERFORMANCE.md` | historical_audit_or_release | PHASE 2: PERFORMANCE ANALYSIS | 2026-01-27 |
| `docs/audit/03-INTEGRATIONS.md` | historical_audit_or_release | PHASE 3: INTEGRATION HEALTH | 2026-01-27 |
| `docs/audit/04-CODE-QUALITY.md` | historical_audit_or_release | PHASE 4: CODE QUALITY & TECHNICAL DEBT | 2026-01-27 |
| `docs/audit/05-ARCHITECTURE.md` | historical_audit_or_release | PHASE 5: ARCHITECTURE & DESIGN PATTERNS | 2026-01-27 |
| `docs/audit/06-SECURITY.md` | historical_audit_or_release | PHASE 6: SECURITY & COMPLIANCE | 2026-01-27 |
| `docs/audit/07-DEPLOYMENT.md` | historical_audit_or_release | PHASE 7: DEPLOYMENT & DEVOPS | 2026-01-27 |
| `docs/audit/08-10-FINAL-SUMMARY.md` | historical_audit_or_release | PHASES 8-10: FINAL AUDIT SUMMARY & ROADMAP | 2026-01-27 |
| `docs/audit/fix-stage1/01_RESULT_SUMMARY.md` | historical_audit_or_release | Result Summary: Stage-1 Fix & Ship | 2026-02-02 |
| `docs/audit/fix-stage1/02_P0-1_LEAD_IDENTITY_PROOF.md` | historical_audit_or_release | P0-1 Lead Identity Proof | 2026-02-02 |
| `docs/audit/fix-stage1/03_P0-3_CHANNEL_POST_PROOF.md` | historical_audit_or_release | P0-3 Dual Pipeline Proof | 2026-02-02 |
| `docs/audit/fix-stage1/04_P0-2_MTPROTO_PROOF.md` | historical_audit_or_release | P0-2 MTProto E2E Import Proof | 2026-02-02 |
| `docs/audit/fix-stage1/BASELINE.md` | historical_audit_or_release | BASELINE STATE | 2026-02-02 |
| `docs/audit/fix-stage1/PLAN.md` | historical_audit_or_release | Stage-1 Fix & Ship: Implementation Plan | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/00_SUMMARY.md` | historical_audit_or_release | Итоговый отчёт по аудиту системы CarTié | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/10_CHECKLIST.md` | historical_audit_or_release | Технический чеклист — Stage-1 + Stage-2 (M1-M4) | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/20_FINDINGS.md` | historical_audit_or_release | Findings — Ошибки и баги | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/30_FIXES_APPLIED.md` | historical_audit_or_release | Fixes Applied During Audit | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/FINAL_AUDIT_SUMMARY.md` | historical_audit_or_release | ═══════════════════════════════════════════════════════ | 2026-02-02 |
| `docs/audit/release-20260202T204238Z/IMPLEMENTATION_RESULTS.md` | historical_audit_or_release | Implementation Results — P0/P1/P2 Fixes | 2026-02-02 |
| `docs/audit/release-20260218T152454Z/00_MASTER_MAP.md` | historical_audit_or_release | 00 MASTER MAP — Cartie Release Audit | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/10_FOLDER_AUDIT.md` | historical_audit_or_release | 10 FOLDER AUDIT | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/110_MEGA_PROMPT_COMPLIANCE_MATRIX.md` | historical_audit_or_release | MEGA Prompt Compliance Matrix (Baseline → Target) | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/120_RUNBOOK_MEGA_PROMPT_ROLLOUT.md` | historical_audit_or_release | CarTié MEGA Prompt Runbook | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/130_QA_CHECKLIST_RESULTS.md` | historical_audit_or_release | QA Checklist Results (MEGA Prompt) | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/140_ADMIN_PARTNER_GUIDE.md` | historical_audit_or_release | Admin + Partner Guide (CarTié MEGA MVP) | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/20_MODULE_AUDIT_BACKEND.md` | historical_audit_or_release | 20 MODULE AUDIT — BACKEND | 2026-02-18 |
| `docs/audit/release-20260218T152454Z/30_MODULE_AUDIT_FRONTEND.md` | historical_audit_or_release | 30 MODULE AUDIT — FRONTEND | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/40_SCRIPT_AUDIT.md` | historical_audit_or_release | 40 SCRIPT AUDIT | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/50_DATA_FLOW_MAP.md` | historical_audit_or_release | 50 DATA FLOW MAP | 2026-02-18 |
| `docs/audit/release-20260218T152454Z/60_DATA_CONTENT_AUDIT.md` | historical_audit_or_release | 60 DATA CONTENT AUDIT (`data`, `storage`, `_logs`) | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/70_FINDINGS_AND_RECOMMENDATIONS.md` | historical_audit_or_release | 70 FINDINGS AND RECOMMENDATIONS | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/80_RELEASE_BACKLOG.md` | historical_audit_or_release | 80 RELEASE BACKLOG | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/90_RELEASE_GATES_AND_ROLLBACK.md` | historical_audit_or_release | 90 RELEASE GATES AND ROLLBACK | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/95_TELEGRAM_BOTS_READINESS.md` | historical_audit_or_release | 95 Telegram Bots Readiness | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/artifacts/api_v2_compatibility_matrix_2026-02-19.md` | historical_audit_or_release | API v2 Compatibility Matrix (2026-02-19) | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/artifacts/p0_closure_summary_2026-02-19.md` | historical_audit_or_release | P0 Closure Summary (2026-02-19) | 2026-02-19 |
| `docs/audit/release-20260218T152454Z/artifacts/release_cp0_baseline_2026-02-20.md` | historical_audit_or_release | CP0 Baseline Release (2026-02-20) | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/artifacts/release_cp5_implementation_2026-02-20.md` | historical_audit_or_release | CP5 Implementation Release (2026-02-20) | 2026-02-20 |
| `docs/audit/release-20260218T152454Z/artifacts/tenant_contract_matrix_2026-02-19.md` | historical_audit_or_release | Tenant Contract Matrix (2026-02-19) | 2026-02-19 |
| `docs/audit/server/2026-01-30/00_EXEC_SUMMARY.md` | historical_audit_or_release | CarTié Server Audit — Executive Summary (Stage-1 Readiness) | 2026-02-02 |
| `docs/audit/server/2026-01-30/10_TELEGRAM_BOTAPI_AUDIT.md` | historical_audit_or_release | Telegram Bot API — Detailed Audit (P0) | 2026-02-02 |
| `docs/audit/server/2026-01-30/20_MTPROTO_AUDIT.md` | historical_audit_or_release | MTProto — Detailed Audit (P0) | 2026-02-02 |
| `docs/audit/server/2026-01-30/30_CODE_STRUCTURE_AUDIT.md` | historical_audit_or_release | Code Structure Audit (P1) | 2026-02-02 |
| `docs/audit/server/2026-01-30/40_BACKLOG_STAGE1_PLAN.md` | historical_audit_or_release | Stage-1 Backlog Plan (Execution Roadmap) | 2026-02-02 |
| `docs/audit/server/2026-01-30/FINAL_SUMMARY.md` | historical_audit_or_release | CarTié Server Audit — FINAL SUMMARY ✅ | 2026-02-02 |
| `docs/audit/server/2026-01-30/P0-1_FIX_LEAD_IDENTITY.md` | historical_audit_or_release | P0-1 Fix: Lead TG Identity - COMPLETED ✅ | 2026-02-02 |
| `docs/audit/server/2026-01-30/P0-2_MTPROTO_STATUS.md` | historical_audit_or_release | P0-2: MTProto Channel Import - STATUS REPORT | 2026-02-02 |
| `docs/audit/server/2026-01-30/P0-3_FIX_DUAL_PIPELINE.md` | historical_audit_or_release | P0-3 Fix: Channel Post Dual Pipeline - COMPLETED ✅ | 2026-02-02 |
| `docs/stage2/00_STAGE2_EXEC_SUMMARY.md` | historical_audit_or_release | Stage 2: Telegram Productization & Scale - Executive Summary | 2026-02-02 |
| `docs/stage2/10_SOURCES_DESTINATIONS.md` | historical_audit_or_release | M1: Sources & Destinations Registry | 2026-02-02 |
| `docs/stage2/20_IMPORT_BY_DATE.md` | historical_audit_or_release | M2: Import by Date Range (MTProto) | 2026-02-02 |
| `docs/stage2/30_INGESTION_UNIFICATION.md` | historical_audit_or_release | M3: Ingestion Unification (Already Implemented ✅) | 2026-02-02 |
| `docs/stage2/30_MEDIA_MVP.md` | historical_audit_or_release | 30_MEDIA_MVP | 2026-02-02 |
| `docs/stage2/40_MEDIA_MVP.md` | historical_audit_or_release | M4: Media MVP | 2026-02-02 |
| `docs/stage2/40_MINIAPP_PORTAL.md` | historical_audit_or_release | 40_MINIAPP_PORTAL | 2026-02-02 |
| `docs/stage2/50_CONTENT_CALENDAR.md` | historical_audit_or_release | 50_CONTENT_CALENDAR | 2026-02-02 |
| `docs/stage2/50_MINIAPP_PORTAL.md` | historical_audit_or_release | M5: Mini App Portal (Already Implemented ✅) | 2026-02-02 |
| `docs/stage2/60_CONTENT_CALENDAR.md` | historical_audit_or_release | M6: Content & Calendar (Already Implemented ✅) | 2026-02-02 |
| `docs/stage2/60_LOGS_OBSERVABILITY.md` | historical_audit_or_release | 60_LOGS_OBSERVABILITY | 2026-02-02 |
| `docs/stage2/70_OBSERVABILITY.md` | historical_audit_or_release | M7: Observability (Already Implemented ✅) | 2026-02-02 |
| `apps/web/docs/DESIGN_SYSTEM.md` | current_or_unknown | CarTie Platform Design System | 2026-01-22 |
| `ARCHITECTURE_MIGRATION.md` | current_or_unknown | Architecture Migration Plan: Unifying to v4.1 Data Model | 2026-01-22 |
| `ARCHITECTURE.md` | current_or_unknown | Deprecated | 2026-01-22 |
| `DEPLOYMENT.md` | current_or_unknown | Deployment Guide | 2026-01-28 |
| `docs/ARCHITECTURE.md` | current_or_unknown | CARTIE PLATFORM ARCHITECTURE | 2026-02-16 |
| `docs/BACKLOG_NEXT.md` | current_or_unknown | BACKLOG NEXT (Frozen) | 2026-02-19 |
| `docs/BEST_PRACTICES_MATRIX.md` | current_or_unknown | Telegram Bot Best Practices — Matrix (Node/TS) | 2026-02-10 |
| `docs/CANONICAL_DOCS_INDEX.md` | current_or_unknown | Canonical Docs Index | 2026-02-19 |
| `docs/docs_analysis_CARTIE_PLATFORM_DETAILED_ANALYSIS_diff.md` | current_or_unknown | 🔍 ДЕТАЛЬНИЙ АНАЛІЗ ПЛАТФОРМИ CARTIE | 2026-05-06 |
| `docs/MODULES/COMMUNICATION.md` | current_or_unknown | Communication Module | 2026-02-06 |
| `docs/MODULES/CORE.md` | current_or_unknown | Core Module | 2026-01-22 |
| `docs/MODULES/FRONTEND.md` | current_or_unknown | Frontend Module | 2026-01-22 |
| `docs/MODULES/INTEGRATIONS.md` | current_or_unknown | Integrations Module | 2026-01-22 |
| `docs/MODULES/INVENTORY.md` | current_or_unknown | Inventory Module | 2026-01-22 |
| `docs/MODULES/SALES.md` | current_or_unknown | Sales Module | 2026-01-22 |
| `docs/ops_runbook_external_cleanup_join_requests_2026-02-23.md` | current_or_unknown | Ops Runbook: External Listings TTL + Join Request Fallback (2026-02-23) | 2026-02-23 |
| `docs/PHASE-A-INVENTORY.md` | current_or_unknown | Phase A: Telegram Reality Inventory & Risk Map | 2026-01-29 |
| `docs/PHASE-B-FLOWS.md` | current_or_unknown | Phase B: End-to-End TG Flow Definition | 2026-01-29 |
| `docs/plan_lead_b2b_upgrade_2026-02-23.md` | current_or_unknown | Plan: Lead + B2B Bots & MiniApp Upgrade (2026-02-23) | 2026-02-23 |
| `docs/plan_telegram_bots_2026-02-23.md` | current_or_unknown | Plan: Telegram Bots + MiniApp Stabilization (2026-02-23) | 2026-02-23 |
| `docs/plan_v6_impl.md` | current_or_unknown | CarTié V6 Implementation Plan | 2026-05-04 |
| `docs/plan_v7_impl.md` | current_or_unknown | План реалізації v7 (оновлено після аудиту) | 2026-05-04 |
| `docs/PLAN-stage-2.md` | current_or_unknown | Telegram Release Stage 2: Automation & Intelligence | 2026-01-29 |
| `docs/PLAN-stage-3.md` | current_or_unknown | Telegram Release Stage 3: Interactive Visual Mapper | 2026-01-29 |
| `docs/PLAN-telegram-ready.md` | current_or_unknown | Telegram-Ready Release (Stage 1) - Execution Plan | 2026-01-29 |
| `docs/PLAN.md` | current_or_unknown | Master Plan: Stage 2 - Telegram Productization & Scale | 2026-02-02 |
| `docs/qa_lead_b2b_upgrade_2026-02-23.md` | current_or_unknown | QA Checklist — Lead + B2B Bots & MiniApp Upgrade (2026-02-23) | 2026-02-23 |
