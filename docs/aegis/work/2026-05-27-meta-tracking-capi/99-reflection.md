# Reflection

The implementation stayed inside the planned ownership boundaries:

- Attribution capture lives under `apps/server/src/modules/Attribution/`.
- Telegram routing only binds the token and keeps reserved aliases first.
- Lead/request paths copy sanitized attribution snapshots.
- SalesDrive sync/webhook carry context without owning Meta payload construction.
- Meta sender owns event timing, duplicate decisions, retry logging, and redacted delivery summaries.

Verification is strong for the changed surfaces. One planned route test in `miniAppLeadHandoff.routes.test.ts` has a stale expectation on the untouched base branch and was recorded separately instead of mixing unrelated repair into this feature branch.
