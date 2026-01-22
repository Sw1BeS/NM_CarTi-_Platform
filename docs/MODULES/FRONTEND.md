# Frontend Module

> **Purpose**: React web application  
> **Location**: `apps/web/src/`

---

## Overview

Vite + React + Tailwind v4 single-page application with:
- Admin dashboard
- Public request forms
- Bot management UI
- Multi-language support (i18n)
- Dark mode theme

---

## Structure

```
apps/web/src/
├── index.tsx                   # Entry point
├── App.tsx                     # Router + auth
├── index.css                   # Global styles + Tailwind imports
├── pages/                      # Route pages
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Leads.tsx
│   ├── Requests.tsx
│   ├── Inventory.tsx
│   ├── TelegramHub.tsx
│   ├── ScenarioBuilder.tsx
│   └── ... (20+ pages)
├── components/                 # Shared UI
│   ├── Layout.tsx
│   ├── CommandPalette.tsx
│   └── ...
├── contexts/                   # React Context providers
│   ├── AuthContext.tsx
│   ├── CompanyContext.tsx
│   ├── LanguageContext.tsx
│   └── ThemeContext.tsx
├── services/                   # Client logic
│   ├── api.ts                 # API client
│   ├── botEngine.ts
│   ├── contentGenerator.ts
│   └── ...
├── types.ts                    # TypeScript types
└── translations.ts             # i18n strings
```

---

## Styling Stack

**Confirmed** (via measurement):
- **Tailwind v4**: `tailwindcss@4.1.18`
- **Design tokens**: CSS variables in `tailwind.config.js` (`--background`, `--primary`, etc.)
- **Inline styles**: Only 27 occurrences (93% className usage)
- **Custom palette**: Metallic theme + Cartie brand colors

### Design Tokens

Colors defined in `tailwind.config.js`:
- `background`, `foreground`
- `primary`, `secondary`, `accent`
- `metallic` (100-900 scale for automotive theme)
- `cartie.black`, `cartie.charcoal`, `cartie.glass`

---

## Key Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | Login | Authentication |
| `/` | Dashboard | Overview stats |
| `/leads` | Leads | Lead management |
| `/requests` | Requests | B2B requests |
| `/inventory` | Inventory | Car catalog |
| `/telegram-hub` | TelegramHub | Bot management |
| `/scenario-builder` | ScenarioBuilder | Conversation flows |
| `/integrations` | Integrations | Third-party services |

---

## State Management

- **Auth**: `AuthContext` (JWT, user profile)
- **Company**: `CompanyContext` (workspace isolation)
- **Language**: `LanguageContext` (ru/uk via `translations.ts`)
- **Theme**: `ThemeContext` (light/dark mode)

---

## API Integration

All API calls via `services/api.ts`:
```typescript
import api from '@/services/api';

// GET
const leads = await api.get('/leads');

// POST
const newLead = await api.post('/leads', { name, phone });
```

---

## Verification Checklist

✅ Login works and redirects to dashboard  
✅ All navigation links work  
✅ Data loads from API correctly  
✅ Forms submit successfully  
✅ Dark mode toggles  
✅ Language switching works (ru/uk)  
✅ No console errors  
✅ Responsive on mobile

---

## Phase 2 Plan (Minor Cleanup)

Target: Reduce 27 inline styles to <10
- Audit remaining `style=` attributes
- Convert to Tail wind classes
- Document common patterns in this file

---

**Owner**: Frontend domain  
**Last Updated**: 2026-01-22
