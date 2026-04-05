-- AI-native communication capabilities
-- 1. Transparent reasoning: add reasoning column to channel_messages
ALTER TABLE "channel_messages"
  ADD COLUMN IF NOT EXISTS "reasoning" text;
