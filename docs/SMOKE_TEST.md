# Smoke Test Checklist - Critical Endpoints

> **Purpose**: Baseline safety harness for refactoring  
> **Run Before**: Any backend code changes (Phase 3)  
> **Expected**: 100% pass before proceeding

---

## Critical Endpoints (Must Not Break)

### 1. Health & System
- `GET /health` - Server health check

### 2. Authentication & Users
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/users` - List users (admin)

### 3. Sales & Leads  
- `POST /api/public/leads` - Create public lead (no auth)
- `POST /api/leads` - Create authenticated lead
- `GET /api/leads` - List leads
- `POST /api/public/requests` - Create B2B request (no auth)
- `GET /api/requests` - List B2B requests

### 4. Inventory
- `GET /api/inventory/cars` - List inventory
- `POST /api/inventory/cars` - Add car to inventory

### 5. Bots & Telegram
- `GET /api/bots` - List bot configs
- `POST /api/bots` - Create bot
- `GET /api/scenarios` - List scenarios
- `POST /api/messages/send` - Send message via bot

### 6. Templates & Marketplace
- `GET /api/templates` - List marketplace templates

### 7. Integrations
- `GET /api/integrations` - List integrations
- `POST /api/webhooks/whatsapp` - WhatsApp webhook (public)

### 8. Companies (Multi-tenancy)
- `GET /api/companies` - List workspaces
- `POST /api/companies` - Create workspace

---

## Critical Flows (Manual Verification)

1. **Login Flow**: Login → Get user profile → List leads
2. **Lead Creation**: Public lead → Appears in admin panel
3. **Bot Message**: Create bot → Send test message → Verify delivery
4. **Inventory Add**: Add car → Appears in inventory list

---

## Environment Requirements

```bash
# Required env vars for smoke tests
DATABASE_URL=postgresql://...
JWT_SECRET=test_secret_key
PORT=3001
```

---

## Success Criteria

✅ All 18 critical endpoints return 2xx (or expected 401 for auth)  
✅ No 500 errors  
✅ All 4 critical flows complete successfully  
✅ Database connections stable  

---

**Last Baseline**: 2026-01-22 (before Phase 3 refactor)
