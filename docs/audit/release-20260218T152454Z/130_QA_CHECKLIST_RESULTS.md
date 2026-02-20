# QA Checklist Results (MEGA Prompt)

Date: 2026-02-20
Scope: implementation batch after baseline deploy

## Automated Evidence
- Server tests: `docs/audit/release-20260218T152454Z/artifacts/server_test_2026-02-20_phase_impl.log`
- Server build: `docs/audit/release-20260218T152454Z/artifacts/server_build_2026-02-20_phase_impl.log`
- Web build: `docs/audit/release-20260218T152454Z/artifacts/web_build_2026-02-20_phase_impl.log`
- Smoke read: `docs/audit/release-20260218T152454Z/artifacts/smoke_read_2026-02-20_phase_impl.txt`
- Smoke basic: `docs/audit/release-20260218T152454Z/artifacts/smoke_basic_2026-02-20_phase_impl.txt`
- Routes smoke: `docs/audit/release-20260218T152454Z/artifacts/routes_smoke_2026-02-20_phase_impl.txt`
- Prod verify baseline: `docs/audit/release-20260218T152454Z/artifacts/prod_verify_2026-02-20.txt`

## Scenarios (Required 1-8)
1. Bot A `/start` -> заявка -> contact -> confirm -> admin 1 message
   - Status: PARTIAL
   - Notes: flow v2 implemented + unit/smoke automation pass; full Telegram chat E2E требует ручной прогон в проде.
2. Bot A авто -> отправка в ЛС -> формат = публичный шаблон
   - Status: PARTIAL
   - Notes: unified CarCard v2 enabled via flag + API endpoint `/api/v2/inventory/:carId/send-telegram`; ручной Telegram проверка не выполнена в рамках CLI.
3. Bot A публикация авто в канал -> шаблон + фото
   - Status: PARTIAL
   - Notes: endpoint `/api/v2/inventory/:carId/publish-telegram` реализован; нужен ручной канал-пост check.
4. Bot B whitelist user -> create request -> private channel post CD-YYYY-###### + `Є авто`
   - Status: PARTIAL
   - Notes: whitelist gate + `PublicSequence` + channel template/CTA реализованы; требуется ручной прогон с реальными TG участниками.
5. Bot B другой dealer -> `Є авто` -> фото+форма -> автор без контактов
   - Status: PARTIAL
   - Notes: routing и скрытие контактов в requester delivery реализованы; manual E2E pending.
6. Bot B автор -> `Підходить` -> admin получает FIT с контактами
   - Status: PARTIAL
   - Notes: lifecycle `requesterDecision=FIT`, `fitQueueStatus=NEW` и admin notification реализованы; manual E2E pending.
7. Mini App initData verify -> showcases/catalog/car/share
   - Status: PARTIAL
   - Notes: новые `/miniapp/showcases*`, `/miniapp/cars*`, `/miniapp/cars/:id/share` реализованы; ручной Telegram Mini App smoke pending.
8. Rate limits exceeded -> user-friendly reject, session intact
   - Status: PASS (code-level + automated)
   - Notes: `QuotaUsage` + `quota.service` + rate limit checks в Bot A/B path, unit tests passed.

## Edge Scenarios
- Cancel/invalid values: PASS (legacy + v2 flow handlers)
- Timeout: PASS (session timeout guard in Bot A v2)
- Media errors (oversize/limit): PASS (dealer photo limits)
- Not-whitelist user path: PASS (gated + access request callback)

## Summary
- Code-level DoD coverage: выполнено по основным модулям.
- Full Telegram human E2E: требует отдельного ручного прогона с 2+ реальными аккаунтами и приватным каналом.
