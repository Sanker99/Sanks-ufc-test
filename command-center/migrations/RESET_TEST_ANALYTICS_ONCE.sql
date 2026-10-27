-- ONE-TIME RESET: isolated sanks-command-center-test D1 analytics ONLY.
-- Deletes all tracked visits, events, historical counts and map locations.
-- Does not remove schema, login credentials or administrator sessions.
-- Execute in Cloudflare D1 Console for sanks-command-center-test (NOT production).
BEGIN TRANSACTION;
DELETE FROM event_cities;
DELETE FROM events;
DELETE FROM sessions;
DELETE FROM days;
DELETE FROM visitors;
DELETE FROM activity_totals;
DELETE FROM limits;
DELETE FROM meta WHERE key='tracking_started' OR key LIKE 'collection_capped_%';
COMMIT;
