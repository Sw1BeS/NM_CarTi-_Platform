# M1: Sources & Destinations Registry

## 1. Overview
A unified registry for all Telegram entities (Chats, Channels, Users) known to the system.
Replacing scattered `ChannelSource` and ad-hoc Bot lists with a single `TelegramDestination` truth.

## 2. Data Model
**Model:** `TelegramDestination` (Existing in Prisma)
- **Role:** `SOURCE` (listen), `DESTINATION` (publish), `BOTH`.
- **Access:** `BOT` (via BotAPI), `MTPROTO` (via User Account).
- **Status:**
  - `DISCOVERED`: Found via incoming message or sync, but not active.
  - `ACTIVE`: Syncing/Publishing enabled.
  - `PAUSED`: User disabled.
  - `ERROR`: Auth fail or chat not found.

## 3. Backend API
**Prefix:** `/api/telegram/destinations`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all with pagination & filters (role, status) |
| POST | `/sync` | Force sync now for a destination (if role=SOURCE) |
| PATCH | `/:id/status` | Pause/Resume (`ACTIVE` <-> `PAUSED`) |
| DELETE | `/:id` | Remove (soft delete or forget) |

## 4. Frontend UI
**Page:** `/telegram/sources`
**Components:**
- **Stats Cards:** Total Sources, Active, Errors.
- **Table:**
  - Icon (Channel/Group/User)
  - Title/Username
  - Access (Bot/MTProto)
  - Status Badge
  - Actions: [Sync Now], [Pause/Resume], [Logs]

## 5. DoD (Verification)
1. [ ] API returns list of destinations.
2. [ ] UI shows "Test Channel" (created in Stage 1).
3. [ ] Pause action updates DB status to `PAUSED`.
4. [ ] Resume action updates DB status to `ACTIVE`.
