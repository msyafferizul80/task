-- Script to set up the missing custom configuration variables for Supabase Webhooks
-- This error happens when a Postgres Function/Trigger tries to read these variables using current_setting()

ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://rnfcyukpihpstoukjakm.supabase.co';
ALTER DATABASE postgres SET "app.settings.supabase_anon_key" = 'YOUR_ANON_KEY_HERE'; -- Tell user to replace this or we can try to find it
-- Better approach is to use vault or general settings, but this is the fastest fix for the trigger
