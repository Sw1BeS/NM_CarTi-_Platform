# CP0 Baseline Release (2026-02-20)

- UTC timestamp: 2026-02-20T14:11:57Z
- Branch: main
- Commit: 56969451e75a7cc1e37a5907c873a56a23ef02a3
- Tag: release-baseline-20260220

## Baseline actions
- git add -A
- git commit -m "release: baseline before mega-prompt implementation"
- git tag release-baseline-20260220
- git push origin main --tags

## Pushed refs
- main
- release-baseline-20260220
- backup_before_rollback_20260112T114510Z
- main-before-antifravity
- pre-merge-20260202T204105Z

## Release gates
- npm --prefix apps/server test: PASS
- npm --prefix apps/server run build: PASS
- npm --prefix apps/web run build: PASS
- bash scripts/smoke_read.sh: PASS
- bash verification/smoke_test_basic.sh: PASS
- bash verification/routes_smoke_test.sh: PASS

## Deploy command
- BRANCH=main SKIP_PULL=0 RUN_SEED=1 SYNC_PRESETS=1 ALLOW_DIRTY=0 infra/deploy_prod.sh

## Deploy result
- Status: SUCCESS
- Build SHA from deploy log: 56969451e75a7cc1e37a5907c873a56a23ef02a3
- Deploy log: docs/audit/release-20260218T152454Z/artifacts/deploy_2026-02-20_140739.log

## Post-deploy verify
- infra/prod_verify.sh: PASS
- Verify log: docs/audit/release-20260218T152454Z/artifacts/prod_verify_2026-02-20.txt

## Rollback protocol
1. Checkout previous stable tag.
2. Re-run infra/deploy_prod.sh with branch/tag pinned.
3. Run post-rollback smoke: health, webhook, login, request create/read.
