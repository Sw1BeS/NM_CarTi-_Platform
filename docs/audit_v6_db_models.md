# Database Models Audit (V6)

## 1. CarListing.partnerId Confirmation
**Status:** Partial Match
**File:** `apps/server/prisma/schema.prisma`
**Analysis:** The field exists, but it is named `partnerCompanyId` pointing to `PartnerCompany`. This perfectly matches the requirement to avoid adding a duplicate field, we just need to use `partnerCompanyId`.

## 2. Required Schema Changes
Based on the V6 requirements, the following updates are needed in `schema.prisma`:

- **PartnerCompany:**
  - `inviteCode String? @unique` requires addition.

- **PartnerUser:**
  - The model `PartnerUser` doesn't explicitly exist in the first 800 lines (need to verify if it's lower or missing). The enum `PartnerUserRole` exists (`OWNER`, `AGENT`). We need to ensure `PartnerUser` model has a `role` field based on `PartnerUserRole`, and a `lastName` field.

- **B2bAccessRequest:**
  - Exists currently with `tgUserId`, `username`, `fullName`, `status`, `reason`.
  - Missing: `payload Json?` (Needs to be added for `{ companyName, city, phone, notes, regType, partnerCode? }`).

- **SupportTicket:**
  - Fast check: `SupportTicket` exists! It has `botId`, `tgUserId`, `chatId`, `text`, `context Json?`, `status`.
  - Missing: We need to use `context` or add a `thread` array in JSON to persist the conversation history. Since `context Json?` exists, we can store `{ thread: [...] }` inside it without a schema migration, or we can add `thread Json?`. Adding `thread Json?` might be cleaner if requested explicitly.

### Migration Plan:
1. Update `schema.prisma` with `PartnerCompany.inviteCode`, `PartnerUser` additions, and `B2bAccessRequest.payload`.
2. Generate migration and apply.
