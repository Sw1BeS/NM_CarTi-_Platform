# CarTié MEGA Prompt Runbook

Date: 2026-02-20
Branch: `main`

## 1) Push/Deploy Commands
1. Baseline snapshot and push:
   - `git add -A`
   - `git commit -m "release: baseline before mega-prompt implementation"`
   - `git tag release-baseline-20260220`
   - `git push origin main --tags`
2. Gates:
   - `npm --prefix apps/server test`
   - `npm --prefix apps/server run build`
   - `npm --prefix apps/web run build`
   - `bash scripts/smoke_read.sh`
   - `bash verification/smoke_test_basic.sh`
   - `bash verification/routes_smoke_test.sh`
3. Deploy:
   - `BRANCH=main SKIP_PULL=0 RUN_SEED=1 SYNC_PRESETS=1 ALLOW_DIRTY=0 infra/deploy_prod.sh`
4. Verify:
   - `infra/prod_verify.sh`

## 2) Feature Flag Enable Order
1. CP1 schema/services deploy with all flags OFF.
   - `FF_CAR_CARD_V2=false`
   - `FF_BOT_A_FLOW_V2=false`
   - `FF_B2B_WHITELIST_ENFORCED=false`
   - `FF_B2B_FIT_QUEUE_V2=false`
   - `FF_MINIAPP_B2B_CABINET=false`
2. CP2 turn ON internal CarCard v2 first:
   - `FF_CAR_CARD_V2=true`
3. CP3 turn ON Bot A flow v2:
   - `FF_BOT_A_FLOW_V2=true`
4. CP4 turn ON B2B whitelist + fit queue lifecycle:
   - `FF_B2B_WHITELIST_ENFORCED=true`
   - `FF_B2B_FIT_QUEUE_V2=true`
5. CP5 turn ON Mini App B2B cabinet:
   - `FF_MINIAPP_B2B_CABINET=true`

After each checkpoint run:
- `/health`
- webhook smoke (`infra/prod_verify.sh`)
- subset QA scenarios

## 3) Rollback
1. Roll back to previous stable tag:
   - `git checkout <previous-tag>`
2. Re-deploy:
   - `BRANCH=<tag_or_sha> SKIP_PULL=0 RUN_SEED=0 SYNC_PRESETS=0 ALLOW_DIRTY=0 infra/deploy_prod.sh`
3. Post-rollback smoke:
   - health + webhook
   - login
   - request create/read

## 4) Env Contract
Required additions:
- `FF_CAR_CARD_V2`
- `FF_BOT_A_FLOW_V2`
- `FF_B2B_WHITELIST_ENFORCED`
- `FF_B2B_FIT_QUEUE_V2`
- `FF_MINIAPP_B2B_CABINET`
- `TELEGRAM_INITDATA_MAX_AGE_SECONDS`
- `BOT_A_DAILY_LEAD_LIMIT`
- `BOT_STEP_RATE_LIMIT_PER_MIN`
- `BOT_MEDIA_MAX_PHOTO_BYTES`
