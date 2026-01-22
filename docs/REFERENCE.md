# Cartie Platform Reference

Updated: 2026-01-22

## Environment Variables

### Precedence (highest to lowest)
1. Container/runtime env (Docker, systemd)
2. Repo root `.env`
3. `apps/server/.env` (backend local dev)
4. `apps/web/.env.production` (frontend build only, `VITE_` prefix)

### Required Production Variables
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_SUPERADMIN_EMAIL`
- `SEED_SUPERADMIN_PASSWORD`

### Feature Flags (v4.1)
- `USE_V4_WORKSPACE_SCOPING`
- `USE_V4_DUAL_WRITE`
- `USE_V4_READS`
- `USE_V4_SHADOW_READS`

### Optional Integrations
- `META_PIXEL_ID`
- `META_ACCESS_TOKEN`
- `SENDPULSE_ID`
- `SENDPULSE_SECRET`
- `AUTORIA_API_KEY`
- `GEMINI_API_KEY`

## API Endpoints (Selected)

### Public
- GET `/health`
- GET `/api/system/settings/public`
- GET `/api/public/bots`
- GET `/api/public/requests`
- POST `/api/public/leads`
- POST `/api/public/requests`
- POST `/api/webhooks/whatsapp`
- POST `/api/webhooks/viber`
- POST `/api/telegram/webhook/:botId`

### Auth
- POST `/api/auth/login`
- GET `/api/auth/me`

### Protected (role-based)
- GET `/api/bots`
- GET `/api/scenarios`
- GET `/api/requests`
- POST `/api/requests/:id/variants`
- GET `/api/inventory`
- GET `/api/companies`
- GET `/api/templates`
- GET `/api/integrations`
- GET `/api/entities/meta`

## Common Commands

### Development
```bash
cd apps/server
npm run dev

cd apps/web
npm run dev
```

### Database
```bash
cd apps/server
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

### Build
```bash
cd apps/server
npm run build

cd apps/web
npm run build
```

### Production (Docker Compose)
```bash
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml build
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml logs -f
```

## SMOKE

### Read-only smoke checks
```bash
BASE_URL=http://127.0.0.1:3001 bash scripts/smoke_read.sh
AUTH_TOKEN=... BASE_URL=http://127.0.0.1:3001 bash scripts/smoke_read.sh
```

Expected output format:
- Lines with `PASS`, `AUTH`, or `FAIL`
- Summary line: `Summary: PASS=X AUTH=Y FAIL=Z`

### Write smoke checks (dev only)
```bash
ENABLE_WRITE=1 BASE_URL=http://127.0.0.1:3001 bash scripts/smoke_write.sh
```

Notes:
- Writes are blocked unless `ENABLE_WRITE=1`.
- Non-local URLs are blocked unless `ALLOW_PROD=1` is set.
