# Release Test Checklist

## 1. Authentication & Session
- [ ] **Login:** Can log in with valid credentials (`admin@cartie.ai` / `123456`).
- [ ] **Persist:** Reload page (`F5`) -> Session remains active (no white screen, no redirect to login).
- [ ] **Context:** User name and Company appear in sidebar/header.

## 2. Inbox (Telegram)
- [ ] **Receive:** Send message to bot -> Appears in Inbox (auto-refresh or manual).
- [ ] **Lead Gen:** New user messaging bot -> Automatically creates `Lead` (check "Leads" page or sidebar info).
- [ ] **Reply:** Can reply from Inbox -> User receives message in Telegram.
- [ ] **Helpers:** "Car Picker" opens and lists inventory.

## 3. Requests (Buy/Sell)
- [ ] **Create (Buy):** Click "New Request" -> Select "BUY" -> Enter Budget -> Save. Appears in list.
- [ ] **Create (Sell):** Click "New Request" -> Select "SELL" -> Budget fields hidden/optional -> Save.
- [ ] **Kanban:** Switch to Board view -> Drag card (visual check only).

## 4. Inventory & Parsing
- [ ] **List:** Inventory page loads items.
- [ ] **Import:** (If MTProto active) Channel messages appear as "Pending" or "Available".

## 5. Public Flows
- [ ] **Dealer Portal:** `/p/dealer` loads (might show "Partner Access Only" if not in TG WebApp, but page shouldn't crash).
- [ ] **Proposal:** `/p/proposal/:id` loads variant card if valid ID provided.

## 6. Infrastructure
- [ ] **Health:** `/health` endpoint returns `200 OK` with DB status.
