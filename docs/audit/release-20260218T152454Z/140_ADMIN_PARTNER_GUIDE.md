# Admin + Partner Guide (CarTié MEGA MVP)

## Admin Guide

### 1. Feature rollout order
1. Keep all MEGA flags OFF after schema deploy.
2. Enable `FF_CAR_CARD_V2`.
3. Enable `FF_BOT_A_FLOW_V2`.
4. Enable `FF_B2B_WHITELIST_ENFORCED` and `FF_B2B_FIT_QUEUE_V2`.
5. Enable `FF_MINIAPP_B2B_CABINET`.

### 2. Bot A operations
- `/start` menu (v2): `Залишити заявку`, `Каталог/Авто`, `Контакти`.
- Leads arrive to admin in one summary message.
- Daily lead limit and step flood-protection are active.

### 3. Bot B operations
- Whitelist source of truth: `PartnerCompany` + `PartnerUser`.
- Non-member users see: `доступ тільки для учасників` and `Запросити доступ`.
- Request publication creates `CD-YYYY-######` public ID.
- FIT queue statuses:
  - `NEW`
  - `IN_PROGRESS`
  - `AGREED`
  - `MEETING_SCHEDULED`
  - `CLOSED`

### 4. Admin queue APIs
- `GET /api/v2/b2b/admin/fit-queue`
- `PATCH /api/v2/b2b/admin/fit-queue/:variantId`

### 5. Mini App admin surface
- `GET /miniapp/b2b/admin/fit-queue`
- `PATCH /miniapp/b2b/admin/fit-queue/:variantId`
- All write actions require valid `initData`.

## Partner Regulation (майданчики)

### 1. Access
- Participation only via whitelist.
- If blocked, use `Запросити доступ` in bot.

### 2. Request rules
- Create requests only via bot/Mini App forms.
- Do not publish phone/contact in free-text fields.
- Contact must be entered only in contact field.

### 3. Variant submission rules
- Use `Є авто` from request post.
- Upload photos only (max 10, size limited).
- Keep technical details in structured fields.

### 4. Privacy and contact sharing
- Request author sees variants without seller contacts.
- Admin receives full variant with contacts and both companies.
- Contacts are shared between sides only after FIT/admin action.

### 5. Status discipline
- Requester marks `Підходить` or `Не підходить`.
- FIT goes to admin queue and meeting orchestration.
- Closed deals must be moved to `CLOSED`.
