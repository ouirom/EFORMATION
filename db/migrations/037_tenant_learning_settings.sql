-- 037_tenant_learning_settings.sql
-- Learning & gamification settings per organization (Administration >
-- Organisation), read by TenantSettingsService. Until now these were constants
-- in the code: 70 % pass mark and 3 attempts for new quizzes, certificate
-- renewal reminder 30 days before expiry, assignment reminders at D-7 / D-1 and
-- manager escalation at D+1, 100/50/10 XP per course/quiz/lesson and 250 XP per
-- level (with the dashboard and the profile disagreeing on the level number).
--
--   quiz_default_passing_score   -- % applied to new quizzes (0..100)
--   quiz_default_max_attempts    -- applied to new quizzes; 0 = unlimited
--   certificate_reminder_days    -- renewal reminder this many days before expiry; 0 = off
--   assignment_reminder_days     -- first reminder before a mandatory course's due date; 0 = off
--   assignment_urgent_days       -- last reminder before the due date; 0 = off
--   escalation_days_overdue      -- manager alerted this many days after the due date; 0 = off
--   enable_badges / enable_xp    -- gamification switches
--   leaderboard_scope            -- organization | direction | service | hidden
--   xp_per_course / xp_per_quiz / xp_per_lesson / xp_per_level -- XP scale
-- Idempotent: safe to re-run.

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('quiz_default_passing_score', 'INTEGER NOT NULL DEFAULT 70'),
      ('quiz_default_max_attempts',  'INTEGER NOT NULL DEFAULT 3'),
      ('certificate_reminder_days',  'INTEGER NOT NULL DEFAULT 30'),
      ('assignment_reminder_days',   'INTEGER NOT NULL DEFAULT 7'),
      ('assignment_urgent_days',     'INTEGER NOT NULL DEFAULT 1'),
      ('escalation_days_overdue',    'INTEGER NOT NULL DEFAULT 1'),
      ('enable_badges',              'BOOLEAN NOT NULL DEFAULT TRUE'),
      ('enable_xp',                  'BOOLEAN NOT NULL DEFAULT TRUE'),
      ('leaderboard_scope',          'VARCHAR(20) NOT NULL DEFAULT ''organization'''),
      ('xp_per_course',              'INTEGER NOT NULL DEFAULT 100'),
      ('xp_per_quiz',                'INTEGER NOT NULL DEFAULT 50'),
      ('xp_per_lesson',              'INTEGER NOT NULL DEFAULT 10'),
      ('xp_per_level',               'INTEGER NOT NULL DEFAULT 250')
    ) AS v(name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_settings' AND column_name = col.name
    ) THEN
      EXECUTE format('ALTER TABLE tenant_settings ADD COLUMN %I %s', col.name, col.definition);
    END IF;
  END LOOP;
END $$;
