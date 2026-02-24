# Deploy Runbook — CarTié

## Quick Reference

| Action | Command |
|--------|---------|
| **Deploy** | `bash scripts/deploy/deploy_safe.sh` |
| **Rollback** | `bash scripts/deploy/rollback_safe.sh` |
| **Status** | `docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml ps` |
| **API Logs** | `docker logs infra2-api-1 --tail 100` |
| **Health** | `curl http://127.0.0.1:3002/health` |
| **DB Migrate** | `docker exec infra2-api-1 npx prisma migrate deploy` |

## Deploy Pipeline (deploy_safe.sh)

| Phase | What Happens | Failure Mode |
|-------|-------------|--------------|
| A) PRECHECK | Disk/RAM/Docker check | Script exits before changes |
| B) BACKUP | Save compose state, env keys, pg_dump | Warning only |
| C) UPDATE CODE | git fetch + ff-only merge | Warning (continue manually) |
| D) BUILD | docker compose build api web | `die` — no rollout |
| E) ROLLOUT | `up -d --no-deps api web` (DB untouched) | `die` — rollback needed |
| F) MIGRATE | `prisma migrate deploy` | `die` — rollback_safe.sh |
| G) HEALTH | curl /health 5 attempts | `die` — rollback_safe.sh |
| H) SUCCESS | Save last_success_commit | — |

## Rollback

```bash
bash scripts/deploy/rollback_safe.sh
```

Rolls code back to last_success_commit, rebuilds api+web, verifies health.
**DB migrations are NOT rolled back** (forward-only policy). If schema is incompatible — manual intervention needed.

## Environment Variables

All env vars in `.env`. Keys must match `infra/security_preflight.sh` checks.

## Artifacts

Each deploy creates a timestamped directory under `.deploy/`:
- `git_head.txt` — commit at deploy time
- `compose_ps.txt` — service status before deploy
- `env_keys.txt` — env key names (no values)
- `db_dump.sql.gz` — DB dump (best-effort)
- `migrate.log` — migration output
