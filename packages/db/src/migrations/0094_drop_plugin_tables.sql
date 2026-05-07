-- Migration 0094: drop the dormant plugin system tables.
--
-- The plugin system was disabled at the application layer for V1 productization
-- (no plugin routes mounted, no plugin worker processes started) and is now
-- being removed entirely. None of the surviving application code references
-- these tables, so DROP CASCADE is safe.
--
-- The original CREATE migrations (0029_plugin_tables.sql and downstream
-- mutations) are intentionally left in place so historical migration runs on
-- pristine databases still apply cleanly; this forward-only migration tears
-- everything down on existing databases that already created them.
--
-- Tables removed (in the order matching their FK graph; CASCADE handles the
-- rest if anything else references them):
--   plugin_webhook_deliveries
--   plugin_job_runs
--   plugin_jobs
--   plugin_logs
--   plugin_state
--   plugin_entities
--   plugin_company_settings
--   plugin_config
--   plugins

DROP TABLE IF EXISTS plugin_webhook_deliveries CASCADE;
DROP TABLE IF EXISTS plugin_job_runs CASCADE;
DROP TABLE IF EXISTS plugin_jobs CASCADE;
DROP TABLE IF EXISTS plugin_logs CASCADE;
DROP TABLE IF EXISTS plugin_state CASCADE;
DROP TABLE IF EXISTS plugin_entities CASCADE;
DROP TABLE IF EXISTS plugin_company_settings CASCADE;
DROP TABLE IF EXISTS plugin_config CASCADE;
DROP TABLE IF EXISTS plugins CASCADE;
