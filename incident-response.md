# Incident Response: Critical Production Fixes

## Goal
Resolve 9 blocking issues in production, prioritizing the broken Telegram integration (P0++) and core functionality (Inbox, Requests, Scenarios).

## PHASE 1: Emergency Fixes (P0++)
- [ ] **Telegram Bot Integration**
    - [ ] Diagnose `TelegramHub.tsx` component loading (Check `modules/Telegram` imports) -> Verify: Page loads without blank screen/crash
    - [ ] Fix `Data.getBots()` data flow -> Verify: Bots list appears in sidebar
    - [ ] Verify `MiniAppManager`/`MTProtoSources` exports -> Verify: Tabs display content

## PHASE 2: Critical Functional Fixes (P0)
- [ ] **Inbox Messages**
    - [ ] Fix `Inbox.tsx` message fetching (dependent on `selectedBotId`) -> Verify: Messages list populates
    - [ ] Restore Chat/Manager assignment logic -> Verify: Chats can be assigned
- [ ] **Request Creation**
    - [ ] Fix `Requests.tsx` `handleCreateRequest` payload -> Verify: Create modal closes and toast shows success
    - [ ] Validate `RequestsService` response -> Verify: New request appears in list
- [ ] **Scenario Permissions**
    - [ ] Fix "Permission restrictions" in `ScenarioBuilder` -> Verify: Save successfully writes to DB

## PHASE 3: High Priority UI Fixes (P1)
- [ ] **Mobile App Editor**
    - [ ] Fix missing Navigation Buttons -> Verify: Buttons visible
- [ ] **Menu Editor**
    - [ ] Fix responsiveness in `BotMenuEditor` -> Verify: Layout is usable on mobile

## PHASE 4: Medium Priority Polish (P2)
- [ ] **Company Settings** (Tooltips/Copy)
- [ ] **Content Editor** (Visibility bugs)
- [ ] **Scenario Templates** (Replace stubs)

## Done When
- [ ] All 9 issues are marked Resolved
- [ ] `checklist.py` passes (Lint/Tests)
- [ ] Production build verified
