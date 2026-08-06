-- Demo activity seed: enrollments, lesson progress, quiz attempts, a mandatory
-- assignment with a past due date, and certificates — so the "Mon équipe"
-- dashboard, team-report digests, and analytics have realistic non-zero data
-- to display instead of every user showing 0%/Jamais.
-- Safe to re-run: every insert is guarded by a NOT EXISTS check.
-- Run with: sqlcmd -S <server> -d db_eformation -E -i db/seed_demo_activity.sql

SET NOCOUNT ON;

DECLARE @tenantId BIGINT = 1;

IF OBJECT_ID('tempdb..#story') IS NOT NULL DROP TABLE #story;
CREATE TABLE #story (user_id BIGINT, course_id BIGINT, lessons_done INT, quiz_score INT NULL, days_ago INT);

-- course 9 = "Langue" (11 lessons), course 18 = "Gestion de projet" (4 lessons + quiz id 7)
INSERT INTO #story (user_id, course_id, lessons_done, quiz_score, days_ago) VALUES
(1, 9, 11, NULL, 2),   -- Admin Demo: fully done
(2, 9, 8, NULL, 5),    -- manager: well along
(3, 9, 11, NULL, 1),   -- Agent Demo: fully done
(4, 9, 3, NULL, 10),   -- unattached agent: just getting started
(6, 9, 0, NULL, 0),    -- enrolled, hasn't opened a lesson yet
(7, 9, 5, NULL, 7),
(9, 9, 11, NULL, 20),  -- director (peer): fully done a while ago
(16, 9, 6, NULL, 4),   -- Director Demo: halfway
(17, 9, 2, NULL, 6),   -- Supervisor Demo: just started
(1, 18, 4, 85, 2),
(2, 18, 4, 78, 5),
(3, 18, 2, NULL, 1),   -- behind — will be overdue once the assignment below lands
(9, 18, 4, 90, 3),
(16, 18, 1, NULL, 4),  -- behind — overdue
(17, 18, 0, NULL, 0);  -- not started — overdue

IF OBJECT_ID('tempdb..#lessons') IS NOT NULL DROP TABLE #lessons;
SELECT l.id as lesson_id, m.course_id,
       ROW_NUMBER() OVER (PARTITION BY m.course_id ORDER BY m.position, l.position) as rn
INTO #lessons
FROM lessons l
JOIN modules m ON l.module_id = m.id
WHERE m.course_id IN (SELECT DISTINCT course_id FROM #story);

IF OBJECT_ID('tempdb..#courseTotals') IS NOT NULL DROP TABLE #courseTotals;
SELECT course_id, COUNT(*) as total_lessons INTO #courseTotals FROM #lessons GROUP BY course_id;

-- 1) Enrollments
INSERT INTO enrollments (tenant_id, user_id, course_id, enrolled_at, progress_percent, completed_at)
SELECT @tenantId, s.user_id, s.course_id,
       DATEADD(day, -(s.days_ago + 14), SYSUTCDATETIME()),
       CAST(ROUND(100.0 * s.lessons_done / ct.total_lessons, 0) AS INT),
       CASE WHEN s.lessons_done = ct.total_lessons THEN DATEADD(day, -s.days_ago, SYSUTCDATETIME()) ELSE NULL END
FROM #story s
JOIN #courseTotals ct ON ct.course_id = s.course_id
WHERE NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = s.user_id AND e.course_id = s.course_id);

-- 2) Lesson progress: the first N lessons (by position) are marked completed
INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, course_id, status, progress_percent, started_at, last_accessed_at, completed_at, time_spent_seconds)
SELECT @tenantId, s.user_id, ls.lesson_id, s.course_id, 'completed', 100,
       DATEADD(day, -(s.days_ago + 3), SYSUTCDATETIME()),
       DATEADD(day, -s.days_ago, SYSUTCDATETIME()),
       DATEADD(day, -s.days_ago, SYSUTCDATETIME()),
       600 + (ls.rn * 37) % 900
FROM #story s
JOIN #lessons ls ON ls.course_id = s.course_id AND ls.rn <= s.lessons_done
WHERE NOT EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = s.user_id AND lp.lesson_id = ls.lesson_id);

-- ...plus one lesson "in progress" right after, for anyone not fully done — looks like an
-- active learner rather than someone frozen mid-course.
INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, course_id, status, progress_percent, started_at, last_accessed_at, completed_at, time_spent_seconds)
SELECT @tenantId, s.user_id, ls.lesson_id, s.course_id, 'in_progress', 45,
       DATEADD(day, -s.days_ago, SYSUTCDATETIME()),
       DATEADD(day, -s.days_ago, SYSUTCDATETIME()),
       NULL, 240
FROM #story s
JOIN #courseTotals ct ON ct.course_id = s.course_id
JOIN #lessons ls ON ls.course_id = s.course_id AND ls.rn = s.lessons_done + 1
WHERE s.lessons_done > 0 AND s.lessons_done < ct.total_lessons
  AND NOT EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = s.user_id AND lp.lesson_id = ls.lesson_id);

-- 3) Quiz attempts against course 18's quiz (id 7, passing score 70)
INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, started_at, completed_at, score, passed, time_spent)
SELECT @tenantId, 7, s.user_id,
       DATEADD(day, -s.days_ago, SYSUTCDATETIME()), DATEADD(day, -s.days_ago, SYSUTCDATETIME()),
       s.quiz_score, CASE WHEN s.quiz_score >= 70 THEN 1 ELSE 0 END, 480
FROM #story s
WHERE s.course_id = 18 AND s.quiz_score IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id = 7 AND qa.user_id = s.user_id);

-- 4) A mandatory course-18 assignment for direction 2, due two weeks ago — gives the
-- reminder job and "en retard" counts real rows to act on instead of staying at zero.
IF NOT EXISTS (SELECT 1 FROM course_assignments WHERE course_id = 18 AND assignment_type = 'direction' AND target_id = 2)
INSERT INTO course_assignments (tenant_id, course_id, assignment_type, target_id, is_mandatory, due_date, assigned_by)
VALUES (@tenantId, 18, 'direction', 2, 1, DATEADD(day, -14, SYSUTCDATETIME()), 1);

-- 5) Certificates for fully-completed courses (against the default template)
INSERT INTO certificates (tenant_id, user_id, course_id, serial, issued_at, validity_months, expires_at, template_id)
SELECT @tenantId, e.user_id, e.course_id,
       CONCAT('CERT-', @tenantId, '-', e.course_id, '-', e.user_id, '-', FORMAT(e.completed_at, 'yyyyMMdd')),
       e.completed_at, 12, DATEADD(month, 12, e.completed_at), 1
FROM enrollments e
WHERE e.completed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.user_id = e.user_id AND c.course_id = e.course_id);

-- Backdate one certificate to be near expiry, so the renewal-reminder job has something to send.
UPDATE certificates
SET issued_at = DATEADD(month, -11, SYSUTCDATETIME()),
    expires_at = DATEADD(month, 1, SYSUTCDATETIME())
WHERE user_id = 9 AND course_id = 9;

SELECT 'enrollments' as seeded_table, COUNT(*) as row_count FROM enrollments
UNION ALL SELECT 'lesson_progress', COUNT(*) FROM lesson_progress
UNION ALL SELECT 'quiz_attempts', COUNT(*) FROM quiz_attempts
UNION ALL SELECT 'course_assignments', COUNT(*) FROM course_assignments
UNION ALL SELECT 'certificates', COUNT(*) FROM certificates;
