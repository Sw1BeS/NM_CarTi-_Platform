# M2: Import by Date Range (MTProto)

## 1. Overview
Enhances the MTProto import capabilities by allowing precise date-range imports and a "Preview" mode to inspect results before committing to the database.

## 2. Data Model
**Model:** `TelegramImportJob` (Update)
- Add `fromDate` (DateTime) - already likely present or needed
- Add `toDate` (DateTime)
- Add `mode`: `DRAFT_ONLY` | `INVENTORY`

## 3. Backend API
**Prefix:** `/api/integrations/mtproto`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/import/preview` | Dry-run import. Returns list of parsed items (CarListing/Draft) without saving. |
| POST | `/import` | Start background job. Returns job ID. |
| GET | `/jobs/:id` | Check job status and progress. |

## 4. Frontend UI
**Page:** `/integrations/mtproto/:id` (Source Details)
**Components:**
- **Date Range Picker:** Start/End date.
- **Mode Toggle:** Inventory / Content Draft.
- **Preview Button:** Shows modal/list of found items (Title, Price, Photos count).
- **Import Button:** Starts the job.

## 5. DoD (Verification)
1. [ ] Preview returns JSON of parsed messages from the requested period.
2. [ ] Import job successfully creates non-duplicate entities.
3. [ ] Re-running import for same period adds 0 new items.
