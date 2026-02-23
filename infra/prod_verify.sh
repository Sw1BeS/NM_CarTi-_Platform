#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-infra2}"
API_CONTAINER="${API_CONTAINER:-${PROJECT}-api-1}"
DB_CONTAINER="${DB_CONTAINER:-${PROJECT}-db-1}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3002/health}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3002}"
REPO_DIR="${REPO_DIR:-/srv/cartie}"

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

log "Loading enabled bots + webhook secrets from DB..."
BOT_ROWS="$(
  docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -A -F '|' -t -c "
    SELECT
      id,
      COALESCE(config->>'webhookSecret', ''),
      COALESCE(config->>'webhookUrl', ''),
      COALESCE(\"deliveryMode\"::text, '')
    FROM \"BotConfig\"
    WHERE \"isEnabled\"=true
    ORDER BY \"createdAt\";
  " | tr -d '\r'
)"
[ -n "$BOT_ROWS" ] || die "No enabled bots found"

while IFS='|' read -r BOT_ID SECRET WEBHOOK_URL DELIVERY_MODE; do
  [ -n "$BOT_ID" ] || continue
  [ -n "$SECRET" ] || die "Bot $BOT_ID has empty webhookSecret"

  log "Bot: $BOT_ID deliveryMode=${DELIVERY_MODE:-unknown} webhookUrl=${WEBHOOK_URL:-<empty>}"

  # Generate a high-but-safe update_id within int32 range to avoid dedup collisions.
  UPDATE_ID=$((1900000000 + (((RANDOM << 15) | RANDOM) % 100000000)))
  log "Sending Telegram webhook smoke update_id=$UPDATE_ID bot=$BOT_ID"

  code=$(curl -s -o /tmp/prod_verify_tg.out -w "%{http_code}" \
    -X POST "${API_BASE_URL}/api/telegram/webhook/${BOT_ID}" \
    -H "x-telegram-bot-api-secret-token: ${SECRET}" \
    -H "content-type: application/json" \
    -d "{\"update_id\":${UPDATE_ID}}" || true)

  [ "$code" = "200" ] || {
    cat /tmp/prod_verify_tg.out >&2 || true
    die "Telegram webhook returned status $code for bot=$BOT_ID"
  }
  log "Webhook returned 200 for bot=$BOT_ID"

  log "Verifying TelegramUpdate row exists for bot=$BOT_ID..."
  exists=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select count(*) from \"TelegramUpdate\" where \"botId\"='${BOT_ID}' and \"updateId\"=${UPDATE_ID};")
  [ "$exists" = "1" ] || die "TelegramUpdate not recorded for bot=$BOT_ID update_id=$UPDATE_ID"
  log "TelegramUpdate recorded for bot=$BOT_ID"

  log "Verifying recent tg.update.received events for bot=$BOT_ID..."
  events=$(docker exec "$DB_CONTAINER" psql -U cartie -d cartie_db -t -A -c "select count(*) from \"PlatformEvent\" where \"eventType\"='tg.update.received' and \"botId\"='${BOT_ID}' and \"createdAt\" > now() - interval '10 minutes';")
  [ "${events:-0}" -ge 1 ] || die "No recent tg.update.received events found for bot=$BOT_ID"
  log "Platform events present for bot=$BOT_ID"
done <<< "$BOT_ROWS"

log "Running Telegram live verification gates..."
[ -x "$REPO_DIR/infra/verify_telegram_live.sh" ] || die "Missing executable $REPO_DIR/infra/verify_telegram_live.sh"
PROJECT="$PROJECT" DB_CONTAINER="$DB_CONTAINER" "$REPO_DIR/infra/verify_telegram_live.sh"
log "Telegram live verification gates passed"

log "✅ Production verification passed"
