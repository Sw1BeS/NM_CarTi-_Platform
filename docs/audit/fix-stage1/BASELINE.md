# BASELINE SNAPSHOT - Mon Feb  2 11:35:55 UTC 2026

## 1. File System
total 332
drwxr-xr-x 18 root root   4096 Feb  2 11:22 .
drwxr-xr-x  4 root root   4096 Dec 28 11:26 ..
drwxrwxr-x  8 root root   4096 Jan 27 02:09 .agent
-rw-r--r--  1 root root     34 Jan 20 01:30 .dockerignore
-rw-------  1 root root    562 Jan 29 09:18 .env
-rw-r--r--  1 root root    200 Jan 28 13:48 .env.example
drwxr-xr-x  9 root root   4096 Feb  2 11:27 .git
drwxr-xr-x  3 root root   4096 Jan 20 01:46 .github
-rw-r--r--  1 root root    525 Feb  2 11:22 .gitignore
-rw-r--r--  1 root root     57 Jan 22 08:13 ARCHITECTURE.md
-rw-r--r--  1 root root   4534 Jan 22 21:34 ARCHITECTURE_MIGRATION.md
-rw-r--r--  1 root root  24206 Jan 29 06:46 CODEX_AUDIT_REPORT.md
-rw-r--r--  1 root root   1245 Jan 28 13:48 DEPLOYMENT.md
-rw-r--r--  1 root root    839 Jan 28 13:48 FINAL_SUMMARY.md
-rw-r--r--  1 root root   1550 Jan 28 13:48 FIX_PLAN.md
-rw-r--r--  1 root root   2895 Jan 28 13:48 MODULE_MAP.md
-rw-r--r--  1 root root   1172 Jan 28 13:48 PATCH_PLAN.md
-rw-r--r--  1 root root   1012 Jan 28 13:48 RELEASE_BLOCKERS.md
-rw-r--r--  1 root root   3752 Jan 28 13:48 RELEASE_BLUEPRINT.md
-rw-r--r--  1 root root   1079 Jan 29 06:35 RELEASE_QA_CHECKLIST.md
-rw-r--r--  1 root root   1780 Jan 28 13:48 SMOKE_TESTS.md
-rw-r--r--  1 root root     77 Jan 22 08:13 SUMMARY.md
-rw-r--r--  1 root root   1453 Jan 28 13:48 TEST_CHECKLIST.md
-rw-r--r--  1 root root   1146 Jan 28 13:48 TEST_PLAN.md
drwxr-xr-x  3 root root   4096 Jan 22 04:28 _archive
drwxr-xr-x  2 root root   4096 Jan 23 10:47 _backup_root
drwxr-xr-x  2 root root   4096 Jan 20 01:04 _backups
drwxr-xr-x  2 root root   4096 Feb  2 11:23 _logs
drwxr-xr-x  5 root root   4096 Jan 23 10:47 apps
drwx------  3 root root   4096 Jan 12 17:53 data
drwxr-xr-x  6 root root   4096 Feb  2 11:22 docs
drwx------  2 gha  gha    4096 Feb  2 11:22 env
-rw-r--r--  1 root root    920 Jan 20 01:28 fix.sql
-rw-r--r--  1 root root   1746 Jan 22 16:34 incident-response.md
drwxr-xr-x  3 root root   4096 Feb  2 11:22 infra
drwxr-xr-x  2 root root   4096 Jan 22 08:20 scripts
drwxr-xr-x  2 root root   4096 Jan 13 05:59 services
-rw-r--r--  1 root root   1339 Feb  2 11:22 stage2-m1-sources-destinations.md
-rw-r--r--  1 root root   1264 Feb  2 11:22 stage2-m2-import-by-date.md
-rw-r--r--  1 root root   1177 Feb  2 11:22 stage2-m3-ingestion-unification.md
-rw-r--r--  1 root root   1230 Feb  2 11:22 stage2-m4-media-mvp.md
-rw-r--r--  1 root root   1166 Feb  2 11:22 stage2-m5-miniapp-portal.md
-rw-r--r--  1 root root    918 Feb  2 11:22 stage2-m6-content-calendar.md
drwxr-xr-x  3 root root   4096 Feb  2 11:22 storage
-rw-r--r--  1 root root 130786 Feb  2 11:22 type_coverage_baseline.json
drwxr-xr-x  2 root root   4096 Jan 28 13:48 verification

## 2. Docker Containers
NAMES          STATUS                    PORTS
infra2-web-1   Up 11 minutes (healthy)   80/tcp, 443/tcp, 2019/tcp, 443/udp, 127.0.0.1:8082->8080/tcp
infra2-api-1   Up 11 minutes (healthy)   127.0.0.1:3002->3001/tcp
infra2-db-1    Up 3 days (healthy)       127.0.0.1:5433->5432/tcp

## 3. Public Health
{"status":"ok","timestamp":"2026-02-02T11:35:55.874Z","uptime":668.672215625,"environment":"production","build":{"buildSha":"8b452622554df3496e44d785033a46f30c080027","buildTime":"2026-02-02T11:23:50Z"},"database":{"status":"connected","latency_ms":1},"bots":{"activeCount":1,"activeBotIds":["cml536zgi0007kjhs7y86vyxm"]},"worker":{"running":true,"processing":false,"nextRun":null},"services":{"bots":{"activeCount":1,"activeBotIds":["cml536zgi0007kjhs7y86vyxm"]},"contentWorker":{"running":true,"processing":false,"nextRun":null}},"memory":{"rss":139513856,"heapTotal":44802048,"heapUsed":36779288,"external":4001567,"arrayBuffers":267604},"response_time_ms":2}
## 4. Local Health
{"status":"ok","timestamp":"2026-02-02T11:35:55.898Z","uptime":668.695579352,"environment":"production","build":{"buildSha":"8b452622554df3496e44d785033a46f30c080027","buildTime":"2026-02-02T11:23:50Z"},"database":{"status":"connected","latency_ms":1},"bots":{"activeCount":1,"activeBotIds":["cml536zgi0007kjhs7y86vyxm"]},"worker":{"running":true,"processing":false,"nextRun":null},"services":{"bots":{"activeCount":1,"activeBotIds":["cml536zgi0007kjhs7y86vyxm"]},"contentWorker":{"running":true,"processing":false,"nextRun":null}},"memory":{"rss":139513856,"heapTotal":44802048,"heapUsed":36826672,"external":4001567,"arrayBuffers":267604},"response_time_ms":1}
## 5. Git Context
## main...origin/main
 M docs/audit/fix-stage1/BASELINE.md
?? docs/audit/fix-stage1/PLAN.md
8b452622554df3496e44d785033a46f30c080027
