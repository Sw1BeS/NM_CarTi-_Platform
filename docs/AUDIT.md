# Cartie Platform Audit Findings

> **Evidence-Based Audit** - Problems, Root Causes, Priority  
> **Date**: 2026-01-22  
> **Auditor**: Principal Engineer Review + Automated Analysis

---

## Executive Summary

**Total Issues Found**: 7 (4 P0, 2 P1, 1 P2)  
**Status**: Addressed via implementation plan  
**Next Action**: Execute phases 0.5-5 per approved plan

---

## P0 - Critical Blockers

### 1. Document Sprawl ✅ FIXED
**Severity**: P0  
**Impact**: Iteration slowdown, conflicting information  
**Evidence**:
```
17 plan/doc files in docs/:
API.md, ARCHITECTURE_DEEP_DIVE.md, DEPLOY-GUIDE.md, DEPLOY_LOG.md, EXECUTION_PLAN.md,
FILE_STRUCTURE.md, GAP_LIST.md, INVENTORY_MAP.md, KNOWLEDGE_BASE.md, MASTER_PLAN.md,
OPS.md, PLAN.md, RELIABILITY_PLAN.md, ROADMAP.md, SMOKE_TEST_CHECKLIST.md, UI_AUDIT.md, WALKTHROUGH.md
```
**Root Cause**: No documentation governance, AI agents creating new files per iteration  
**Fix**: Consolidated to 6 canonical docs + MODULES/, archived old docs to `_archive/2026-01-22_pre-audit/`

### 2. No Smoke Harness ✅ FIXED
**Severity**: P0  
**Impact**: High regression risk during backend refactor  
**Evidence**: No `scripts/smoke.sh` or automated critical endpoint tests existed  
**Root Cause**: Manual testing only, no safety baseline  
**Fix**: Created `scripts/smoke.sh` (14 critical endpoint tests) + `docs/SMOKE_TEST.md` (18 endpoints documented)

### 3. Mixed Backend Responsibilities ⏳ PLANNED
**Severity**: P0  
**Impact**: Tight coupling, hard to test, scattered transaction logic  
**Evidence** (via `grep -r "prisma\." modules/`):
```
160+ Prisma call sites across modules:
- Integrations/meta.service.ts: 2 calls
- Integrations/mtproto/*.ts: 20+ calls
- Core/superadmin/*.ts: 15+ calls
- Direct imports in routes, services, workers
```
**Root Cause**: No repository/data access layer, services call Prisma directly  
**Fix Planned**: Phase 3 - Create `repositories/` layer, target 80% reduction in Prisma calls from modules

### 4. Broken Cross-References (During Migration) ✅ MITIGATED
**Severity**: P0  
**Impact**: Broken navigation after doc consolidation  
**Evidence**:
```
docs/PLAN.md:42 → RELIABILITY_PLAN.md
docs/MASTER_PLAN.md:14 → ARCHITECTURE.md
docs/MASTER_PLAN.md:15 → MODULES.md (doesn't exist)
docs/MASTER_PLAN.md:16 → API.md
```
**Root Cause**: Plain text references, no markdown links  
**Fix**: Created stub redirects in `_stubs/` for smooth transition, migration map in `/tmp/old-to-new.map`

---

## P1 - Stability & Maintainability

### 5. Module Structure Confusion ✅ DOCUMENTED
**Severity**: P1  
**Impact**: Unclear ownership, hard to navigate  
**Evidence** (via `ls -R modules/`):
```
5 Top-Level Groups:
- Communication/ → bots, telegram
- Core/ → auth, companies, superadmin, system, templates, users
- Integrations/ → meta, mtproto, sendpulse, viber, whatsapp
- Inventory/ → inventory, normalization
- Sales/ → requests
```
**Root Cause**: Previous docs claimed "7 modules" then "11" - inconsistent counting  
**Fix**: Created accurate module docs in `docs/MODULES/` (6 files: COMMUNICATION, CORE, INTEGRATIONS, INVENTORY, SALES, FRONTEND)

### 6. Configuration Sprawl ✅ DOCUMENTED
**Severity**: P1  
**Impact**: Unclear precedence, hard to trace active config  
**Evidence**:
```
/.env → Docker Compose vars
/apps/cartie2_repo/.env → App-level vars
/apps/server/.env.example → Backend template
/apps/web/.env.production.example → Frontend template
```
**Root Cause**: Multiple `.env` locations, no documented hierarchy  
**Fix**: Documented precedence order in `docs/REFERENCE.md#environment-variables`

---

## P2 - Nice-to-Have

### 7. Root Structure Confusion ⏳ OPTIONAL
**Severity**: P2  
**Impact**: Learning curve for new developers  
**Evidence**:
```
/srv/cartie/
├── .agent/ # Antigravity Kit
├── apps/
│ └── cartie2_repo/ # ← Real project (nested 2 levels deep)
├── data/
└── services/ # Empty
```
**Root Cause**: Historical monorepo setup  
**Fix Planned**: Phase 4 - Option to rename `cartie2_repo` → `platform` (GO gate required)

---

## Assumptions Validated

1. ✅ **Module count**: Confirmed 5 groups, 15 submodules (was assumed 7-11)
2. ✅ **Frontend stack**: Tailwind v4 exists (was assumed "no design system")
3. ✅ **Inline styles**: Only 27 occurrences (was assumed "heavy inline styles")
4. ✅ **Prisma coupling**: 160+ calls measured (was assumed "scattered")

---

## Metrics Baseline (Before Refactor)

| Metric | Value | Target After Refactor |
|--------|-------|----------------------|
| **Doc files** | 17 | 6 canonical + 6 MODULES |
| **Inline styles** | 27 | < 10 |
| **Prisma calls in modules** | 160+ | < 50 (80% reduction) |
| **Smoke test coverage** | 0 endpoints | 14 endpoint tests |
| **Cross-references** | 4 plain text | All migrated to stubs |

---

**Next Actions**:
1. Phase 1.2: Update AI workflows to prevent future sprawl
2. Phase 2: Minor Tailwind cleanup (27 → <10 inline styles)
3. Phase 3: Backend repository layer (160+ → <50 Prisma calls, smoke tested)
4. Phase 4-5: Document structure + performance baseline

---

**Audit Status**: ✅ COMPLETE - Implementation in progress
