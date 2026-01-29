# Release QA Checklist (Stage 1)

- [ ] Login with role-specific accounts (Admin, Manager, Dealer) and verify redirected landing page matches role policy.
- [ ] Dashboard `/` loads KPIs and recent activity without errors.
- [ ] Inbox: load chats, open a conversation, send a text reply, send with attachment, send car card.
- [ ] Requests: list renders, quick filters/search work, broadcast button opens, status badge renders; board view scrolls.
- [ ] Leads: create lead, change status inline, use "Share as Request" quick action, confirm request appears in Requests list.
- [ ] Inventory: list renders on desktop and mobile; row click opens detail; horizontal scroll works on small screens.
- [ ] Help page opens and links navigate correctly.
- [ ] Settings/Integrations pages gated correctly per role (Dealer hidden, Admin visible).
- [x] Public pages `/p/request`, `/p/dealer`, `/p/proposal/:id` still reachable.
- [x] API health endpoints `/health` and `/api/health` return 200.
- [ ] Server/logs show structured timestamps (logger) and no uncaught errors during smoke run.
