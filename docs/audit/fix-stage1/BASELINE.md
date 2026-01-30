# Baseline snapshot - 2026-01-30T09:51:48+00:00
\n## ls -la
total 176
drwxr-xr-x 17 root root  4096 Jan 28 23:47 .
drwxr-xr-x  4 root root  4096 Dec 28 11:26 ..
drwxrwxr-x  8 root root  4096 Jan 27 02:09 .agent
-rw-r--r--  1 root root    34 Jan 20 01:30 .dockerignore
-rw-------  1 root root   562 Jan 29 09:18 .env
-rw-r--r--  1 root root   200 Jan 28 13:48 .env.example
drwxr-xr-x  9 root root  4096 Jan 30 09:51 .git
drwxr-xr-x  3 root root  4096 Jan 20 01:46 .github
-rw-r--r--  1 root root   516 Jan 27 02:09 .gitignore
-rw-r--r--  1 root root    57 Jan 22 08:13 ARCHITECTURE.md
-rw-r--r--  1 root root  4534 Jan 22 21:34 ARCHITECTURE_MIGRATION.md
-rw-r--r--  1 root root 24206 Jan 29 06:46 CODEX_AUDIT_REPORT.md
-rw-r--r--  1 root root  1245 Jan 28 13:48 DEPLOYMENT.md
-rw-r--r--  1 root root   839 Jan 28 13:48 FINAL_SUMMARY.md
-rw-r--r--  1 root root  1550 Jan 28 13:48 FIX_PLAN.md
-rw-r--r--  1 root root  2895 Jan 28 13:48 MODULE_MAP.md
-rw-r--r--  1 root root  1172 Jan 28 13:48 PATCH_PLAN.md
-rw-r--r--  1 root root  1012 Jan 28 13:48 RELEASE_BLOCKERS.md
-rw-r--r--  1 root root  3752 Jan 28 13:48 RELEASE_BLUEPRINT.md
-rw-r--r--  1 root root  1079 Jan 29 06:35 RELEASE_QA_CHECKLIST.md
-rw-r--r--  1 root root  1780 Jan 28 13:48 SMOKE_TESTS.md
-rw-r--r--  1 root root    77 Jan 22 08:13 SUMMARY.md
-rw-r--r--  1 root root  1453 Jan 28 13:48 TEST_CHECKLIST.md
-rw-r--r--  1 root root  1146 Jan 28 13:48 TEST_PLAN.md
drwxr-xr-x  3 root root  4096 Jan 22 04:28 _archive
drwxr-xr-x  2 root root  4096 Jan 23 10:47 _backup_root
drwxr-xr-x  2 root root  4096 Jan 20 01:04 _backups
drwxr-xr-x  2 root root  4096 Jan 29 13:07 _logs
drwxr-xr-x  5 root root  4096 Jan 23 10:47 apps
drwx------  3 root root  4096 Jan 12 17:53 data
drwxr-xr-x  5 root root  4096 Jan 29 10:18 docs
drwx------  2 gha  gha   4096 Jan 12 09:09 env
-rw-r--r--  1 root root   920 Jan 20 01:28 fix.sql
-rw-r--r--  1 root root  1746 Jan 22 16:34 incident-response.md
drwxr-xr-x  3 root root  4096 Jan 28 13:48 infra
drwxr-xr-x  2 root root  4096 Jan 22 08:20 scripts
drwxr-xr-x  2 root root  4096 Jan 13 05:59 services
drwxr-xr-x  2 root root  4096 Jan 28 13:48 verification
\n## docker ps
NAMES          STATUS                  PORTS
infra2-web-1   Up 21 hours (healthy)   80/tcp, 443/tcp, 2019/tcp, 443/udp, 127.0.0.1:8082->8080/tcp
infra2-api-1   Up 6 hours (healthy)    127.0.0.1:3002->3001/tcp
infra2-db-1    Up 21 hours (healthy)   127.0.0.1:5433->5432/tcp
\n## curl public health
{"status":"ok","timestamp":"2026-01-30T09:51:48.903Z","uptime":21023.740121629,"environment":"production","build":{"buildSha":"caf2a1b97bf4f53cc02cfc3f6e3259030df9e00b","buildTime":"2026-01-29T13:07:05Z"},"database":{"status":"connected","latency_ms":2},"bots":{"activeCount":1,"activeBotIds":["cmkz42m4n0001iq3sxpbhq4ey"]},"worker":{"running":true,"processing":false,"nextRun":null},"services":{"bots":{"activeCount":1,"activeBotIds":["cmkz42m4n0001iq3sxpbhq4ey"]},"contentWorker":{"running":true,"processing":false,"nextRun":null}},"memory":{"rss":139374592,"heapTotal":46403584,"heapUsed":35757528,"external":4003059,"arrayBuffers":267604},"response_time_ms":2}\n## curl local health
{"status":"ok","timestamp":"2026-01-30T09:51:48.924Z","uptime":21023.761177094,"environment":"production","build":{"buildSha":"caf2a1b97bf4f53cc02cfc3f6e3259030df9e00b","buildTime":"2026-01-29T13:07:05Z"},"database":{"status":"connected","latency_ms":1},"bots":{"activeCount":1,"activeBotIds":["cmkz42m4n0001iq3sxpbhq4ey"]},"worker":{"running":true,"processing":false,"nextRun":null},"services":{"bots":{"activeCount":1,"activeBotIds":["cmkz42m4n0001iq3sxpbhq4ey"]},"contentWorker":{"running":true,"processing":false,"nextRun":null}},"memory":{"rss":139374592,"heapTotal":46403584,"heapUsed":35801728,"external":4003059,"arrayBuffers":267604},"response_time_ms":1}\n## git status
## main...origin/main
 M apps/server/src/modules/Communication/telegram/core/leadService.ts
 M apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts
?? .agent/rules/00_CARTIE_OVERRIDES.md
?? .agent/rules/10_CHANGE_PROTOCOL.md
?? .agent/rules/20_CODEBASE_MAP.md
?? .agent/rules/30_TELEGRAM_BOTAPI_MODULE.md
?? .agent/rules/35_TELEGRAM_LEADS_IDENTITY.md
?? .agent/rules/40_TG_CHANNELS_INGESTION.md
?? .agent/rules/50_MTPROTO_CONNECTOR_RULES.md
?? .agent/rules/60_TESTING_RELEASE_GATE.md
?? docs/audit/fix-stage1/
?? docs/audit/server/
\n## git head
caf2a1b97bf4f53cc02cfc3f6e3259030df9e00b
