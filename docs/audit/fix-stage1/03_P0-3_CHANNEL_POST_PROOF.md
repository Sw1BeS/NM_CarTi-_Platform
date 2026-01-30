# P0-3 Channel Post Proof

## SQL: duplicates by (sourceChatId, sourceMessageId)
 sourceChatId | sourceMessageId | cnt 
--------------+-----------------+-----
(0 rows)


## Bot channelMode (BotConfig.config)
            id             | channelmode 
---------------------------+-------------
 cmkz42m4n0001iq3sxpbhq4ey | INVENTORY
(1 row)


## Mode behavior
- INVENTORY: creates CarListing with sourceChatId/sourceMessageId dedup (apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts)
- CONTENT: creates Draft with metadata.channelId/messageId dedup (same file)
