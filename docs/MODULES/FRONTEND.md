# Frontend Module

> Purpose: React web application
> Location: apps/web/src

## Structure
```
apps/web/src/
├── index.tsx
├── App.tsx
├── index.css
├── components/
├── contexts/
├── modules/Telegram/
├── pages/
│   ├── app/
│   ├── public/
│   └── superadmin/
├── providers/
├── services/
├── types/
├── translations.ts
└── translations.empty-states.ts
```

## Routing Entrypoints
- Router: `App.tsx` (HashRouter)
- Public pages: `/login`, `/p/request`, `/p/dealer`, `/p/proposal/:id`, `/p/app`
- App pages: `/`, `/requests`, `/inventory`, `/integrations`, `/telegram`, `/superadmin/*`

## State Management
- Contexts: Auth, Company, Language, Theme, Toast, Worker

## Styling
- Tailwind v4 with design tokens in `apps/web/tailwind.config.js`
- Inline style usage: 23 occurrences in `apps/web/src` (baseline)

## Verification Checklist
- Login renders and routes to dashboard
- Protected routes redirect when unauthenticated
- Key lists load (leads, requests, inventory)
- Telegram Hub renders without console errors

Last updated: 2026-01-22
