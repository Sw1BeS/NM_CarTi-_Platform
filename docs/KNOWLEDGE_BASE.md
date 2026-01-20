# Cartie v2 Knowledge Base

## System Overview
Cartie v2 is a B2B Automotive Marketplace & CRM platform.
- **URL**: `https://cartie2.umanoff-analytics.space/`
- **Stack**: React (Vite), Node.js (Express), PostgreSQL (Prisma), Docker (Caddy).

## Data Architecture (v4.1)
The system is transitioning to a generic "Entity-Attribute-Value" inspired v4.1 architecture while maintaining legacy tables.
- **Workspaces** (`workspaces`): Replaces "Companies".
- **Global Users** (`users`): Single login across workspaces.
- **Dual-Write**: Currently disabled (`USE_V4_DUAL_WRITE=false`).
- **Read-Path**: Enabled (`readService.ts` abstracts table access).

## Key Modules
### 1. Authentication
- **Flow**: POST `/api/auth/login` -> `auth.routes.ts` -> `readService.getUserByEmail` -> `bcrypt.compare`.
- **Token**: JWT containing `userId` (Legacy) and `globalUserId` (v4.1).

### 2. Bots & Telegram
- **Engine**: `scenario.engine.ts` handles generic flows.
- **Config**: `BotConfig` table defines token/mode.
- **Updates**: Stored in `TelegramUpdate` (for debugging).

### 3. Inventory
- **Model**: `CarListing`.
- **Status**: Direct controller logic (Needs refactor to Service pattern).
- **Search**: Basic `LIKE` queries (Needs upgrade to Full Text Search).

## Development Standards
- **Git Flow**: `main` (Prod), `develop` (Stage). Feature branches.
- **Docker**: `docker-compose -p infra2 -f infra/docker-compose.cartie2.prod.yml`.
- **Migrations**: Forward-only. `prisma migrate deploy`.

## Troubleshooting
### Login 401
- Check `users` table `password_hash`.
- Ensure `.env` `JWT_SECRET` matches in API container.

### API Crash
- Check `.dockerignore` (Host `node_modules` pollution).
- Verify `SEED_SUPERADMIN_PASSWORD`.
