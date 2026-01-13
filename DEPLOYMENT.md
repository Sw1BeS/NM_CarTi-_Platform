# Cartie2 Deployment Checklist

## Pre-Deployment

### 1. Environment Setup
- [ ] PostgreSQL 14+ installed and running
- [ ] Node.js 18+ installed
- [ ] `.env` file configured with production values
- [ ] `JWT_SECRET` is strong and unique
- [ ] `CORS_ORIGIN` set to production domain(s)

### 2. Database
- [ ] Run migrations: `npx prisma db push`
- [ ] Verify schema: `npx prisma db pull`
- [ ] Seed templates: `cd server/prisma/seeds && npm run seed`
- [ ] Update SUPER_ADMIN password (see below)

### 3. Build
- [ ] Frontend: `npm run build`
- [ ] Backend: `cd server && npm run build`
- [ ] No TypeScript errors
- [ ] No ESLint critical warnings

---

## Deployment Steps

### Step 1: Update SUPER_ADMIN Password

```bash
# Generate bcrypt hash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YOUR_SECURE_PASSWORD', 10).then(console.log);"

# Update in database
psql -d cartie2 -c "UPDATE \"User\" SET password = '\$2a\$10...' WHERE email = 'admin@cartie.system';"
```

### Step 2: Start Server

```bash
# Production mode
cd server
NODE_ENV=production npm start

# With PM2 (recommended)
pm2 start server/src/index.js --name cartie2-server
pm2 save
pm2 startup
```

### Step 3: Verify Health

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"...","uptime":...}
```

### Step 4: Create First Company

```bash
# Via SUPER_ADMIN API
curl -X POST http://localhost:3001/api/superadmin/companies \
  -H "Authorization: Bearer YOUR_SUPERADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Company",
    "slug": "demo",
    "plan": "PRO",
    "ownerEmail": "owner@demo.com",
    "ownerName": "Demo Owner"
  }'
```

---

## Post-Deployment Testing

### Authentication
- [ ] Login as SUPER_ADMIN
- [ ] Login as company OWNER
- [ ] JWT includes `companyId` and `role`
- [ ] Logout and re-login works

### Company Management
- [ ] View company settings at `/company`
- [ ] Update branding (logo URL, primary color)
- [ ] Invite team member
- [ ] Assign role (ADMIN/MANAGER/VIEWER)
- [ ] Remove team member

### Marketplace
- [ ] Browse templates at `/marketplace`
- [ ] Filter by category (LEAD_GEN, E_COMMERCE, B2B, SUPPORT)
- [ ] Search templates
- [ ] Install template (verify Scenario created)
- [ ] Install counter increments
- [ ] View installed templates

### Integrations
- [ ] Navigate to `/integrations`
- [ ] Configure SendPulse (API User ID, Secret)
- [ ] Save configuration
- [ ] Toggle active/inactive
- [ ] Configure Webhook (URL, events)
- [ ] Test webhook (verify payload received)

### Content Management
- [ ] Create post at `/content`
- [ ] Select car from inventory
- [ ] Choose template (IN_STOCK/IN_TRANSIT)
- [ ] Preview post
- [ ] Publish to channel
- [ ] Schedule post at `/calendar`
- [ ] Verify worker publishes at scheduled time

### Multi-Tenancy
- [ ] Create Company B
- [ ] Login as Company A user
- [ ] Verify can't see Company B's bots
- [ ] Verify can't access Company B's users
- [ ] Login as SUPER_ADMIN
- [ ] Access Company B via `?companyId=company_b`

### MiniApp
- [ ] Open `/p/app` in Telegram Web App
- [ ] Switch tabs (В наявності / В дорозі)
- [ ] Apply filters (brand, year, price)
- [ ] Open gallery lightbox
- [ ] Navigate images
- [ ] Click "I'm Interested" CTA
- [ ] Verify lead captured

---

## Performance Checks

### Database
- [ ] Indexes created (check migration logs)
- [ ] Query performance acceptable (<100ms avg)
- [ ] Connection pool configured (default: 10)

### API Response Times
- [ ] GET `/api/companies/current` < 50ms
- [ ] GET `/api/templates/marketplace` < 200ms
- [ ] POST `/api/auth/login` < 100ms

### Worker
- [ ] Content worker runs every minute (check logs)
- [ ] Scheduled posts publish on time (±1 min)
- [ ] Failed posts marked as FAILED
- [ ] Rate limiting works (1 sec between posts)

---

## Security Checklist

- [ ] HTTPS enabled (force redirect from HTTP)
- [ ] CORS configured for production domain only
- [ ] JWT_SECRET is strong (min 32 chars)
- [ ] SUPER_ADMIN password changed from default
- [ ] Database credentials secured (not in code)
- [ ] API rate limiting enabled
- [ ] Input sanitization active
- [ ] SQL injection protection (Prisma ORM)
- [ ] XSS protection (React escaping)

---

## Monitoring

### Server Logs
```bash
# PM2 logs
pm2 logs cartie2-server

# Check for errors
pm2 logs cartie2-server --err

# Monitor in real-time
pm2 monit
```

### Database Monitoring
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Slow queries
SELECT query, calls, total_time/calls as avg_time 
FROM pg_stat_statements 
ORDER BY avg_time DESC LIMIT 10;

-- Table sizes
SELECT schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Application Metrics
- [ ] Total users: `SELECT count(*) FROM "User"`
- [ ] Active companies: `SELECT count(*) FROM "Company" WHERE "isActive" = true`
- [ ] Bots running: Check PM2 for BotManager logs
- [ ] Scheduled posts: `SELECT count(*) FROM "Draft" WHERE status = 'SCHEDULED'`

---

## Backup Strategy

### Database Backup
```bash
# Daily backup
pg_dump -h localhost -U postgres cartie2 > backup_$(date +%Y%m%d).sql

# Restore
psql -h localhost -U postgres cartie2 < backup_20260113.sql
```

### Code Backup
```bash
# Git tag for release
git tag -a v1.0.0 -m "Stage A+B+C Complete"
git push origin v1.0.0
```

---

## Rollback Plan

### If Deployment Fails

1. **Database:** Restore from last backup
2. **Code:** `git checkout <previous-tag>`
3. **Server:** `pm2 restart cartie2-server`
4. **Verify:** `curl /health`

---

## Support Contacts

- **System Admin:** admin@cartie.system
- **On-Call:** +380...
- **Database:** DBA team
- **DevOps:** DevOps team

---

## Sign-Off

- [ ] Deployed by: _______________
- [ ] Tested by: _______________
- [ ] Approved by: _______________
- [ ] Date: _______________
- [ ] Go-Live Time: _______________

**Status:** 🟢 Ready / 🟡 Pending / 🔴 Blocked
