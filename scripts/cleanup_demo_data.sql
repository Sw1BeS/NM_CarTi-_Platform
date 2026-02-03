-- Cleanup known demo records from legacy seeds.
-- Run manually against the target database.

BEGIN;

DELETE FROM "RequestVariant" WHERE id IN ('var_demo_1', 'var_demo_2', 'var_demo_3');
DELETE FROM "B2bRequest" WHERE id IN ('req_demo_1', 'req_demo_2');
DELETE FROM "CarListing" WHERE id IN ('car_demo_1', 'car_demo_2', 'car_demo_3');
DELETE FROM "Lead" WHERE id IN ('lead_demo_1', 'lead_demo_2');
DELETE FROM "Integration" WHERE id IN ('int_demo_webhook', 'int_demo_telegram');
DELETE FROM "Draft" WHERE id IN (10001, 10002);
DELETE FROM "BotConfig" WHERE id IN ('bot_demo_polling', 'bot_demo_webhook');

-- MTProto demo cleanup (if it ever existed)
DELETE FROM "ChannelSource" WHERE channelId = '-1001234567890' OR username = 'competitors_auto';
DELETE FROM "MTProtoConnector" WHERE name = 'Demo Personal Account' OR sessionString = 'fake_session_string_for_demo' OR phone = '+380991234567';

COMMIT;
