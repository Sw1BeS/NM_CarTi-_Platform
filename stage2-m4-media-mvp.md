# Stage-2 M4 — Media MVP (Photos + Albums)

## Goal
Persist Telegram photos locally and expose them via `/media/...` for Inventory + Mini App galleries.

## Tasks
- [x] Implement local storage path `/srv/cartie/storage/media/<companyId>/<sourceChatId>/<messageId>/<fileId>.<ext>` → Verify: files land in expected folder.
- [x] Enforce 25MB hard-limit (MEDIA_TOO_LARGE) + log integration event → Verify: oversize is skipped and logged.
- [x] Photos-only handling for BotAPI + MTProto (skip non-photo) → Verify: video/document ignored with skip reason.
- [x] Update API server to serve `/media/*` from storage → Verify: URL loads in browser.
- [x] Ensure CarListing stores `mediaItems[]` + `mediaUrls[]` for gallery (Inventory + Mini App) → Verify: images render.
- [x] Update docs `docs/stage2/30_MEDIA_MVP.md` + exec summary → Verify: DoD + checks updated.
- [x] Run required validation scripts and minimal tests → Verify: lint/type checks succeed.
- [ ] Commit M4 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] Inventory + Mini App show photos for imported listings.
- [x] Albums appear as multiple images.
- [x] Media storage uses `/media/...` and 25MB limit.
