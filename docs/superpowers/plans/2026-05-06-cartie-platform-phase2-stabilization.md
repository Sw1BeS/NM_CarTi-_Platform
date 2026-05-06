# CarTie Platform Phase 2 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed MiniApp/media/favorites/request issues from `docs/docs_analysis_CARTIE_PLATFORM_DETAILED_ANALYSIS_diff.md` while avoiding a large redesign or schema-heavy rewrite.

**Architecture:** Normalize data/media at API boundaries first, then improve the MiniApp UI components that consume that data, then tighten request semantics and analytics. Keep current Telegram menu/deep-link stabilization intact and preserve the existing dark MiniApp shell. Use small helpers with focused tests instead of editing large components blindly.

**Tech Stack:** Express, Prisma/Postgres, Vitest, React 19, Vite, Tailwind classes, lucide-react, Playwright/browser smoke checks, Telegram Bot API.

---

## Audit Verdict

### Confirmed By Current Code And DB

- `CatalogView.tsx` defines 9 `CarSpecs` fields but the catalog card renders only engine, mileage, fuel, and condition at `apps/web/src/pages/public/miniapp/views/CatalogView.tsx:268-272`.
- `MiniApp.tsx` can extract `brand/model/engine/fuel/transmission/drive/color/vin/condition` at `apps/web/src/pages/public/MiniApp.tsx:930-943`; the detail page renders more fields than the catalog card.
- Non-Telegram favorites are still blocked in the UI at `apps/web/src/pages/public/MiniApp.tsx:422-428`, even though REST and DB support `visitorId`.
- Backend favorites also require Telegram `initData` at `apps/server/src/routes/miniAppRoutes.ts:613-614`; this conflicts with a non-Telegram favorites goal.
- MiniApp request submit is blocked outside Telegram at `apps/web/src/pages/public/MiniApp.tsx:1345-1348`, and server writes also require `initData`.
- Multi-select request semantics are implicit only: `MiniAppService.createRequest` stores selected car IDs in JSON payload but has no explicit `subtype` or manager-facing meaning.
- Lightbox has previous/next buttons and `1 / N` counter, but lacks image loading state, preload, swipe navigation, and share action at `apps/web/src/pages/public/MiniApp.tsx:1560-1609`.
- Production browser check shows broken media URLs: images request `http://localhost:3000/api/proxy/...` and fail with `ERR_CONNECTION_REFUSED`.
- DB evidence on 2026-05-06: `CarListing` total 44, `AVAILABLE` 10, `PENDING` 12; only 1 listing has `specs.transmission`, 12 have `specs.drive`, 0 have `specs.color`, 0 have `specs.vin`.
- DB evidence also shows media pollution: some records have 551 `mediaUrls` and 551 `mediaItems`, so dedupe/normalization is a real data problem, not only UI.
- `apps/web/index.html` loads `https://cdn.tailwindcss.com`, and the browser console warns it should not be used in production.
- Card style settings are enabled via `FF_CAR_CARD_V2=true`, but active bots have no `config.cardSettings`; current defaults include placeholder phones and generic social links.

### Partially Confirmed Or Outdated

- The document's `apps/web/src/services/botEngine.ts` single-photo issue is real in legacy/admin web code, and that file is still imported by `Inbox.tsx` and `WorkerContext.tsx`. It is not the main production Telegram runtime path for lead bot result cards.
- Current server runtime already uses media groups in `apps/server/src/modules/Communication/bots/scenario-engine/actions/car-card.actions.ts:27-38` and `/api/miniapp/share-car` uses `sendMediaGroup` for multiple photos.
- "Bot is not integrated with DB" is outdated for the current CLIENT_LEAD wizard: `leadBuyWizard.ts` searches `CarListing` and external fallback. The real problem is narrower: matching is brand/title heavy, only searches `AVAILABLE`, and does not use richer specs well.
- External client resource URLs from the audit are live by direct HTTP checks, but follower/view counts and content volume were not treated as current facts.
- "80% lost users" for non-Telegram favorites is not proven by code/DB. Treat it as a product hypothesis; the code does currently block that use case.

### Missing From The Original Document

- Media URL normalization must be fixed before card/lightbox polish, otherwise better UI still renders broken images.
- Media dedupe needs a repair script and tests; current DB has hundreds of duplicated media entries per some listing.
- Public browser mode needs an explicit product/security decision: read-only preview is fine, visitorId favorites are low risk, but non-Telegram request submit needs anti-spam guardrails.
- Card settings should be moved into bot/showcase config so CarTié contacts, address, channels, and social links are not hard-coded defaults.
- Add event analytics at the server API boundary, not only client `CustomEvent`, so conversion can be measured across Telegram and browser sessions.
- UI/UX implementation should not start as a broad redesign. Follow the current design system, fix image/spec hierarchy, use bottom-sheet filters, and verify mobile/desktop screenshots before shipping.

## File Structure

- Create `apps/server/src/services/mediaUrl.service.ts`: normalize media URLs for web API output and Telegram absolute URLs.
- Create `apps/server/src/services/mediaUrl.service.test.ts`: regression tests for localhost proxy URL normalization, dedupe, and absolute public URL generation.
- Modify `apps/server/src/services/dto.ts`: normalize `thumbnail`, `mediaUrls`, and `mediaItems` returned by MiniApp inventory APIs.
- Modify `apps/server/src/modules/Communication/telegram/core/utils/carMedia.ts`: normalize media sources before `sendMediaGroup`/`sendPhoto`.
- Create `apps/server/scripts/audit_miniapp_media.ts`: read-only media/spec audit script.
- Create `apps/server/scripts/repair_miniapp_media_urls.ts`: dry-run-by-default repair script for duplicate/broken media URLs.
- Modify `apps/web/src/pages/public/miniapp/views/CatalogView.tsx`: render richer spec tiles and improve card hierarchy without a full redesign.
- Modify `apps/web/src/pages/public/MiniApp.tsx`: non-TG visitorId favorites, lightbox preload/loading/swipe/share, request subtype state, analytics events.
- Modify `apps/web/src/pages/public/miniapp/views/RequestView.tsx`: explicit multi-select subtype controls.
- Modify `apps/web/src/services/miniappApi.ts`: send `visitorId`, `requestSubtype`, and analytics payload fields.
- Modify `apps/server/src/routes/miniAppRoutes.ts`: allow visitorId-only favorite toggles without Telegram initData, add event endpoint, preserve initData requirement for request submit unless explicitly relaxed later.
- Modify `apps/server/src/services/miniapp.service.ts`: persist `request.subtype`, emit request/favorite analytics, keep `submitId` idempotency.
- Modify `apps/server/src/services/cardSettings.resolver.ts`: add CarTié defaults that match production contacts only when bot/showcase config is absent.
- Modify `apps/server/src/services/carCardRenderer.v2.ts`: ensure `PENDING` maps to in-transit style and contacts are config-driven.
- Modify `apps/web/index.html`: remove Tailwind CDN script and add `mobile-web-app-capable`.

---

## Task 1: Media URL Normalization And Dedupe

**Files:**
- Create: `apps/server/src/services/mediaUrl.service.ts`
- Create: `apps/server/src/services/mediaUrl.service.test.ts`
- Modify: `apps/server/src/services/dto.ts`
- Modify: `apps/server/src/modules/Communication/telegram/core/utils/carMedia.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/server/src/services/mediaUrl.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectNormalizedMediaUrls, normalizeMediaUrl } from './mediaUrl.service.js';

describe('mediaUrl.service', () => {
  it('rewrites localhost proxy URLs to same-origin paths for MiniApp API output', () => {
    expect(normalizeMediaUrl('http://localhost:3000/api/proxy/mtproto/bot/chat/1')).toBe('/api/proxy/mtproto/bot/chat/1');
    expect(normalizeMediaUrl('http://127.0.0.1:3000/storage/media/a.jpg')).toBe('/storage/media/a.jpg');
  });

  it('builds absolute public URLs for Telegram media sends', () => {
    const url = normalizeMediaUrl('/api/proxy/mtproto/bot/chat/1', {
      absolute: true,
      publicBaseUrl: 'https://cartie2.umanoff-analytics.space'
    });
    expect(url).toBe('https://cartie2.umanoff-analytics.space/api/proxy/mtproto/bot/chat/1');
  });

  it('deduplicates thumbnail, mediaUrls, and mediaItems while preserving order', () => {
    const media = collectNormalizedMediaUrls({
      thumbnail: 'http://localhost:3000/api/proxy/a',
      mediaUrls: ['http://localhost:3000/api/proxy/a', '/api/proxy/b'],
      mediaItems: [{ url: '/api/proxy/b' }, { previewUrl: '/api/proxy/c' }]
    });
    expect(media).toEqual(['/api/proxy/a', '/api/proxy/b', '/api/proxy/c']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm --prefix apps/server test -- mediaUrl.service.test.ts
```

Expected: FAIL because `mediaUrl.service.ts` does not exist.

- [ ] **Step 3: Implement media URL helper**

Create `apps/server/src/services/mediaUrl.service.ts`:

```ts
const DEFAULT_PUBLIC_BASE_URL = 'https://cartie2.umanoff-analytics.space';

const clean = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const publicBase = (override?: string) => {
  return String(override || process.env.PUBLIC_BASE_URL || process.env.MINIAPP_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
};

export const normalizeMediaUrl = (
  value: unknown,
  options: { absolute?: boolean; publicBaseUrl?: string } = {}
): string => {
  const raw = clean(value);
  if (!raw) return '';

  let next = raw;
  try {
    const parsed = new URL(raw);
    const isLocalApi = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)
      && ['3000', '3001', '3002', '8080', '8082'].includes(parsed.port || '');
    if (isLocalApi) {
      next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    next = raw;
  }

  if (options.absolute && next.startsWith('/')) {
    return `${publicBase(options.publicBaseUrl)}${next}`;
  }

  return next;
};

const readMediaItem = (item: unknown): string[] => {
  if (!item) return [];
  if (typeof item === 'string') return [item];
  if (typeof item !== 'object' || Array.isArray(item)) return [];
  const raw = item as Record<string, unknown>;
  return [raw.url, raw.previewUrl, raw.tgFileId, raw.fileId, raw.media]
    .map(value => normalizeMediaUrl(value))
    .filter(Boolean);
};

export const collectNormalizedMediaUrls = (
  car: Record<string, unknown>,
  options: { limit?: number; absolute?: boolean; publicBaseUrl?: string } = {}
): string[] => {
  const limit = Math.max(1, Number(options.limit || 1000));
  const candidates = [
    car.thumbnail,
    ...(Array.isArray(car.mediaUrls) ? car.mediaUrls : []),
    ...(Array.isArray(car.mediaItems) ? car.mediaItems.flatMap(readMediaItem) : [])
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const url = normalizeMediaUrl(candidate, options);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= limit) break;
  }
  return result;
};
```

- [ ] **Step 4: Wire helper into API output**

Modify the media block inside `mapInventoryOutput` in `apps/server/src/services/dto.ts`:

```ts
import { collectNormalizedMediaUrls, normalizeMediaUrl } from './mediaUrl.service.js';
```

Replace current `mediaUrls`, `mediaItems`, and `thumbnail` computation with:

```ts
const mediaItems = Array.isArray(car.mediaItems)
  ? (car.mediaItems as unknown[]).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const raw = item as Record<string, unknown>;
    return {
      ...raw,
      url: normalizeMediaUrl(raw.url),
      previewUrl: normalizeMediaUrl(raw.previewUrl)
    };
  })
  : [];
const mediaUrls = collectNormalizedMediaUrls({
  thumbnail: car.thumbnail,
  mediaUrls: Array.isArray(car.mediaUrls) ? car.mediaUrls : [],
  mediaItems
});
const thumbnail = normalizeMediaUrl(car.thumbnail) || mediaUrls[0] || '';
```

- [ ] **Step 5: Wire helper into Telegram media sends**

Modify `apps/server/src/modules/Communication/telegram/core/utils/carMedia.ts`:

```ts
import { normalizeMediaUrl } from '../../../../../services/mediaUrl.service.js';
```

Inside `collectCarMediaSources`, replace `const key = candidate.trim();` with:

```ts
const key = normalizeMediaUrl(candidate, { absolute: true }).trim();
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm --prefix apps/server test -- mediaUrl.service.test.ts carMedia.test.ts showcase.service.miniapp.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/mediaUrl.service.ts apps/server/src/services/mediaUrl.service.test.ts apps/server/src/services/dto.ts apps/server/src/modules/Communication/telegram/core/utils/carMedia.ts
git commit -m "fix: normalize miniapp media urls"
```

---

## Task 2: Media Audit And Safe Repair Scripts

**Files:**
- Create: `apps/server/scripts/audit_miniapp_media.ts`
- Create: `apps/server/scripts/repair_miniapp_media_urls.ts`

- [ ] **Step 1: Add read-only audit script**

Create `apps/server/scripts/audit_miniapp_media.ts`:

```ts
import { prisma } from '../src/services/prisma.js';
import { collectNormalizedMediaUrls } from '../src/services/mediaUrl.service.js';

const rows = await prisma.carListing.findMany({
  select: { id: true, title: true, status: true, thumbnail: true, mediaUrls: true, mediaItems: true, specs: true },
  orderBy: { createdAt: 'desc' }
});

const summary = rows.reduce((acc, car) => {
  const normalized = collectNormalizedMediaUrls(car as any);
  const rawCount = (car.thumbnail ? 1 : 0)
    + (Array.isArray(car.mediaUrls) ? car.mediaUrls.length : 0)
    + (Array.isArray(car.mediaItems) ? car.mediaItems.length : 0);
  if (rawCount !== normalized.length) acc.needsDedupe += 1;
  if (normalized.some(url => url.includes('localhost') || url.includes('127.0.0.1'))) acc.hasLocalhost += 1;
  if ((car.specs as any)?.transmission) acc.hasTransmission += 1;
  if ((car.specs as any)?.drive) acc.hasDrive += 1;
  if ((car.specs as any)?.color) acc.hasColor += 1;
  if ((car.specs as any)?.vin) acc.hasVin += 1;
  acc.total += 1;
  return acc;
}, { total: 0, needsDedupe: 0, hasLocalhost: 0, hasTransmission: 0, hasDrive: 0, hasColor: 0, hasVin: 0 });

console.log(JSON.stringify(summary, null, 2));
await prisma.$disconnect();
```

- [ ] **Step 2: Add dry-run repair script**

Create `apps/server/scripts/repair_miniapp_media_urls.ts`:

```ts
import { prisma } from '../src/services/prisma.js';
import { collectNormalizedMediaUrls, normalizeMediaUrl } from '../src/services/mediaUrl.service.js';

const apply = process.argv.includes('--apply');
const rows = await prisma.carListing.findMany({
  select: { id: true, thumbnail: true, mediaUrls: true, mediaItems: true }
});

let changed = 0;
for (const car of rows) {
  const normalized = collectNormalizedMediaUrls(car as any);
  const nextThumbnail = normalized[0] || normalizeMediaUrl(car.thumbnail) || null;
  const nextMediaUrls = normalized;
  const nextMediaItems = Array.isArray(car.mediaItems)
    ? car.mediaItems
      .map((item: any) => item && typeof item === 'object'
        ? { ...item, url: normalizeMediaUrl(item.url), previewUrl: normalizeMediaUrl(item.previewUrl) }
        : item)
      .filter((item: any, index: number, arr: any[]) => {
        const key = String(item?.url || item?.previewUrl || item || '').trim();
        return key && arr.findIndex((other: any) => String(other?.url || other?.previewUrl || other || '').trim() === key) === index;
      })
    : [];

  const currentCount = (car.thumbnail ? 1 : 0) + (car.mediaUrls?.length || 0) + (Array.isArray(car.mediaItems) ? car.mediaItems.length : 0);
  const nextCount = (nextThumbnail ? 1 : 0) + nextMediaUrls.length + nextMediaItems.length;
  if (currentCount === nextCount && nextMediaUrls.every(url => !url.includes('localhost'))) continue;

  changed += 1;
  console.log(`${apply ? 'repair' : 'dry-run'} ${car.id}: ${currentCount} -> ${nextCount}`);
  if (apply) {
    await prisma.carListing.update({
      where: { id: car.id },
      data: { thumbnail: nextThumbnail, mediaUrls: nextMediaUrls, mediaItems: nextMediaItems as any }
    });
  }
}

console.log(JSON.stringify({ apply, changed }, null, 2));
await prisma.$disconnect();
```

- [ ] **Step 3: Run dry-run audit**

Run:

```bash
npm --prefix apps/server exec -- tsx scripts/audit_miniapp_media.ts
npm --prefix apps/server exec -- tsx scripts/repair_miniapp_media_urls.ts
```

Expected: commands complete; repair script prints `dry-run` lines only.

- [ ] **Step 4: Apply only after reviewing dry-run output**

Run:

```bash
npm --prefix apps/server exec -- tsx scripts/repair_miniapp_media_urls.ts --apply
npm --prefix apps/server exec -- tsx scripts/audit_miniapp_media.ts
```

Expected: no `localhost` media in API output and dedupe count decreases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/audit_miniapp_media.ts apps/server/scripts/repair_miniapp_media_urls.ts
git commit -m "chore: add miniapp media audit repair scripts"
```

---

## Task 3: Catalog Card Spec Tiles And Visual Hierarchy

**Files:**
- Modify: `apps/web/src/pages/public/miniapp/views/CatalogView.tsx`
- Modify: `apps/web/src/pages/public/MiniApp.tsx`

- [ ] **Step 1: Capture current UI baseline**

Run production-local browser check:

```bash
# Use Playwright/browser at 390x844:
# http://127.0.0.1:8082/p/app/cartie?entry=inventory&status=AVAILABLE
```

Expected current baseline: catalog shows only 4 spec cells and broken images before Task 1 repair.

- [ ] **Step 2: Add spec tile helper inside `CatalogView.tsx`**

Add above `export const CatalogView`:

```tsx
const compactVin = (vin: string) => {
  const value = String(vin || '').trim();
  if (!value) return '';
  return value.length > 8 ? `...${value.slice(-6)}` : value;
};

const buildSpecTiles = (specs: CarSpecs, mileage: string) => {
  return [
    { label: 'Двигун', value: specs.engine },
    { label: 'Пробіг', value: mileage },
    { label: 'Паливо', value: specs.fuel },
    { label: 'КПП', value: specs.transmission },
    { label: 'Привід', value: specs.drive },
    { label: 'Колір', value: specs.color },
    { label: 'Стан', value: specs.condition },
    { label: 'VIN', value: compactVin(specs.vin) }
  ].filter(tile => String(tile.value || '').trim());
};
```

- [ ] **Step 3: Replace the 2x2 hard-coded grid**

Replace `apps/web/src/pages/public/miniapp/views/CatalogView.tsx:268-273` with:

```tsx
<div className="grid grid-cols-2 gap-2 text-xs text-white/70 mb-4">
  {buildSpecTiles(specs, formatMileage(car.mileage)).slice(0, 6).map(tile => (
    <div key={tile.label} className="bg-black/30 p-2 rounded text-center border border-white/5 min-h-[48px] flex flex-col justify-center">
      <div className="text-[9px] text-white/40 uppercase font-bold leading-none mb-1">{tile.label}</div>
      <div className="font-semibold text-white/80 truncate">{tile.value || '—'}</div>
    </div>
  ))}
</div>
```

- [ ] **Step 4: Improve title and price hierarchy without redesign**

In the card info block, keep the existing structure but ensure price remains the primary text:

```tsx
<div className="flex justify-between items-start gap-3 mb-4">
  <div className="text-2xl font-black leading-tight" style={{ color: primaryColor }}>{formatPrice(car.price)}</div>
  <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded shrink-0">{toNumberSafe(car.year) || '—'}</div>
</div>
```

- [ ] **Step 5: Verify build**

Run:

```bash
npm --prefix apps/web run build
```

Expected: PASS.

- [ ] **Step 6: Browser verify mobile and desktop**

Check:

```bash
http://127.0.0.1:8082/p/app/cartie?entry=inventory&status=AVAILABLE
http://127.0.0.1:8082/p/app/cartie?entry=inventory&status=PENDING
```

Expected:
- no horizontal overflow at 390x844;
- card image loads;
- visible spec tiles include transmission/drive/color/VIN only when data exists;
- missing data does not create a grid full of dashes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/public/miniapp/views/CatalogView.tsx
git commit -m "fix: show richer miniapp catalog specs"
```

---

## Task 4: VisitorId Favorites Outside Telegram

**Files:**
- Modify: `apps/web/src/pages/public/MiniApp.tsx`
- Modify: `apps/server/src/routes/miniAppRoutes.ts`
- Modify: `apps/server/src/services/miniapp.service.ts`
- Test: `apps/server/src/services/miniapp.service.test.ts`

- [ ] **Step 1: Write service test for visitorId favorite identity**

Create or extend `apps/server/src/services/miniapp.service.test.ts` with a Prisma mock following local service test patterns:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const deleteMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    carListing: { findUnique },
    miniAppFavorite: { findFirst, create, delete: deleteMock }
  }
}));

vi.mock('./publicSlug.service.js', () => ({
  resolvePublicSlug: vi.fn(async () => ({ companyId: 'company_1', slug: 'cartie' }))
}));

const { miniAppService } = await import('./miniapp.service.js');

describe('MiniAppService favorites', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a favorite using visitorId when Telegram user id is absent', async () => {
    findUnique.mockResolvedValue({ id: 'car_1', companyId: 'company_1' });
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'fav_1' });

    const result = await miniAppService.toggleFavorite('car_1', { visitorId: 'visitor_1' }, 'cartie');

    expect(result).toEqual({ action: 'added', favoriteId: 'fav_1' });
    expect(create).toHaveBeenCalledWith({
      data: {
        companyId: 'company_1',
        carListingId: 'car_1',
        tgUserId: null,
        visitorId: 'visitor_1'
      }
    });
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm --prefix apps/server test -- miniapp.service.test.ts
```

Expected: PASS if service already supports visitorId; keep it as regression coverage.

- [ ] **Step 3: Relax favorite route auth only for visitorId**

In `apps/server/src/routes/miniAppRoutes.ts`, replace the unconditional init check for favorites with:

```ts
const allowVisitorFavorite = Boolean(visitorId) && !tgUserId;
if (!allowVisitorFavorite) {
  const initCheck = await requireInitData(initData, companyId, botId);
  if (!initCheck.ok) return errorResponse(res, 401, initCheck.message || 'Unauthorized');
}
```

Keep request submit auth unchanged in this task.

- [ ] **Step 4: Remove UI block in `toggleFavorite`**

Replace `apps/web/src/pages/public/MiniApp.tsx:425-428` with:

```tsx
if (!hasTelegramInit) {
  setConfigWarning(null);
}
```

Keep the existing payload:

```tsx
const identity = {
  tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
  visitorId
};
```

- [ ] **Step 5: Add local fallback for API failure**

In the `catch` block of `toggleFavorite`, before pushing the error toast:

```tsx
if (!hasTelegramInit) {
  setFavorites(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  setFavoriteItems(prev => {
    const exists = prev.some(item => getCarId(item) === id);
    return exists ? prev.filter(item => getCarId(item) !== id) : [car, ...prev];
  });
  emitMiniAppEvent('warn', 'Stored favorite locally after API failure', { carId: id, visitorId });
  return;
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm --prefix apps/server test -- miniapp.service.test.ts
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Manual smoke:

```bash
curl -s -X POST http://127.0.0.1:3002/api/miniapp/favorites/car_01KGJEW1QHXQGNHYMD8W3VZ2R8 \
  -H 'content-type: application/json' \
  -d '{"slug":"cartie","visitorId":"plan_smoke_visitor"}'
```

Expected: JSON `ok: true` with `action: "added"` or `"removed"` and no `401 initData is required`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/public/MiniApp.tsx apps/server/src/routes/miniAppRoutes.ts apps/server/src/services/miniapp.service.test.ts
git commit -m "fix: allow visitor favorites in miniapp"
```

---

## Task 5: Lightbox Loading, Preload, Swipe, Share

**Files:**
- Modify: `apps/web/src/pages/public/MiniApp.tsx`

- [ ] **Step 1: Add lightbox state**

Add next to current gallery state:

```tsx
const [lightboxLoading, setLightboxLoading] = useState(false);
const touchStartXRef = useRef<number | null>(null);
```

- [ ] **Step 2: Add preload effect**

Add below `getCarImages` or near gallery state effects:

```tsx
useEffect(() => {
  if (!lightboxCar) return;
  const images = getCarImages(lightboxCar);
  const indexes = [
    lightboxImageIndex,
    lightboxImageIndex + 1,
    lightboxImageIndex - 1
  ].filter(index => index >= 0 && index < images.length);
  indexes.forEach(index => {
    const img = new Image();
    img.src = images[index];
  });
}, [lightboxCar, lightboxImageIndex]);
```

- [ ] **Step 3: Add navigation helpers**

Add before render:

```tsx
const moveLightbox = (delta: number) => {
  if (!lightboxCar) return;
  const images = getCarImages(lightboxCar);
  setLightboxImageIndex(prev => Math.max(0, Math.min(images.length - 1, prev + delta)));
};

const shareLightboxCar = async () => {
  if (!lightboxCar) return;
  const title = lightboxCar.title || 'CarTié';
  const url = `${window.location.origin}/p/app/${targetSlug || 'cartie'}?entry=inventory&carId=${encodeURIComponent(getCarId(lightboxCar))}`;
  if (navigator.share) {
    await navigator.share({ title, text: title, url }).catch(() => null);
  } else {
    await navigator.clipboard?.writeText(url).catch(() => null);
    pushToast('Посилання скопійовано.', 'success');
  }
};
```

- [ ] **Step 4: Wire image load and swipe**

In the lightbox image wrapper, add handlers:

```tsx
onTouchStart={(e) => { touchStartXRef.current = e.touches[0]?.clientX || null; }}
onTouchEnd={(e) => {
  const start = touchStartXRef.current;
  const end = e.changedTouches[0]?.clientX || null;
  touchStartXRef.current = null;
  if (start === null || end === null) return;
  const diff = end - start;
  if (Math.abs(diff) < 40) return;
  moveLightbox(diff > 0 ? -1 : 1);
}}
```

On `<img>`:

```tsx
onLoad={() => setLightboxLoading(false)}
onError={() => setLightboxLoading(false)}
onLoadStart={() => setLightboxLoading(true)}
```

Add loading overlay:

```tsx
{lightboxLoading && (
  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  </div>
)}
```

Add share button in header:

```tsx
<button
  onClick={shareLightboxCar}
  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"
>
  <Share2 size={18} className="text-white" />
</button>
```

Also import `Share2` from `lucide-react`.

- [ ] **Step 5: Verify**

Run:

```bash
npm --prefix apps/web run build
```

Browser checks:
- open a car with multiple images;
- next/prev click changes image;
- mobile swipe changes image;
- loading spinner appears briefly on slow image;
- share copies/opens native share without throwing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/public/MiniApp.tsx
git commit -m "feat: improve miniapp lightbox interactions"
```

---

## Task 6: Explicit Request Subtype For Multi-Select

**Files:**
- Modify: `apps/web/src/pages/public/MiniApp.tsx`
- Modify: `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
- Modify: `apps/web/src/services/miniappApi.ts`
- Modify: `apps/server/src/services/miniapp.service.ts`

- [ ] **Step 1: Add request subtype type**

In `apps/web/src/services/miniappApi.ts` add:

```ts
export type MiniAppRequestSubtype = 'GENERAL_SEARCH' | 'SPECIFIC_CAR' | 'MULTI_ANY_OF' | 'MULTI_COMPARE';
```

Extend `MiniAppRequestPayload`:

```ts
requestSubtype?: MiniAppRequestSubtype;
```

- [ ] **Step 2: Add frontend state**

In `MiniApp.tsx` near request form state:

```tsx
const [requestSubtype, setRequestSubtype] = useState<'GENERAL_SEARCH' | 'SPECIFIC_CAR' | 'MULTI_ANY_OF' | 'MULTI_COMPARE'>('GENERAL_SEARCH');
```

When `selectedRequestCarIds.length` changes, derive a safe default:

```tsx
useEffect(() => {
  if (selectedRequestCarIds.length > 1 && (requestSubtype === 'GENERAL_SEARCH' || requestSubtype === 'SPECIFIC_CAR')) {
    setRequestSubtype('MULTI_ANY_OF');
  }
  if (selectedRequestCarIds.length === 1 && requestSubtype.startsWith('MULTI_')) {
    setRequestSubtype('SPECIFIC_CAR');
  }
  if (selectedRequestCarIds.length === 0 && requestSubtype !== 'GENERAL_SEARCH') {
    setRequestSubtype('GENERAL_SEARCH');
  }
}, [selectedRequestCarIds.length, requestSubtype]);
```

- [ ] **Step 3: Extend RequestView props**

Add props:

```ts
requestSubtype: 'GENERAL_SEARCH' | 'SPECIFIC_CAR' | 'MULTI_ANY_OF' | 'MULTI_COMPARE';
setRequestSubtype: (value: 'GENERAL_SEARCH' | 'SPECIFIC_CAR' | 'MULTI_ANY_OF' | 'MULTI_COMPARE') => void;
```

Render in step 4 summary when `selectedCarsCount > 1`:

```tsx
<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-white/80">
  <p className="font-bold text-white mb-2">Як розглядати ці варіанти?</p>
  <label className="flex items-start gap-2 mb-2">
    <input
      type="radio"
      name="requestSubtype"
      value="MULTI_ANY_OF"
      checked={requestSubtype === 'MULTI_ANY_OF'}
      onChange={() => setRequestSubtype('MULTI_ANY_OF')}
    />
    <span>Хочу одне з цих авто, менеджер допоможе вибрати.</span>
  </label>
  <label className="flex items-start gap-2">
    <input
      type="radio"
      name="requestSubtype"
      value="MULTI_COMPARE"
      checked={requestSubtype === 'MULTI_COMPARE'}
      onChange={() => setRequestSubtype('MULTI_COMPARE')}
    />
    <span>Хочу порівняти ці авто між собою.</span>
  </label>
</div>
```

- [ ] **Step 4: Persist subtype in request payload**

In `MiniApp.tsx` request payload:

```tsx
requestSubtype,
payload: {
  mode: isB2BMode ? 'B2B' : 'LEAD',
  requestType,
  requestSubtype,
  mileage: reqMileage || undefined,
  fuel: reqFuel || undefined,
  companyName: reqCompany || undefined,
  selectedCars: selectedTitles.length ? selectedTitles : undefined
},
tracking: { ...trackingMeta, submitId, requestType, requestSubtype },
```

- [ ] **Step 5: Map subtype on backend without DB migration**

In `apps/server/src/services/miniapp.service.ts`, read subtype:

```ts
const requestSubtype = String(
  toOptionalString((input as any).requestSubtype)
  || toOptionalString((payloadFromInput as Record<string, unknown>).requestSubtype)
  || toOptionalString((tracking as Record<string, unknown>).requestSubtype)
  || (selectedCarIds.length > 1 ? 'MULTI_ANY_OF' : selectedCarIds.length === 1 ? 'SPECIFIC_CAR' : 'GENERAL_SEARCH')
);
```

Add it to `payload`:

```ts
requestSubtype,
request: {
  subtype: requestSubtype,
  carListingId: carListingId || undefined,
  carListingIds: selectedCarIds.length ? selectedCarIds : undefined,
  phone: phone || undefined,
  comment: comment || undefined
}
```

Add manager-readable description line:

```ts
if (requestSubtype) descriptionParts.push(`Тип запиту: ${requestSubtype}`);
```

- [ ] **Step 6: Verify**

Run:

```bash
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Manual check in MiniApp:
- select two cars;
- open request;
- step 4 shows subtype choice;
- submitted payload contains `payload.request.subtype`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/services/miniappApi.ts apps/web/src/pages/public/MiniApp.tsx apps/web/src/pages/public/miniapp/views/RequestView.tsx apps/server/src/services/miniapp.service.ts
git commit -m "feat: add miniapp request subtype"
```

---

## Task 7: Config-Driven CarTié Caption Settings

**Files:**
- Modify: `apps/server/src/services/cardSettings.resolver.ts`
- Modify: `apps/server/src/services/carCardRenderer.v2.ts`
- Test: `apps/server/src/services/carCardRenderer.v2.test.ts`

- [ ] **Step 1: Write renderer test**

Add to `apps/server/src/services/carCardRenderer.v2.test.ts`:

```ts
it('renders CarTie contact settings and pending status copy', () => {
  const text = renderCarCardV2({
    title: 'AUDI A6 C7 2015',
    status: 'PENDING',
    mileage: 190000,
    price: 19500,
    specs: { engine: '2.0 дизель', drive: 'Передній привід', transmission: 'Автомат' }
  }, {
    defaultFlag: '🇰🇷 ',
    city: 'Львові',
    priceNote: '',
    safetyLine: 'Хороша комплектація',
    driveLineFallback: 'Передній привід',
    damageLineFallback: 'уточнюйте у менеджера',
    address: 'Кільцева дорога 1, м. Львів',
    mapLinkLine: '',
    manager1Phone: '(063) 505-52-52',
    manager1Name: '@yura_cartie',
    manager2Phone: '(063) 505-52-52',
    manager2Name: '@yura_cartie',
    socialLinksLine: 'Instagram: instagram.com/cartie.import\\nTikTok: tiktok.com/@cartie.avto',
    statusMap: {
      AVAILABLE: { statusTag: 'внаявності', statusText: 'авто в наявності', startStatus: 'В НАЯВНОСТІ' },
      PENDING: { statusTag: 'вдорозі', statusText: 'авто в дорозі', startStatus: 'В ДОРОЗІ' },
      SOLD: { statusTag: 'продано', statusText: 'авто продано', startStatus: 'ПРОДАНО' }
    }
  } as any);

  expect(text).toContain('В ДОРОЗІ');
  expect(text).toContain('Кільцева дорога 1, м. Львів');
  expect(text).toContain('(063) 505-52-52');
  expect(text).toContain('instagram.com/cartie.import');
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm --prefix apps/server test -- carCardRenderer.v2.test.ts
```

Expected: FAIL if `PENDING` is not mapped or contacts are omitted.

- [ ] **Step 3: Update defaults and status map**

In `DEFAULT_CARD_SETTINGS`, replace placeholder contacts with:

```ts
defaultFlag: '',
city: 'Львові',
priceNote: '',
safetyLine: 'Хороша комплектація',
driveLineFallback: 'Передній привід',
damageLineFallback: 'уточнюйте у менеджера',
address: 'Кільцева дорога 1, м. Львів',
mapLinkLine: '',
manager1Phone: '(063) 505-52-52',
manager1Name: '@yura_cartie',
manager2Phone: '(063) 505-52-52',
manager2Name: '@yura_cartie',
socialLinksLine: 'Instagram: instagram.com/cartie.import\nTikTok: tiktok.com/@cartie.avto',
```

Add `PENDING` alongside `IN_TRANSIT`:

```ts
PENDING: {
  statusTag: 'вдорозі',
  statusText: 'авто в дорозі',
  startStatus: 'В ДОРОЗІ'
},
```

- [ ] **Step 4: Include contacts only for public share/admin contexts**

In `renderCarCardForBot`, keep current behavior:

```ts
includeContacts: Boolean(params.includeContacts || params.audience === 'ADMIN')
```

Do not force long contact blocks into every search-result card unless product approves the extra message length.

- [ ] **Step 5: Verify**

Run:

```bash
npm --prefix apps/server test -- carCardRenderer.v2.test.ts
npm --prefix apps/server run build -- --pretty false
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/cardSettings.resolver.ts apps/server/src/services/carCardRenderer.v2.ts apps/server/src/services/carCardRenderer.v2.test.ts
git commit -m "fix: align car card defaults with cartie contacts"
```

---

## Task 8: MiniApp Analytics Events

**Files:**
- Modify: `apps/web/src/pages/public/MiniApp.tsx`
- Modify: `apps/web/src/services/miniappApi.ts`
- Modify: `apps/server/src/routes/miniAppRoutes.ts`

- [ ] **Step 1: Add API client event function**

In `apps/web/src/services/miniappApi.ts`:

```ts
export async function trackMiniAppEvent(payload: {
  slug: string;
  visitorId?: string;
  tgUserId?: string;
  eventName: string;
  meta?: Record<string, unknown>;
}) {
  return await apiFetch('/miniapp/events', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}
```

- [ ] **Step 2: Add backend route**

In `apps/server/src/routes/miniAppRoutes.ts`:

```ts
router.post('/events', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const slug = readString(body.slug);
    const eventName = readString(body.eventName);
    if (!slug) return errorResponse(res, 400, 'slug is required');
    if (!eventName) return errorResponse(res, 400, 'eventName is required');
    const config = await miniAppService.getConfig(slug);
    await prisma.platformEvent.create({
      data: {
        companyId: config.companyId,
        botId: config.botId || null,
        eventType: `miniapp.${eventName}`,
        payload: {
          visitorId: readString(body.visitorId),
          tgUserId: readString(body.tgUserId),
          meta: body.meta && typeof body.meta === 'object' ? body.meta : {}
        }
      }
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to track event';
    errorResponse(res, 500, message);
  }
});
```

- [ ] **Step 3: Emit core events**

In `MiniApp.tsx`, import `trackMiniAppEvent` and add:

```tsx
const track = (eventName: string, meta: Record<string, unknown> = {}) => {
  trackMiniAppEvent({
    slug: targetSlug || 'system',
    visitorId,
    tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
    eventName,
    meta: { ...meta, view, buildSha: config?.buildSha }
  }).catch(() => null);
};
```

Call:

```tsx
track('view.inventory', { status: tab });
track('car.open', { carId: getCarId(car) });
track('favorite.toggle', { carId: id, hasTelegramInit });
track('request.submit', { requestType, requestSubtype, selectedCarsCount: selectedRequestCarIds.length });
```

- [ ] **Step 4: Verify**

Run:

```bash
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Manual smoke:

```bash
curl -s -X POST http://127.0.0.1:3002/api/miniapp/events \
  -H 'content-type: application/json' \
  -d '{"slug":"cartie","visitorId":"plan_smoke","eventName":"smoke","meta":{"source":"plan"}}'
```

Expected: `{ "ok": true }`, and one `PlatformEvent` row with `eventType='miniapp.smoke'`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/public/MiniApp.tsx apps/web/src/services/miniappApi.ts apps/server/src/routes/miniAppRoutes.ts
git commit -m "feat: track miniapp conversion events"
```

---

## Task 9: Remove Production Tailwind CDN Warning

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1: Remove CDN script and add modern mobile meta**

In `apps/web/index.html`, remove:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

Add near existing mobile tags:

```html
<meta name="mobile-web-app-capable" content="yes">
```

- [ ] **Step 2: Verify CSS still builds**

Run:

```bash
npm --prefix apps/web run build
```

Expected: PASS, and browser console no longer shows the Tailwind CDN production warning.

- [ ] **Step 3: Commit**

```bash
git add apps/web/index.html
git commit -m "chore: remove tailwind cdn from web shell"
```

---

## Task 10: Final Verification And Rollout

**Files:**
- No source changes unless verification exposes a bug.

- [ ] **Step 1: Run full targeted server regression**

```bash
npm --prefix apps/server test -- mediaUrl.service.test.ts carMedia.test.ts carCardRenderer.v2.test.ts clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public
```

Expected: all test files pass.

- [ ] **Step 2: Run builds and whitespace check**

```bash
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Browser UI verification**

Use Browser/Playwright at:

```text
http://127.0.0.1:8082/p/app/cartie?entry=inventory&status=AVAILABLE
http://127.0.0.1:8082/p/app/cartie?entry=inventory&status=PENDING
http://127.0.0.1:8082/p/app/cartie?entry=favorites
http://127.0.0.1:8082/p/app/cartie?entry=request&type=BUY
```

Check:
- mobile 390x844 and desktop 1280x900;
- no broken image requests to `localhost:3000`;
- card spec tiles fit and do not overflow;
- bottom nav does not cover primary card action;
- favorite toggle works with visitorId outside Telegram;
- request multi-select subtype renders;
- lightbox arrows/swipe/share work.

- [ ] **Step 4: Production-local API smoke**

```bash
curl -s http://127.0.0.1:3002/health
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cartie/inventory?status=AVAILABLE&limit=1"
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cartie/inventory?status=PENDING&limit=1"
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cardealer_lviv_bot/inventory?limit=1"
```

Expected:
- health `ok`;
- AVAILABLE and PENDING totals remain greater than zero;
- B2B slug fallback returns ok;
- returned media URLs are same-origin paths or public absolute URLs, never `localhost:3000`.

- [ ] **Step 5: Deploy**

```bash
git status --short --branch
git push origin main
BUILD_SHA="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml build api web
BUILD_SHA="$(git rev-parse --short HEAD)" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d --no-deps api web
```

Expected: `infra2-api-1` and `infra2-web-1` healthy.

- [ ] **Step 6: Telegram live verification**

```bash
LOG_FILE=/srv/cartie/_logs/telegram_live_verify_phase2_$(date -u +%Y%m%d_%H%M%S).log bash infra/verify_telegram_live.sh
```

Expected: both bots pass, standard menu buttons remain `web_app`.

---

## UI/UX Implementation Constraints

- Do not do a broad redesign in this pass.
- Keep the current black/gold MiniApp identity, but reduce card ambiguity through stronger image loading, price hierarchy, and spec labels.
- Use code-native buttons, text, filters, and form controls; do not ship UI as screenshots.
- For any later full redesign, first generate and approve section/state concepts, then implement against that design system and verify browser screenshots against the accepted concept.
- Avoid nested cards and repeated decorative card grids; use compact operational surfaces suitable for repeated catalog scanning.
- Use lucide icons where they match current style; keep icon buttons square/round and stable in size.
- Verify mobile text wrapping and bottom-nav overlap before rollout.

## Deferred Work

- Non-Telegram request submission should stay blocked until anti-spam and product policy are approved.
- PWA/offline image caching should wait until media URL and dedupe are fixed.
- DB schema migration for `requestSubtype` can be deferred because payload persistence is enough for the first manager-facing release.
- Full content-template redesign should be a separate brand-copy task after cardSettings are configured and sampled against live Telegram posts.

## Self-Review

- Spec coverage: all confirmed P0/P1 audit items are mapped to Tasks 1-9. Refuted/outdated items are documented in Audit Verdict.
- Placeholder scan: no task uses unresolved placeholders; every code step includes concrete paths and snippets.
- Type consistency: `requestSubtype` values are consistent across web payload, request view, and backend payload persistence.
