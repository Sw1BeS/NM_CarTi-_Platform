# Cartie Platform Reference

> **Quick Reference** - Environment Variables, API Endpoints, Commands  
> **Updated**: 2026-01-22

---

## Environment Variables

### Precedence Order (highest to lowest)
1. **Container/Runtime** environment (Docker, systemd)
2. `/srv/cartie/apps/cartie2_repo/.env` (App-level)
3. `/srv/cartie/apps/cartie2_repo/apps/server/.env` (Backend local dev)
4. `/srv/cartie/apps/cart ie2_repo/apps/web/.env.production` (Frontend build)

### Required Production Variables

| Variable | Location | Purpose | Example |
|----------|----------|---------|---------|
| `DATABASE_URL` | Root `.env` | Postgres connection | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Root `.env` | Auth token signing | `random_64_char_string` |
| `PORT` | Root `.env` | Server port | `3001` |
| `CORS_ORIGIN` | Root `.env` | Allowed origins (comma-separated) | `https://app.example.com,https://admin.example.com` |
| `SEED_ADMIN_EMAIL` | Root `.env` | Initial admin email | `admin@example.com` |
| `SEED_ADMIN_PASSWORD` | Root `.env` | Initial admin password | `secure_password` |

### Optional Integration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `GEMINI_API_KEY` | AI content generation | - |
| `META_ACCESS_TOKEN` | Facebook/Instagram integration | - |
| `SENDPULSE_API_ID` | Email/SMS service | - |
| `TELEGRAM_BOT_TOKEN` | Bot authentication | - |

---

## API Endpoints

### Public (No Auth Required)
- `POST /api/public/leads` - Create lead
- `POST /api/public/requests` - Create B2B request
- `GET /api/public/bots` - List public bots
- `POST /api/webhooks/whatsapp` - WhatsApp webhook
- `POST /api/webhooks/viber` - Viber webhook

### Authentication
- `POST /api/auth/login` - Login (returns JWT)
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user profile

### Core Business
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `GET /api/requests` - List B2B requests
- `POST /api/requests` - Create B2B request
- `GET /api/inventory/cars` - List cars
- `POST /api/inventory/cars` - Add car

### Bots & Communication
- `GET /api/bots` - List bot configs
- `POST /api/bots` - Create bot
- `GET /api/scenarios` - List scenarios
- `POST /api/messages/send` - Send message
- `POST /api/telegram/call` - Make Telegram API call

### Multi-Tenancy
- `GET /api/companies` - List workspaces
- `POST /api/companies` - Create workspace
- `GET /api/users` - List users (admin only)

### Marketplace
- `GET /api/templates` - List marketplace templates
- `POST /api/templates` - Create template (admin)

### Integrations
- `GET /api/integrations` - List integrations
- `POST /api/integrations` - Configure integration

---

## Common Commands

### Development

```bash
# Start backend (dev mode with watch)
cd apps/server
npm run dev

# Start frontend (Vite dev server)
cd apps/web
npm run dev

# Run smoke tests
bash scripts/smoke.sh
```

### Database

```bash
# Generate Prisma client
cd apps/server
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database
npm run seed
```

### Build

```bash
# Build backend
cd apps/server
npm run build

# Build frontend
cd apps/web
npm run build
```

### Production (Docker Compose)

```bash
# Build all containers
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml build

# Start services
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d

# View logs
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml logs -f

# Stop services
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml down

# Health checks
curl http://localhost:3002/health      # Frontend
curl http://localhost:8082/api/health  # Backend via Caddy
```

---

## Deployment

### Pre-Flight Checklist
1. ✅ All smoke tests passing (`bash scripts/smoke.sh`)
2. ✅ Documentation consolidated (no plan_v2.md sprawl)
3. ✅ `.env` variables configured for production
4. ✅ Database migrations applied
5. ✅ Frontend build created (`apps/web/dist/`)
6. ✅ Backend build created (`apps/server/dist/`)

### Deployment Steps
1. Commit and push code
2. SSH to server
3. Pull latest code
4. Run `docker compose build`
5. Run `docker compose up -d`
6. Verify health endpoints
7. Run smoke tests against production

### Rollback
```bash
# Quick rollback - restart with previous image
docker compose -p infra2 down
git checkout <previous-commit>
docker compose -p infra2 up -d
```

---

## Operations

### Monitoring Critical Services
- **Database**: Postgres health, connection pool
- **Bot Manager**: Active bots via `/health` endpoint
- **Content Worker**: Scheduled post status via `/health`
- **MTProto**: Live sync status

### Common Issues

| Issue | Check | Fix |
|-------|-------|-----|
| 502 from Caddy | Backend running? | `docker compose ps`, restart backend |
| Auth failures | `JWT_SECRET` set? | Check `.env` |
| CORS errors | `CORS_ORIGIN` correct? | Update `.env`, restart |
| DB connection | `DATABASE_URL` valid? | Check Postgres, update URL |

---

**Last Updated**: 2026-01-22 (Phase 1.1 consolidation)
