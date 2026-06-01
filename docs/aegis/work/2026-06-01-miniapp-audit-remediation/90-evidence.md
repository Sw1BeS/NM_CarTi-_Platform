# MiniApp Audit Remediation Evidence

Date: 2026-06-01
Branch: `feature/miniapp-audit-remediation`

## Dependency Setup

- `npm --prefix apps/server install`
- `npm --prefix apps/web install --legacy-peer-deps`

Note: server `package-lock.json` install noise was reverted before final verification.

## Baseline Evidence

- Baseline focused regression before edits had one known stale test failure in `miniAppLeadHandoff.routes.test.ts` for B2B requester filtering shape.
- The stale assertion was corrected to match runtime query ownership: `requesterPartnerId: { not: null }` plus `NOT: { requesterPartnerId: 'seller_partner_1' }`.

## Focused Test Evidence

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts repair_miniapp_menu_config.helpers.test.ts
```

Result: 3 files passed, 10 tests passed.

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts metaEventSourceUrl.test.ts botDeliveryMode.test.ts sanitize_b2b_request_tracking_event_source_url.helpers.test.ts miniappApi.web.test.ts
```

Result: 14 files passed, 101 tests passed.

## Build Evidence

```bash
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Result: both builds passed. The web build emitted existing bundle-size and Browserslist age warnings only.

## Diff Hygiene

```bash
git diff --check
```

Result: passed.

```bash
node scripts/inspect/generate_code_map.mjs --check
```

Result: generated knowledge base check passed, 17 files.

## Cleanup Dry-Run Evidence

```bash
set -a
. /srv/cartie/.env
set +a
DATABASE_URL="${DATABASE_URL/@db:5432/@127.0.0.1:5433}" \
  npm --prefix apps/server run cleanup:b2b-request-tracking-urls -- --dry-run
```

Result:

```text
mode=DRY_RUN
candidates=24 changed=24
dry-run complete. Create a DB backup, review the preview, then rerun with --apply.
```

No database writes were performed.

## Meta Dataset QA Evidence

User-provided Dataset ID: `1152615213548168`

Offline/system-generated test:

- Event: synthetic `Lead`
- Test event code: `TEST54237`
- Result: `events_received=1`
- `fbtrace_id=AvVbwxd4V8ibAKRoowBrW_V`

Website test:

- Event: synthetic `PageView`
- Test event code: `TEST29566`
- Result: `events_received=1`
- `fbtrace_id=ALvnxUxzLS-BFuwYx_dnb5G`

The test sends used synthetic user data and did not print access tokens or raw Telegram auth payloads.

## Not Covered

- No production deploy smoke after this branch, because deploy was not requested in this slice.
- No cleanup `--apply`, because backup and apply approval remain separate gates.
- No browser MiniApp manual QA in Telegram client after deploy, because the code has not been deployed.
