# CARTIE PLATFORM: IMPLEMENTATION PLAN

**Date**: 2026-01-22  
**Based On**: [docs/AUDIT.md](./AUDIT.md)  
**Goal**: Fix critical deployment, data, and integration issues without breaking existing functionality

---

## PRIORITIES

| Priority | Focus                          | Timeline | Impact              |
|----------|--------------------------------|----------|---------------------|
| **P0**   | Deployment + Data              | Day 1    | **Blocks production** |
| **P1**   | Telegram Integration           | Day 2    | **Core feature broken** |
| **P2**   | Code Cleanup + Optimization    | Day 3+   | Tech debt           |

---

## P0: DEPLOYMENT STABILITY (CRITICAL)

### **P0.1: Idempotent Deployment Script**

**Problem**: Manual deletion of "old infra" needed because compose project names conflict.

**Files to Change**:
- `infra/deploy_prod.sh` (NEW)
- `infra/deploy_infra2.sh` (UPDATE with cleanup steps)

**Changes**:

1. **Create `infra/deploy_prod.sh`** (master idempotent script):
```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/cartie/apps/cartie2_repo}"
PROJECT="infra2"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.cartie2.prod.yml"

echo "[DEPLOY] Step 1: Cleanup old containers/networks"
docker ps -a --filter "name=infra" --filter "name=cartie" --filter "name=prod" -q | xargs -r docker rm -f || true
docker network ls --filter "name=infra" --filter "name=cartie" --filter "name=prod" -q | xargs -r docker network rm || true

echo "[DEPLOY] Step 2: Pull latest code"
cd "$REPO_DIR"
git fetch origin main
git merge --ff-only origin/main

echo "[DEPLOY] Step 3: Build images"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web

echo "[DEPLOY] Step 4: Start services"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d

echo "[DEPLOY] Step 5: Run migrations"
sleep 10  # Wait for DB to be ready
docker exec infra2-api-1 npm run prisma:migrate

echo "[DEPLOY] Step 6: Seed production data"
docker exec infra2-api-1 npm run seed

echo "[DEPLOY] Step 7: Health checks"
curl --fail --retry 5 --retry-delay 2 http://127.0.0.1:3002/health || exit 1
curl --fail --retry 5 --retry-delay 2 http://127.0.0.1:8082/api/health || exit 1

echo "[DEPLOY] ✅ Deployment complete"
```

2. **Update `infra/deploy_infra2.sh`**:
   - Add reference to new `deploy_prod.sh`
   - Or merge logic above into existing file

**Checklist**:
- [ ] Script can run twice without errors
- [ ] No manual cleanup needed before deploy
- [ ] Migrations run automatically
- [ ] Seed runs automatically (idempotent)

---

### **P0.2: Remove Feature Flags**

**Problem**: User requirement: "Feature flags — УДАЛИТЬ. Всё должно быть доступно."

**Files to Change**:
- `apps/server/prisma/seed.ts` (COMMENT OUT flag creation)
- `apps/server/src/modules/Core/system/system.routes.ts` (IGNORE flags)
- `apps/web/src/contexts/AuthContext.tsx` or similar (IGNORE flags in UI)

**Changes**:

1. **In `seed.ts` (lines 227-297)**:
   - Keep `features` and `modules` fields for backward compat
   - But set **all** to `true` always
   - Add comment: `// Feature flags disabled per requirement - all features enabled`

2. **In backend**:
   - Find any code checking `SystemSettings.features` or `.modules`
   - Replace with `true` or remove checks entirely

3. **In frontend**:
   - Find any code checking feature flags
   - Replace with constant `true`

**Checklist**:
- [ ] All modules visible in UI without role/flag checks
- [ ] No hidden features
- [ ] Backward compat: old DB records still work

---

### **P0.3: Remove `.bak` Files**

**Problem**: `TelegramHub.bak.tsx` found, suggests manual file management.

**Files to Delete**:
- `apps/web/src/pages/app/TelegramHub.bak.tsx`
- Any other `.bak` files

**Command**:
```bash
find apps -name "*.bak*" -type f -delete
```

**Checklist**:
- [ ] No `.bak` files in repo
- [ ] Build succeeds without errors

---

### **P0.4: Route Orphaned Pages or Remove Them**

**Problem**: `ScenarioBuilder.tsx` and `AutomationBuilder.tsx` exist but not routed.

**Decision Needed**: Keep or remove?

**Option A: Add Routes** (if pages work):
```tsx
// apps/web/src/App.tsx
<Route path="/scenarios" element={<ProtectedRoute><ScenarioBuilder /></ProtectedRoute>} />
<Route path="/automations" element={<ProtectedRoute><AutomationBuilder /></ProtectedRoute>} />
```

**Option B: Delete Files** (if pages incomplete):
```bash
rm apps/web/src/pages/app/ScenarioBuilder.tsx
rm apps/web/src/pages/app/AutomationBuilder.tsx
```

**Checklist**:
- [ ] Decision made: keep or delete
- [ ] If keep: routes added + tested
- [ ] If delete: files removed + no import errors

---

## P1: REAL DATA SETUP (HIGH PRIORITY)

### **P1.1: Split Production vs Demo Seeds**

**Problem**: Mix of production (companies, users) and demo (bots with fake tokens) in one seed.

**Files to Change**:
- `apps/server/prisma/seed.ts` (RESTRUCTURE)
- `apps/server/prisma/seeds/` (CREATE subdirectory)

**Changes**:

1. **Split seed.ts into**:
   - `seed.production.ts` → Companies, users, templates, normalization (NO demo bots/data)
   - `seed.demo.ts` → Demo bots, inventory, requests (ONLY if `SEED_DEMO=true`)

2. **Main `seed.ts` becomes**:
```typescript
async function main() {
  await seedProduction();
  if (process.env.SEED_DEMO === 'true') {
    await seedDemo();
  }
}
```

3. **Update `package.json`**:
```json
"seed:prod": "tsx prisma/seed.production.ts",
"seed:demo": "tsx prisma/seed.demo.ts",
"seed": "tsx prisma/seed.ts"
```

**Checklist**:
- [ ] `npm run seed` runs production only (no demo data)
- [ ] `SEED_DEMO=true npm run seed` runs both
- [ ] Production companies/users/templates created
- [ ] No placeholder bot tokens in production seed

---

### **P1.2: Document Real Credentials Setup**

**Problem**: No clear instructions on how to add real bot tokens, MTProto creds, integration keys.

**Files to Create**:
- `docs/SETUP_CREDENTIALS.md` (NEW)
- `.env.example` (UPDATE)

**Content for `SETUP_CREDENTIALS.md`**:

```markdown
# Setting Up Real Credentials

## 1. Telegram Bot Token

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow instructions
3. Copy the token (e.g., `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Add to database:
```sql
INSERT INTO "BotConfig" (id, name, template, token, "companyId", "isEnabled")
VALUES ('bot_prod_1', 'Production Bot', 'CLIENT_LEAD', 'YOUR_TOKEN_HERE', 'company_cartie', true);
```

## 2. MTProto Credentials

1. Go to https://my.telegram.org/apps
2. Create app → get API ID and API Hash
3. Phone number: your Telegram account phone
4. Add to `MTProtoConnector`:
```sql
INSERT INTO "MTProtoConnector" (id, name, "workspaceApiId", "workspaceApiHash", phone, "companyId", status)
VALUES ('mtproto_prod_1', 'Main Parser', 12345678, 'your_api_hash_here', '+1234567890', 'company_cartie', 'DISCONNECTED');
```
5. Run authentication flow (TODO: create admin UI for this)

## 3. SendPulse API

1. Go to SendPulse dashboard → API → get ID + Secret
2. Update `SystemSettings`:
```sql
UPDATE "SystemSettings"
SET "sendpulseId" = 'your_id', "sendpulseSecret" = 'your_secret'
WHERE id = 1;
```

## 4. Meta Pixel

1. Facebook Events Manager → get Pixel ID + Access Token
2. Update `SystemSettings`:
```sql
UPDATE "SystemSettings"
SET "metaPixelId" = 'your_pixel_id', "metaToken" = 'your_token'
WHERE id = 1;
```
```

**Update `.env.example`**:
```env
# Required for Production
DATABASE_URL=postgresql://cartie:password@127.0.0.1:5433/cartie_db
JWT_SECRET=your_strong_random_secret

# Optional: Pre-seed admin credentials
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=changeme
SEED_SUPERADMIN_EMAIL=super@example.com
SEED_SUPERADMIN_PASSWORD=changeme

# MTProto (from my.telegram.org)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash_here

# Integrations (optional, can add via UI)
SENDPULSE_ID=
SENDPULSE_SECRET=
META_PIXEL_ID=
META_ACCESS_TOKEN=
```

**Checklist**:
- [ ] `SETUP_CREDENTIALS.md` created with step-by-step guide
- [ ] `.env.example` updated with all required vars
- [ ] README links to setup guide

---

## P1: TELEGRAM INTEGRATION (HIGH PRIORITY)

### **P1.3: Route Scenario Builder**

**Problem**: `ScenarioBuilder.tsx` exists but not accessible in UI.

**Files to Change**:
- `apps/web/src/App.tsx` (ADD route)

**Changes**:
```tsx
import { ScenarioBuilder } from './pages/app/ScenarioBuilder';

// In Routes:
<Route path="/scenarios" element={<ProtectedRoute><ScenarioBuilder /></ProtectedRoute>} />
```

**Alternative**: If `ScenarioBuilder.tsx` is incomplete, consider using `TelegramHub.tsx` with tabs:
- Tab 1: Bots
- Tab 2: Scenarios
- Tab 3: Campaigns
- Tab 4: MTProto Sources

**Checklist**:
- [ ] `/scenarios` route works
- [ ] User can create/edit scenarios
- [ ] Scenarios link to bots

---

### **P1.4: MTProto → Entity Mapping Service**

**Problem**: MTProto worker parses channels, but unclear how data flows to `CarListing` or `Draft`.

**Files to Create**:
- `apps/server/src/services/mtproto-mapping.service.ts` (NEW)

**Files to Update**:
- `apps/server/src/modules/Integrations/mtproto/mtproto.worker.ts` (CALL new service)

**Logic**:

1. **In `mtproto-mapping.service.ts`**:
```typescript
export async function processParsedMessage(
  message: TelegramMessage,
  channelSource: ChannelSource
) {
  const rules = channelSource.importRules as any;

  // Example rules:
  // { autoPublish: true, filterKeywords: ['BMW', 'Mercedes'], minYear: 2015 }

  // Extract car data from message text
  const carData = extractCarData(message.text);

  if (!carData) return;

  // Apply filters
  if (rules.minYear && carData.year < rules.minYear) return;
  if (rules.filterKeywords && !matchesKeywords(carData, rules.filterKeywords)) return;

  // Save to CarListing
  await prisma.carListing.create({
    data: {
      title: carData.title,
      price: carData.price,
      year: carData.year,
      sourceChatId: message.chatId,
      sourceMessageId: message.messageId,
      companyId: channelSource.connector.companyId,
      status: rules.autoPublish ? 'AVAILABLE' : 'PENDING'
    }
  });
}
```

2. **In `mtproto.worker.ts`**:
```typescript
import { processParsedMessage } from '../../services/mtproto-mapping.service';

// After parsing message:
await processParsedMessage(message, channelSource);
```

**Checklist**:
- [ ] MTProto parsed messages create `CarListing` entries
- [ ] `importRules` from `ChannelSource` applied
- [ ] UI shows "Imported from Channel X" badge

---

## P2: CODE CLEANUP (OPTIONAL)

### **P2.1: Decide v4.1 Strategy**

**Problem**: Dual schema (legacy + v4.1) adds complexity. 40+ v4.1 models unused.

**Decision Needed**:
- **Option A**: Remove v4.1 entirely (keep legacy)
- **Option B**: Commit to v4.1 (migrate all legacy → v4.1)
- **Option C**: Keep dual-write for now, decide later

**Recommendation**: **Option C** for now → revisit after P0/P1 fixes.

**Checklist**:
- [ ] Document decision in `docs/ARCHITECTURE.md`
- [ ] If removing v4.1: drop models, remove dual-write service
- [ ] If migrating: create migration plan

---

### **P2.2: Review Dynamic Entities**

**Problem**: `EntityDefinition`/`EntityField`/`EntityRecord` abstraction used for only 6 types.

**Decision**: Keep or simplify?

**If Keep**: Document use cases clearly  
**If Simplify**: Hardcode the 6 entities as Prisma models

**Checklist**:
- [ ] Decision documented
- [ ] If simplifying: create migration to convert records → hardcoded models

---

### **P2.3: Simplify MTProto Worker**

**Current**: Separate worker process + queue

**Alternative**: Cron job every 5 minutes

**Pros of Cron**:
- Simpler architecture
- No separate process management
- Adequate for non-realtime channel parsing

**Cons**:
- Less realtime (5 min delay vs instant)

**Recommendation**: Keep worker for now (not a priority).

**Checklist**:
- [ ] Document current architecture in `ARCHITECTURE.md`

---

## VERIFICATION PLAN

### **Automated Tests**

1. **Backend API Health**:
```bash
curl --fail http://127.0.0.1:3002/health
curl --fail http://127.0.0.1:8082/api/health
```

2. **Database Seed Idempotency**:
```bash
docker exec infra2-api-1 npm run seed
docker exec infra2-api-1 npm run seed  # Should not error
```

3. **Deployment Script Idempotency**:
```bash
./infra/deploy_prod.sh
./infra/deploy_prod.sh  # Should succeed without manual cleanup
```

### **Manual Tests**

1. **Login Flow**:
   - Go to https://cartie2.umanoff-analytics.space/#/login
   - Login with `admin@cartie.com` / `admin123`
   - Should redirect to dashboard

2. **All Pages Load**:
   - Visit each route in `App.tsx`
   - Check no 404s or crashes

3. **Bot Creation** (if real token added):
   - Go to `/telegram`
   - Create bot with real token
   - Send test message → should appear in inbox

4. **MTProto Parsing** (if connector set up):
   - Go to `/integrations`
   - Add MTProto connector
   - Add channel source
   - Wait 5 min → check inventory for imported cars

---

## FILES TO MODIFY SUMMARY

| File                                            | Action  | Priority |
|-------------------------------------------------|---------|----------|
| `infra/deploy_prod.sh`                          | NEW     | P0       |
| `infra/deploy_infra2.sh`                        | UPDATE  | P0       |
| `apps/server/prisma/seed.ts`                    | RESTRUCTURE | P1   |
| `apps/server/prisma/seed.production.ts`         | NEW     | P1       |
| `apps/server/prisma/seed.demo.ts`               | NEW     | P1       |
| `.env.example`                                  | UPDATE  | P1       |
| `docs/SETUP_CREDENTIALS.md`                     | NEW     | P1       |
| `apps/web/src/App.tsx`                          | UPDATE  | P1       |
| `apps/web/src/pages/app/TelegramHub.bak.tsx`   | DELETE  | P0       |
| `apps/web/src/pages/app/ScenarioBuilder.tsx`   | ROUTE/DELETE | P1  |
| `apps/web/src/pages/app/AutomationBuilder.tsx` | ROUTE/DELETE | P1  |
| `apps/server/src/services/mtproto-mapping.service.ts` | NEW | P1 |
| `apps/server/src/modules/Integrations/mtproto/mtproto.worker.ts` | UPDATE | P1 |
| `docs/ARCHITECTURE.md`                          | NEW     | P2       |

---

## EXECUTION ORDER

### **Phase 1: Deployment Stability (P0)** — 2-3 hours
1. Create `infra/deploy_prod.sh`
2. Remove `.bak` files
3. Comment out feature flag checks (or remove)
4. Test: Deploy twice without manual cleanup

### **Phase 2: Data Setup (P1)** — 3-4 hours
5. Restructure `seed.ts` → `seed.production.ts` + `seed.demo.ts`
6. Create `SETUP_CREDENTIALS.md`
7. Update `.env.example`
8. Test: Seed runs cleanly

### **Phase 3: Telegram Integration (P1)** — 4-5 hours
9. Route `ScenarioBuilder.tsx` or remove it
10. Create `mtproto-mapping.service.ts`
11. Update `mtproto.worker.ts` to call mapper
12. Test: MTProto → CarListing flow

### **Phase 4: Verification** — 1-2 hours
13. Run all smoke tests
14. Manual testing of key flows
15. Document remaining issues in `AUDIT.md`

---

## RISKS

| Risk                                | Mitigation                                      |
|-------------------------------------|-------------------------------------------------|
| Deployment script breaks prod       | Test in staging first, keep rollback plan      |
| Seed idempotency fails              | Add robust upserts, check for duplicates        |
| MTProto mapping wrong               | Start with simple keyword match, iterate        |
| Scenario UI incomplete              | Fallback: remove route, use JSON config         |
| Real credentials leak               | Add `.env` to `.gitignore`, use secrets manager |

---

**End of PLAN.md**  
**Ready for Phase 3: Implementation** 🚀
