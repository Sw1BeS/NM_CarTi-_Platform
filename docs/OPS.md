# Operations Guide (OPS.md)

## 🚀 Deployment
**Always** use the automated script. Do NOT manually `docker compose up`.

```bash
cd apps/cartie2_repo/infra
./deploy_infra2.sh
```
This script:
1. Pulls latest code.
2. Rebuilds containers.
3. Restarts services with atomic-like safety.
4. Verifies health of `api`, `web`, and `db`.

## 🛠 Manual Restarts
If you must restart a specific service, use `restart` or `up -d`. **Never** use `rm` without immediately running `up`.

```bash
# Slower but safe (recreates container)
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d --force-recreate <service_name>

# Quick restart (no rebuild)
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml restart <service_name>
```
*Services:* `web`, `api`, `db`

## 🩺 Monitoring & Recovery
A self-healing script is available. It checks if containers are running and restarts them if missing.

```bash
# Run manually
./apps/cartie2_repo/infra/monitor.sh

# Install as Cron (Recommended)
# * * * * * /srv/cartie/apps/cartie2_repo/infra/monitor.sh >> /srv/cartie/_logs/monitor.log 2>&1
```

## 🐛 Troubleshooting
**Logs:**
```bash
docker logs infra2-api-1 --tail 100 -f
docker logs infra2-web-1 --tail 100 -f
docker logs infra2-db-1 --tail 100 -f
```

**Common Errors:**
- `Bot Loop Error (404)`: Invalid Bot Token. Check `SystemSettings` or `BotConfig` in DB.
- `Column does not exist`: Missing migration. Run `npm run prisma:migrate` in `apps/server`.
