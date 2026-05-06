# CarTié MiniApp Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize LeadBot/MiniApp request launch, contact handoff, Lead/B2B boundaries, vehicle presentation, and the first premium UI pass without a large rewrite.

**Architecture:** Keep the current Express/Vite/Prisma monorepo. Fix Telegram write-flow contracts server-first, then wire frontend behavior and UI primitives around existing MiniApp pages. Use existing `BotSession`, `Lead`, `LeadActivity`, `B2bRequest`, `BotMessage`, and `mediaStorage` paths; no new database schema in this pass.

**Tech Stack:** TypeScript, Express, Prisma, Vitest, React/Vite, Tailwind-style utility classes, Telegram Bot API/Mini App contracts.

---

## Files

- Modify `apps/server/src/modules/Communication/telegram/core/utils/clientLeadMiniAppMenu.ts`: runtime Lead menu alignment; sell becomes bot-native text button.
- Modify `apps/server/src/modules/Communication/telegram/core/utils/clientLeadMiniAppMenu.test.ts`: RED/GREEN coverage for sell not being MiniApp `web_app`.
- Modify `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts`: do not downgrade write MiniApp actions to direct MiniApp links in non-private chats.
- Modify `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.test.ts`: verify read-only direct links are preserved and write actions point to the private bot.
- Modify `apps/server/src/routes/miniAppRoutes.ts`: stricter Lead/B2B write-surface checks and bot/company-safe send resolution.
- Modify `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts`: verify B2B rejection and bot-company scoping.
- Modify `apps/server/src/modules/Communication/telegram/core/leadService.ts`: helper for recording free-text Lead communication using existing lead/activity entities.
- Modify `apps/server/src/modules/Communication/telegram/core/leadService.test.ts`: verify free text is linked to Telegram identity.
- Modify `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`: route Lead free text in menu into CRM-friendly activity instead of only command fallback.
- Modify `apps/server/src/services/vehiclePresentation.ts`: add `hasImages` and `imageCount`.
- Modify `apps/server/src/services/dto.inventory-normalization.test.ts`: verify presentation media metadata and no `file_id` public leakage.
- Create `apps/web/src/pages/public/miniapp/vehicleOptions.ts`: shared Auto.RIA-like make/model/body/fuel/city options.
- Modify `apps/web/src/pages/public/miniapp/views/RequestView.tsx`: use shared vehicle options, add free-text fallback, keep no phone field, make Lead sell intro bot-native.
- Create `apps/web/src/pages/public/miniapp/components/MiniAppImage.tsx`: reusable broken-image fallback for cards and galleries.
- Modify `apps/web/src/pages/public/miniapp/views/CatalogView.tsx`: use `MiniAppImage`, metallic CTA, listing-first photo/card click, clearer empty CTA.
- Modify `apps/web/src/pages/public/miniapp/views/FavoritesView.tsx`: use `MiniAppImage`, presentation labels, listing-first click.
- Modify `apps/web/src/pages/public/MiniApp.tsx`: premium home/detail/contacts tweaks, Lead/B2B nav guard, error-code messages, remove invalid extra `tgUser` prop.

## Task 1: Telegram Write Launch Contracts

- [ ] Write/update failing tests in `clientLeadMiniAppMenu.test.ts` proving Lead sell is a plain bot-native button and other rows stay two-column.
- [ ] Write/update failing tests in `telegramReplyMarkup.test.ts` proving non-private `entry=request` write actions are not converted to `t.me/.../app?startapp=...`.
- [ ] Run:
  `npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts telegramReplyMarkup.test.ts`
- [ ] Implement the minimal menu/markup changes.
- [ ] Re-run the same tests and keep them green.

## Task 2: Lead Intent Surface And Bot Scoping

- [ ] Add failing route tests in `miniAppLeadHandoff.routes.test.ts` for rejecting B2B config on `/lead-intents` and for not sending with a bot from another company.
- [ ] Run:
  `npm --prefix apps/server test -- miniAppLeadHandoff.routes.test.ts`
- [ ] Implement `isLeadMiniAppConfig` checks and company-scoped `getMiniAppBotForSend`.
- [ ] Re-run route tests.

## Task 3: Basic CRM Conversation Capture

- [ ] Add failing tests in `leadService.test.ts` for `recordIncomingLeadMessage`.
- [ ] Run:
  `npm --prefix apps/server test -- leadService.test.ts`
- [ ] Implement `recordIncomingLeadMessage` using existing lead dedup/create/update and `LeadActivity`.
- [ ] Wire `CL_MENU` free text in `routeMessage.ts` to record the message and respond with a human handoff message plus menu.
- [ ] Re-run lead service tests.

## Task 4: Vehicle Presentation And Media Safety

- [ ] Add failing DTO tests for `presentation.hasImages`, `presentation.imageCount`, and public filtering of raw Telegram file IDs.
- [ ] Run:
  `npm --prefix apps/server test -- dto.inventory-normalization.test.ts`
- [ ] Implement the presentation metadata additions.
- [ ] Re-run DTO tests.

## Task 5: Shared Vehicle Options And Request Form

- [ ] Create shared `vehicleOptions.ts` with broader make/model options, body/fuel/mileage/city lists, and free-text option constants.
- [ ] Replace the local `carCatalog` in `RequestView.tsx`.
- [ ] Add free-text brand/model inputs when "Інша марка" or "Інша модель" is selected.
- [ ] Keep phone absent from Lead MiniApp form.
- [ ] Run:
  `npm --prefix apps/web run build`

## Task 6: Premium UI And Image Fallback Slice

- [ ] Create `MiniAppImage.tsx` with deterministic fallback.
- [ ] Use it in home/catalog/favorites/listing/lightbox where practical without rewriting all of `MiniApp.tsx`.
- [ ] Replace remaining teal/cyan active CTA usage in MiniApp surfaces with metallic silver.
- [ ] Preserve Lead nav (`Головна`, `Каталог`, `Заявки`, `Контакти`, `Профіль`) and B2B nav (`Головна`, `Угоди`, `Склад`, `Підтримка`, `Профіль`).
- [ ] Run:
  `npm --prefix apps/web run build`

## Task 7: Regression And Rollout Gate

- [ ] Run server regression:
  `npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts telegramReplyMarkup.test.ts miniAppLeadHandoff.routes.test.ts leadService.test.ts dto.inventory-normalization.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppAuth.service.test.ts`
- [ ] Run server build:
  `npm --prefix apps/server run build -- --pretty false`
- [ ] Run web build:
  `npm --prefix apps/web run build`
- [ ] Run:
  `git diff --check`
- [ ] If builds pass, prepare deployment/smoke from current `main`.
