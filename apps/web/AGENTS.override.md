# Web Rules

## Scope

- This subtree owns the platform/admin UI, public pages, and Telegram Mini App experience.
- For Mini App work, prefer Telegram-native affordances over generic mobile-web patterns.

## Do not

- Do not turn the Mini App into a standalone website that ignores Telegram `BackButton`, `MainButton`, viewport, theming, or closing behavior.
- Do not create new admin silos or duplicate navigation ownership.
- Do not model showcases as separate stock pools in UI copy or IA.

## Prefer

- Existing pages and services under `pages/app`, `pages/public`, `pages/public/miniapp`, and `services/`.
- Behavior-level decomposition of large pages instead of broad rewrites.
- Route-level and surface-level consistency: request, status, favorites, queue views, and inventory/showcase semantics should align with canonical docs.
- For Mini App bootstrap issues, prefer read-only preview fallback outside Telegram when read endpoints are public; reserve hard blocking for flows that truly cannot function without Telegram context.
- Missing `initData` should surface as a clear Ukrainian warning banner, not as a generic “not connected” dead end.

## Validation

- Run `cd apps/web && npm run build` after substantial UI changes.
- Call out chunk-size warnings, missing tests, and any Mini App-specific regression risk.
