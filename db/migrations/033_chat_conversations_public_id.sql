-- 033_chat_conversations_public_id.sql
-- Opaque public identifier for chat conversations, used in the browser-facing
-- /chat/:id URL instead of the sequential internal id -- mirrors the pattern
-- established for courses/lessons in 030_public_ids.sql (see
-- backend/src/utils/resolvePublicId.ts for the dual-mode lookup). A sequential
-- id in the address bar lets anyone type/increment their way into a conversation
-- they don't belong to; the server still enforces participation (403), but the
-- opaque id also stops that enumeration from confirming which ids exist.
-- gen_random_uuid() is native to Postgres 13+, no pgcrypto extension needed.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'public_id'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_chat_conversations_public_id'
  ) THEN
    ALTER TABLE chat_conversations ADD CONSTRAINT uq_chat_conversations_public_id UNIQUE (public_id);
  END IF;
END $$;
