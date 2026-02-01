# Stage-2 M3 — Ingestion Unification (BotAPI + MTProto)

## Goal
Use a single ingestion path for BotAPI `channel_post` and MTProto, with shared dedup and merge-on-duplicate behavior.

## Tasks
- [x] Wire BotAPI `channel_post` to unified ingestion service with channelMode support → Verify: route uses shared service and logs merge/skip.
- [x] Update MTProto mapping/import worker to use the same ingestion path → Verify: mtproto worker uses shared upsert result.
- [x] Implement merge-on-duplicate rules (media + metadata; no overwrite of filled business fields) → Verify: duplicate updates media/metadata only.
- [x] Update docs `docs/stage2/30_MEDIA_MVP.md` or `docs/stage2/20_IMPORT_BY_DATE.md` if needed for merge behavior → Verify: DoD reflects merge rules.
- [x] Run required validation scripts and minimal tests → Verify: lint/type checks succeed.
- [x] Commit M3 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] BotAPI + MTProto share one ingestion path and dedup key.
- [x] Duplicate `(sourceChatId, sourceMessageId)` triggers merge (not new entity).
- [x] UI/Logs reflect merge behavior where applicable.
