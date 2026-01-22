# 🚀 Cartie2 Deployment Guide

> **Release Candidate 1.0**
> One-stop guide to deploying the Cartie2 platform in production (Docker Compose + Caddy).

---

## 1. Prerequisites

Ensure your server meets these requirements:
- **OS**: Ubuntu 22.04+ (Recommended) or any Docker-compatible Linux
- **Software**: Docker & Docker Compose (v2+)
- **Ports**: 80 (HTTP), 443 (HTTPS), 3001 (API Internal), 8080 (Web Internal)

## 2. Quick Deploy (Production)

We have condensed the deployment into a valid Docker Compose setup.

### A. Clone & Configure
```bash
# 1. Clone repository
git clone <repo-url> /srv/cartie/apps/cartie2_repo
cd /srv/cartie/apps/cartie2_repo

# 2. Setup Environment
cp .env.example .env
nano .env 
# -> Set JWT_SECRET, POSTGRES_PASSWORD, etc.
```

### B. Build & Launch
Use the production compose file located in `infra/`:

```bash
# 1. Build Images
docker compose -f infra/docker-compose.cartie2.prod.yml build

# 2. Start Services (Detached)
docker compose -f infra/docker-compose.cartie2.prod.yml up -d

# 3. View Logs (Optional)
docker compose -f infra/docker-compose.cartie2.prod.yml logs -f
```

## 3. Verification

Once containers are running (`docker ps` shows `api`, `web`, `db`):

| Service | internal URL | Description |
|---------|-------------|-------------|
| **Frontend** | `http://localhost:8082` | Main UI (proxied by Caddy) |
| **Backend** | `http://localhost:3002/health` | API Health Check |
| **Database** | `localhost:5433` | Postgres (Mapped port) |

### Manual Health Check
```bash
# Check Backend
curl http://localhost:3002/health
# {"status":"ok"...}

# Check Frontend
curl -I http://localhost:8082
# HTTP/1.1 200 OK
```

## 4. Updates & Maintenance

### Deploying New Code
```bash
git pull origin main
docker compose -f infra/docker-compose.cartie2.prod.yml build
docker compose -f infra/docker-compose.cartie2.prod.yml up -d
```

### Database Backups
```bash
# Dump DB from container
docker compose -f infra/docker-compose.cartie2.prod.yml exec -T db pg_dump -U cartie cartie_db > backup_$(date +%F).sql
```

## 5. Troubleshooting

**"502 Bad Gateway" on Frontend**:
- Check if API container is running: `docker compose ... ps`
- Check API logs: `docker compose ... logs api`

**"Prisma Client Error"**:
- You might need to run migrations inside the container:
```bash
docker compose -f infra/docker-compose.cartie2.prod.yml exec api npx prisma migrate deploy
```
