#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-infra2}"
API_CONTAINER="${API_CONTAINER:-${PROJECT}-api-1}"
DB_CONTAINER="${DB_CONTAINER:-${PROJECT}-db-1}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3002/health}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3002}"

log() { echo "[PROD-VERIFY] $*"; }
die() { echo "[PROD-VERIFY][ERROR] $*"; exit 1; }

log "Checking containers..."
docker inspect "$API_CONTAINER" >/dev/null 2>&1 || die "API container not found: $API_CONTAINER"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "DB container not found: $DB_CONTAINER"

api_created=$(docker inspect "$API_CONTAINER" --format '{{.Created}}')
log "API container created: $api_created"

log "Checking API health: $API_HEALTH_URL"
health_code=$(curl -s -o /tmp/prod_verify_health.out -w "%{http_code}" "$API_HEALTH_URL" || true)
[ "$health_code" = "200" ] || die "Health check failed with status $health_code"
log "Health OK"

log "Loading botId + webhookSecret from DB..."
BOT_ID=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select id from \"BotConfig\" where \"isEnabled\"=true order by \"createdAt\" desc limit 1;")
[ -n "$BOT_ID" ] || die "No enabled bots found"

SECRET=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select coalesce(config->>'webhookSecret','') from \"BotConfig\" where id='${BOT_ID}' limit 1;")
[ -n "$SECRET" ] || die "Bot $BOT_ID has empty webhookSecret"

WEBHOOK_URL=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select coalesce(config->>'webhookUrl','') from \"BotConfig\" where id='${BOT_ID}' limit 1;")
log "Bot: $BOT_ID"
log "Webhook URL: ${WEBHOOK_URL:-<empty>}"

# Generate a high-but-safe update_id within int32 range to avoid dedup collisions.
UPDATE_ID=$((1900000000 + (((RANDOM << 15) | RANDOM) % 100000000)))
log "Sending Telegram webhook smoke update_id=$UPDATE_ID"

code=$(curl -s -o /tmp/prod_verify_tg.out -w "%{http_code}" \
  -X POST "${API_BASE_URL}/api/telegram/webhook/${BOT_ID}" \
  -H "x-telegram-bot-api-secret-token: ${SECRET}" \
  -H "content-type: application/json" \
  -d "{\"update_id\":${UPDATE_ID}}" || true)

[ "$code" = "200" ] || {
  cat /tmp/prod_verify_tg.out >&2 || true
  die "Telegram webhook returned status $code"
}
log "Webhook returned 200"

log "Verifying TelegramUpdate row exists..."
exists=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select count(*) from \"TelegramUpdate\" where \"botId\"='${BOT_ID}' and \"updateId\"=${UPDATE_ID};")
[ "$exists" = "1" ] || die "TelegramUpdate not recorded for update_id=$UPDATE_ID"
log "TelegramUpdate recorded"

log "Verifying recent tg.update.received events..."
events=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select count(*) from \"PlatformEvent\" where \"eventType\"='tg.update.received' and \"createdAt\" > now() - interval '10 minutes';")
[ "${events:-0}" -ge 1 ] || die "No recent tg.update.received events found"
log "Platform events present"

log "✅ Production verification passed"
