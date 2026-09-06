-- 031_chat_message_reply.sql
-- Lets a chat message reference the message it's replying to, so the UI can show
-- a quoted preview above the reply. Nullable -- most messages aren't replies.
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'reply_to_message_id'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN reply_to_message_id BIGINT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_chat_msg_reply_to'
  ) THEN
    ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_msg_reply_to
      FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chat_messages_reply_to_message_id'
  ) THEN
    CREATE INDEX idx_chat_messages_reply_to_message_id ON chat_messages(reply_to_message_id);
  END IF;
END $$;
