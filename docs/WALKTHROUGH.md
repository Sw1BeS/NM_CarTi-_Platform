# Walkthrough: Production Readiness Updates

## 1. Data Seeding Strategy
We have separated "System/Production" data from "Demo" data.
- **Production (Always)**:
  - `System` Company + Admin User
  - `Cartie Auto` Company (Main Workspace) (Stage C/D)
  - Entity Definitions, Normalization Rules, Templates
- **Demo (Optional)**:
  - Enabled via `SEED_DEMO=true`
  - `Demo Motors` Company
  - Dummy Cars (BMW/Mercedes)
  - Dummy Leads/Requests
  - Demo Bot Tokens

## 2. Meta Integration (CAPI)
We have wired Server-side Events for robust tracking.

### Request Submission (`SubmitApplication`)
Triggered in `requests.routes.ts` upon B2B Request creation.
```typescript
MetaService.getInstance().sendEvent('SubmitApplication', {
    client_ip_address: req.ip
}, {
    content_name: request.title,
    value: request.budgetMax
})
```

### Lead Creation (`Lead`)
Triggered in `leadService.ts` (Telegram/MiniApp sources).
```typescript
MetaService.getInstance().sendEvent('Lead', {
    ph: phone
}, {
    content_name: 'Lead ' + name
})
```

## 3. SendPulse Integration (New)
Added `SendPulseService` for email marketing.
- **Service**: `src/modules/Integrations/sendpulse/user_service.ts`
- **UI**: Added configuration card in `Settings.tsx`
- **Features**: Token management, `syncContact` method.

## 4. User Experience
### Language Switcher
Added to the Topbar in `Layout.tsx`.
- Supports: EN / UK / RU
- Persists via `localStorage`
- Updates UI instantly via `LangContext`

### Empty States
(Planned for next sprint, P2)

## Verification
- `npm run build`: ✅ Passed
- `npm run build`: ✅ Passed
- `npx tsc`: ✅ Passed (Types Fixed)
- `Security Scan`: ✅ Passed (Mitigated)
  - `dangerouslySetInnerHTML`: Found 2 instances in `Requests.tsx` and `Content.tsx`. Verified `DOMPurify` usage. Status: **Safe**.
