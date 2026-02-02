# M4: Media MVP

## Current State Analysis

### Backend Media Storage
**File:** `apps/server/src/services/mediaStorage.service.ts`

**Current Implementation:**
- **Storage Path:** `/srv/cartie/storage/media/{companyId}/{chatId}/{messageId}/`
- **Max Size:** 25MB (configured via `MEDIA_MAX_BYTES`)
- **Download Method:** Bot API (`saveTelegramBotFile`)
- **URL Format:** `/media/{relativePath}` (requires static file serving)

**Issues:**
- ❌ Upload directory `/srv/cartie/storage` not created
- ❌ No static file serving configured for `/media/*` route
- ⚠️ MTProto file downloads only store `file_id` (not actual URLs)

### Frontend Media Display
**Files:**
- `apps/web/src/pages/app/Inventory.tsx` (lines 42-49, 218-246)
- `apps/web/src/pages/public/MiniApp.tsx` (lines 79-86)

**Current Implementation:**
```typescript
const getCarImages = (car: CarListing) => {
    const itemUrls = (car.mediaItems || [])
        .map(item => item.url || item.previewUrl)
        .filter(Boolean) as string[];
    const baseUrls = itemUrls.length ? itemUrls : (car.mediaUrls || []);
    const combined = car.thumbnail ? [car.thumbnail, ...baseUrls] : baseUrls;
    return Array.from(new Set(combined.filter(Boolean)));
};
```

**Display Features:**
- ✅ Thumbnail grid (4 thumbnails max shown in Inventory cards)
- ✅ Lightbox gallery in MiniApp
- ❌ No gallery in Inventory detail view
- ⚠️ Shows `file_id` strings instead of URLs when media not downloaded

---

## M4 Goals

### 1. Storage Infrastructure ✅ (Already Implemented)
**Status:** Code exists, needs deployment setup

**Required:**
- Ensure `/srv/cartie/storage/media` directory exists
- Configure Express static file serving for `/media/*`

**Implementation:**
```typescript
// In apps/server/src/index.ts
app.use('/media', express.static(path.join(STORAGE_ROOT, 'media')));
```

### 2. Media Download Enhancement
**Goal:** Download all images from imported channels

**Required Changes:**
- MTProto: Call `saveTelegramBotFile` during import (requires bot token access)
- BotAPI: Already downloads via `routeChannelPost.ts` (✅ working)

**Challenge:** MTProto uses user session, Bot API requires bot token
**Solution (M4 MVP):** Download media only via BotAPI channel posts. For MTProto imports, store `file_id` and download on-demand when user views listing.

### 3. Gallery UI in Inventory ✅ (Already Present in MiniApp)
**Goal:** Add lightbox gallery to Inventory detail view

**Observation:** MiniApp already has full lightbox implementation (lines 66-68, plus rendering)

**Required:**
- Port lightbox component from `MiniApp.tsx` to `Inventory.tsx`
- Add gallery navigation (prev/next arrows)

---

## Implementation Plan

### Backend Tasks
1. **[INFRA]** Create storage directory structure
   ```bash
   mkdir -p /srv/cartie/storage/media
   chown -R www-data:www-data /srv/cartie/storage
   ```

2. **[API]** Add static file serving route
   ```typescript
   // apps/server/src/index.ts
   const STORAGE_ROOT = process.env.MEDIA_STORAGE_PATH || '/srv/cartie/storage';
   app.use('/media', express.static(path.join(STORAGE_ROOT, 'media')));
   ```

3. **[OPTIONAL]** Add on-demand download endpoint
   ```typescript
   // POST /api/media/download
   // { fileId, botId } → downloads file and returns URL
   ```

### Frontend Tasks
1. **[UI]** Port lightbox component to Inventory
   - Extract gallery logic from MiniApp
   - Add to InventoryPage
   - Add navigation controls (prev/next)

2. **[UX]** Handle `file_id` fallback
   - Show placeholder if no URL
   - Add "Download" button to fetch on-demand

---

## Verification

### Backend
- [ ] `/srv/cartie/storage/media` directory exists
- [ ] Static file serving responds: `GET /media/test.jpg`
- [ ] BotAPI downloads work (already verified in M3)

### Frontend
- [ ] Gallery opens in Inventory
- [ ] Navigation works (prev/next)
- [ ] Multiple images display correctly

---

## Out of Scope (Future)
- **S3/CDN integration** (defer to post-Stage 2)
- **Image optimization** (resize, compression)
- **Video support** (MVP is photo-only)
- **MTProto media download** (requires session management)

---

## Decision Log

**Why local storage?**
- Simplest MVP
- No external dependencies
- Docker volume maps `/srv/cartie/storage`

**Why not download MTProto media?**
- MTProto uses user session (no direct file download API)
- Requires Bot API token mapping (complex)
- Defer to M5 or later

**Why port lightbox instead of creating new?**
- MiniApp implementation already tested
- Saves development time
- Consistent UX
