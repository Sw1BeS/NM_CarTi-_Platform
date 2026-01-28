# Deployment Guide

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local scripts)

## Environment Variables (.env)
Create a `.env` file in the root:

```env
DATABASE_URL="postgresql://postgres:password@db:5432/cartie?schema=public"
JWT_SECRET="your-secret-key"
PORT=8082
# Admin Seeding
SEED_ADMIN_PASSWORD="securepassword"
SEED_SUPERADMIN_PASSWORD="rootsuperpassword"
```

## Production Deployment Steps

1. **Build Images**
   ```bash
   docker compose -f infra/docker-compose.cartie2.prod.yml build
   ```

2. **Start Services**
   ```bash
   docker compose -f infra/docker-compose.cartie2.prod.yml up -d
   ```

3. **Apply Database Migrations**
   ```bash
   # Run inside the server container
   docker compose -f infra/docker-compose.cartie2.prod.yml exec server npx prisma migrate deploy
   ```

4. **Seed Default Data (First Run Only)**
   ```bash
   docker compose -f infra/docker-compose.cartie2.prod.yml exec server npm run seed
   ```

5. **Verify Health**
   Check the health endpoint: `http://localhost:8082/health` (or your domain).

## Maintenance

- **Logs:** `docker compose -f infra/docker-compose.cartie2.prod.yml logs -f`
- **Restart:** `docker compose -f infra/docker-compose.cartie2.prod.yml restart server`
