# BACKLOG NEXT — CarTié / CarDealer Lviv (2026-02-16)

📌 P1 — Third-party URL parser connector
🔘 Implement real connector runtime (not preview-only)
🔘 Add connector health, mapping lifecycle, and clear operational states
🔘 Promote UI from feature-gated to production-ready only after E2E proof

📌 P1 — B2B analytics fields normalization
🔘 Promote frequently used payload fields (`companyName`, `contact`, mileage/fuel) to first-class request columns for filtering/reporting
🔘 Keep backward-compatible payload write during transition

📌 P2 — B2B flow unification in ScenarioEngine
🔘 If business needs non-dev customization, move hard-flow nodes into managed scenario config
🔘 Keep compatibility bridge for existing deep links/callbacks

📌 P2 — Frontend B2B UX modernization
🔘 Build dedicated B2B request/offer board screen (statuses, admin routing timeline)
🔘 Keep current Requests page as compatibility mode

📌 P2 — Observability/ops
🔘 Add dashboards/alerts for failed publication jobs, import failures, callback processing failures
🔘 Add release smoke script that checks miniapp config + scheduler health + publication endpoint

📌 P2 — Test debt cleanup
🔘 Expand integration tests for live B2B flow and MiniApp Telegram context

📌 P1 — Second bot provisioning (operational)
🔘 Add real B2B bot token + channel/admin IDs in production (current prod has one active lead bot)
🔘 Run template bootstrap (B2B preset + webhook/menu publish) and verify two-bot runtime split

📌 P2 — Documentation cleanup
🔘 Mark old audit/plan docs as `obsolete` and keep one canonical release doc chain (`RELEASE_BASELINE` → `RELEASE_AUDIT_REPORT` → `QA_RELEASE_CHECKLIST`)
