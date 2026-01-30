# P0-1 Lead Identity Proof

## SQL: latest leads (last 10 minutes)
            id             | clientName  | tg_username |   tg_name   | tg_chat | tg_user 
---------------------------+-------------+-------------+-------------+---------+---------
 cml0qbs260005j3v0y4ulgi1b | Alice Buyer | alicebuyer  | Alice Buyer | 555002  | 555002
 cml0q89jb0005g3rop3j1wocf | Demo User   | demouser    | Demo User   | 555001  | 555001
(2 rows)


## Fix locations
- apps/server/src/modules/Communication/telegram/core/leadService.ts
- apps/server/src/modules/Communication/telegram/core/leadService.test.ts
