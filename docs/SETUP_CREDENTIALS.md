# SETTING UP REAL CREDENTIALS

**Purpose**: Configure production credentials for Telegram bots, MTProto channel parsing, and external integrations.

**Prerequisite**: System deployed successfully with `./infra/deploy_prod.sh`

---

## 1. TELEGRAM BOT TOKEN

### Get Bot Token

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow instructions:
   - Bot name: `Cartie Production Bot`
   - Bot username: `cartie_prod_bot` (must be unique)
3. Copy the token (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Add to Database

**Via psql**:
```sql
-- Connect to database
docker exec -it infra2-db-1 psql -U cartie -d cartie_db

-- Insert bot
INSERT INTO "BotConfig" (
  id, 
  name, 
  template, 
  token, 
  "companyId", 
  "isEnabled",
  "deliveryMode"
)
VALUES (
  'bot_prod_main',
  'Production Bot',
  'CLIENT_LEAD',
  'YOUR_BOT_TOKEN_HERE',
  (SELECT id FROM "Workspace" WHERE slug = 'cartie' LIMIT 1),
  true,
  'POLLING'
)
ON CONFLICT (token) DO UPDATE SET "isEnabled" = true;
```

**Via Admin UI** (recommended after bot module created):
1. Go to https://cartie2.umanoff-analytics.space/#/telegram
2. Click "Add Bot"
3. Paste token
4. Select template: `CLIENT_LEAD`
5. Enable bot

### Test Bot

```bash
# Send test message to bot in Telegram
# Check backend logs
docker logs infra2-api-1 --tail 50 --follow

# Should see: "Bot polling started" or "Received update from bot_prod_main"
```

---

## 2. MTPROTO CREDENTIALS (Channel Parsing)

### Get API Credentials

1. Go to https://my.telegram.org/apps
2. Login with your Telegram account
3. Create new app:
   - App title: `Cartie MTProto`
   - Short name: `cartie`
   - Platform: `Other`
4. Copy:
   - **API ID**: e.g. `12345678`
   - **API Hash**: e.g. `0123456789abcdef0123456789abcdef`

### Add to .env

```bash
# Edit .env in repository root
cd /srv/cartie
nano .env

# Add these lines:
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=0123456789abcdef0123456789abcdef
```

### Create MTProto Connector (requires authentication flow)

**⚠️ Current Limitation**: No UI for MTProto authentication yet. Manual SQL insertion required.

**Option A: Manual SQL**:
```sql
INSERT INTO "MTProtoConnector" (
  id,
  name,
  "workspaceApiId",
  "workspaceApiHash",
  phone,
  "companyId",
  status
)
VALUES (
  'mtproto_prod_1',
  'Main Channel Parser',
  12345678,
  '0123456789abcdef0123456789abcdef',
  '+1234567890',  -- Your Telegram phone number
  (SELECT id FROM "Workspace" WHERE slug = 'cartie' LIMIT 1),
  'DISCONNECTED'
);
```

**Option B: Use Admin UI** (TODO: implement):
1. Go to `/integrations`
2. Click "Add MTProto Connector"
3. Enter API ID, Hash, Phone
4. Trigger authentication flow (2FA code)
5. Store session string

**After Authentication**:
- Session string will be stored in `MTProtoConnector.sessionString`
- Status will change to `READY`
- Worker will start polling channels

---

## 3. CHANNEL SOURCES (After MTProto Connected)

### Get Channel ID

**Public Channel**:
- Username: `@example_channel`
- Forward message from channel to [@userinfobot](https://t.me/userinfobot)
- Copy channel ID (e.g., `-1001234567890`)

**Private Channel**:
- Use MTProto client to resolve channel
- Or check Telegram app → Channel Info → Invite Link → extract ID

### Add Channel Source

```sql
INSERT INTO "ChannelSource" (
  id,
  "connectorId",
  "channelId",
  username,
  title,
  "importRules",
  status
)
VALUES (
  'chsrc_prod_1',
  'mtproto_prod_1',
  '-1001234567890',
  'example_channel',
  'Example Auto Channel',
  '{
    "autoPublish": true,
    "filterKeywords": ["BMW", "Mercedes", "Audi"],
    "minYear": 2015,
    "mapTo": {}
  }'::jsonb,
  'ACTIVE'
);
```

**Import Rules**:
- `autoPublish`: If `true`, imported cars appear in inventory immediately
- `filterKeywords`: Only import posts containing these keywords
- `minYear`: Minimum car year to import
- `mapTo`: Brand/city mapping overrides (e.g., `{"brand": "BMW"}`)

---

## 4. SENDPULSE API (Email/SMS)

### Get API Credentials

1. Go to SendPulse dashboard → Settings → API
2. Copy:
   - **ID**: e.g. `abc123...`
   - **Secret**: e.g. `xyz789...`

### Add to SystemSettings

```sql
UPDATE "SystemSettings"
SET 
  "sendpulseId" = 'YOUR_SENDPULSE_ID',
  "sendpulseSecret" = 'YOUR_SENDPULSE_SECRET'
WHERE id = 1;
```

**Verify API works**:
```bash
# Check backend logs after updating
docker logs infra2-api-1 --tail 20

# Should see: "SendPulse API initialized" (if service checks on startup)
```

---

## 5. META PIXEL / CAPI (Facebook Events)

### Get Pixel ID & Access Token

1. Go to Facebook Events Manager → Data Sources
2. Select your Pixel
3. Copy **Pixel ID**: e.g., `123456789012345`
4. Go to Settings → Conversions API → Generate Access Token
5. Copy **Token**: e.g., `EAABsbCS...`

### Optional: Test Event Code

1. In Events Manager → Test Events
2. Copy **Test Event Code**: e.g., `TEST12345`

### Add to SystemSettings

```sql
UPDATE "SystemSettings"
SET 
  "metaPixelId" = '123456789012345',
  "metaToken" = 'EAABsbCS...',
  "metaTestCode" = 'TEST12345'
WHERE id = 1;
```

**Test Integration**:
1. Create a lead in system (e.g., submit form on `/p/request`)
2. Check Meta Events Manager → Test Events
3. Should see `Lead` event appear within 1-2 minutes

---

## 6. ENVIRONMENT VARIABLES (.env)

**Minimal Required**:
```env
# Database
DATABASE_URL=postgresql://cartie:YOUR_DB_PASSWORD@127.0.0.1:5433/cartie_db

# JWT Secret (generate random string)
JWT_SECRET=your_strong_random_secret_here

# Admin Credentials (for seed)
SEED_ADMIN_EMAIL=admin@cartie.com
SEED_ADMIN_PASSWORD=changeme_in_production
SEED_SUPERADMIN_EMAIL=super@cartie.com
SEED_SUPERADMIN_PASSWORD=changeme_in_production

# MTProto (from https://my.telegram.org/apps)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=0123456789abcdef0123456789abcdef

# Optional: Seed Demo Data
SEED_DEMO=false  # Set to 'true' for demo bots/inventory
```

**After editing `.env`**:
```bash
# Rebuild and restart API container
cd /srv/cartie
./infra/deploy_prod.sh
```

---

## 7. VERIFICATION CHECKLIST

After adding credentials, verify each integration:

### Bot
- [ ] Bot token added to `BotConfig`
- [ ] Bot status shows "Running" in `/telegram` page
- [ ] Send `/start` to bot in Telegram → receive response

### MTProto
- [ ] API ID/Hash in `.env`
- [ ] MTProto connector created (status: `READY`)
- [ ] Channel source added (status: `ACTIVE`)
- [ ] Check inventory page → new cars imported from channel (wait 5 min)

### SendPulse
- [ ] ID/Secret in `SystemSettings`
- [ ] Test email sent (if module implemented)

### Meta Pixel
- [ ] Pixel ID/Token in `SystemSettings`
- [ ] Submit test lead → check Meta Events Manager
- [ ] Event appears with correct parameters

---

## TROUBLESHOOTING

### Bot Not Responding
1. Check token is correct: `SELECT token FROM "BotConfig" WHERE id = 'bot_prod_main'`
2. Check bot is enabled: `UPDATE "BotConfig" SET "isEnabled" = true WHERE id = 'bot_prod_main'`
3. Check backend logs: `docker logs infra2-api-1 --tail 100 | grep "bot_prod_main"`
4. Verify polling is active: `docker logs infra2-api-1 | grep "polling started"`

### MTProto Not Importing
1. Check connector status: `SELECT status FROM "MTProtoConnector" WHERE id = 'mtproto_prod_1'`
2. If `DISCONNECTED`: Need to run authentication flow (manual for now)
3. Check worker logs: `docker logs infra2-api-1 | grep "mtproto"`
4. Verify channel ID is correct: `SELECT * FROM "ChannelSource"`

### Meta Events Not Tracking
1. Check Pixel ID: `SELECT "metaPixelId" FROM "SystemSettings" WHERE id = 1`
2. Verify token has `ads_management` permission
3. Check backend logs: `docker logs infra2-api-1 | grep "meta"`
4. Use Meta Event Debugger: https://developers.facebook.com/tools/debug/events

---

## NEXT STEPS

After credentials configured:
1. **Test All Flows**: Create lead → check Telegram, inventory, Meta
2. **Monitor Logs**: `docker logs infra2-api-1 --tail 100 --follow`
3. **Setup Monitoring**: Optional: add Sentry, LogRocket, etc.
4. **Backup Database**: `pg_dump` via script (TODO: automate)

---

**Need Help?**
- Check `docs/ARCHITECTURE.md` for system overview
- Check `docs/AUDIT.md` for known issues
- Check backend logs: `docker logs infra2-api-1 --tail 200`
