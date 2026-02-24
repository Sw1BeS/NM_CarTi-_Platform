# CarTié V6 Implementation Plan

## P0/P1 Tasks Overview
### P0 (Critical - Blocking Flows)
1. **Schema Migrations**: Add `inviteCode`, `PartnerUser` roles, `B2bAccessRequest.payload` JSON, and `SupportTicket` thread arrays to Prisma schema.
2. **Text Normalization**: Replace generic text in `telegramText.ts` with the new UA-only strict copy. Replace inline button maps.
3. **UX Overhaul (Lead/B2B Bots)**: Total replacement of text-based wizard flows with inline button-driven wizards. Implement pagination, batching, and edit-field logic based on small callback tokens.
4. **Mini App Submission Fix**: Fix reliance on `web_app_data` to support StartApp/Menu buttons through a dedicated backend API route or by ensuring `routeWebApp.ts` handles API calls from MiniApp.

### P1 (Important - B2B/External Logic)
1. **External Parser Fallback**: Add OLX parser integration alongside AutoRia. Cache results with 1 rps rate limiting and robots.txt checks.
2. **Channel Post Formats**: Update post templates for BOTH CarTié (Lead) and CarDealer (B2B) channels to strict no-contact formats.
3. **B2B Registration Flow**: Implement "Я новий партнер" and "Я представник партнера" flows with admin approval.

## Commit Sequence (Small Commits)
We will follow this specific sequence to maintain stability and ensure health checks pass continuously:

1. **Commit 1: Schema & Translation Baseline**
   - Apply `prisma/schema.prisma` updates.
   - Run `prisma db push` / `prisma generate`.
   - Apply Appendix A and A2 texts to `telegramText.ts`.
   - Update `miniappPayload.ts`.
2. **Commit 2: Core Routing & UX Utilities**
   - Update `telegramReplyMarkup.ts` to strictly follow logic for admin groups vs private chats.
   - Add new short callback token enums in `callbackUtils.ts` (`lb_nxt`, `lb_it`, etc.).
   - Introduce session management utils to save wizard state properly.
3. **Commit 3: Lead BUY & SELL Wizards**
   - Implement the step-by-step inline wizard in `routeCallback.ts` and `routeMessage.ts`.
   - Connect inventory batching algorithm.
   - Include external parser fallback.
4. **Commit 4: B2B Requests & Variants**
   - Implement the channel posting logic per CarDealer channel constraints (no contacts).
   - Implement Partner registration and queue approval flow.
5. **Commit 5: Mini App Logic Update**
   - Implement multi-select and favorite toggles.
   - Change submit flow to handle new endpoints.
   - Disable vertical scrolling.

## QA Scripts & Vitest
### Manual QA Scripts (`verification/v6_manual_qa.md`)
We will create a specific script `verification/v6_manual_qa.md` documenting:
- **Test 1**: Start Lead bot, go through BUY wizard, skip optional fields, add to favorites, submit. Validate admin notification contains the right car and 0 contacts from bot.
- **Test 2**: Start Lead bot in admin group. Verify no reply keyboard is shown. Verify inline admin actions work.
- **Test 3**: Start B2B bot, register as new partner, wait for approval. Create request, verify channel post has NO contact data.

### Unit Tests (`vitest`)
Existing unit tests around normalizations (`normalizePhone`, `normalizeBrand`) need to be checked.
New unit tests needed:
- `test('budget_parsing')`: ensure `$20k` -> `20000`, etc.
- `test('year_parsing')`: ensure `2018-2022` parses into min/max accurately.
- `test('mileage_parsing')`: ensure `120k` -> `120000`.

## Rollback Notes
- **Database**: The schema changes are purely additive (adding columns/JSON payload fields). Thus, a rollback to the previous commit will not break the DB.
- **Bot Behavior**: If the new inline wizard crashes, we can safely revert `routeMessage.ts` and `routeCallback.ts` to restore the fallback prompt behavior.
- Always monitor PM2 logs `pm2 log cartie-server` during deployment.
