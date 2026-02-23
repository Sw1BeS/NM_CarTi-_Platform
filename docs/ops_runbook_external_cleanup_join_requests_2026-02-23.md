# Ops Runbook: External Listings TTL + Join Request Fallback (2026-02-23)

## Scope
- External HTML listings lifecycle cleanup (`external=true`, `status=HIDDEN`, TTL 14 днів).
- Telegram channel join-request moderation fallback for B2B onboarding.
- PII-safe observability checks for external search pipeline.

## 1) External Listings TTL Cleanup

### Dry-run
```bash
npm --prefix apps/server run cleanup:external-hidden-listings -- --days=14
```

### Apply
```bash
npm --prefix apps/server run cleanup:external-hidden-listings -- --apply --days=14
```

### Expected output
- `mode=APPLY ttlDays=14 cutoff=<iso>`
- either `no candidates found` or `deleted=<n>`

### Schedule (recommended)
- Cron: daily at `03:15` server time.
- Example crontab:
```cron
15 3 * * * cd /srv/cartie && npm --prefix apps/server run cleanup:external-hidden-listings -- --apply --days=14 >> /var/log/cartie/external_cleanup.log 2>&1
```

## 2) External Search Observability (PII-safe)

### Log events
- `provider_start`
- `provider_disabled_by_robots`
- `provider_done`
- `provider_results`
- `search_completed`

### Verification
1. Trigger Lead Buy search with criteria that can fall back to external provider.
2. Ensure logs include provider/state/count only.
3. Ensure logs do **not** include phone/contact/user payload.

## 3) Telegram Join Request Moderation Fallback

## Normal path
- Bot issues invite via `createChatInviteLink`.
- Join request enters webhook `chat_join_request`.
- Auto-approve logic runs via `routeChatJoinRequest` + `telegramInvite.service`.

## Fallback if webhook/moderation degraded
1. Verify webhook has `chat_join_request` in allowed updates.
2. Re-run preset and webhook sync:
```bash
npm --prefix apps/server run preset:sync
```
3. If backlog persists, temporarily switch to manual moderation in Telegram channel admin UI.
4. After recovery, re-enable auto-approve policy and monitor for 15-30 min.

## 4) Recovery Checklist
- [ ] `prisma:migrate` applied.
- [ ] `preset:sync` completed for both bots.
- [ ] cleanup cron healthy (latest run < 24h).
- [ ] join requests processed end-to-end.
- [ ] no contact leaks in public/B2B channel cards.
