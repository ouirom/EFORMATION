import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route POST /api/v1/attempts/begin
 * @desc Start a new quiz attempt: enforces max_attempts, draws the question
 * set (if the quiz uses questions_to_draw) and fixes it for this attempt so
 * a later GET /quizzes/:id/take?attemptId=X always returns the same set —
 * see quiz_attempts.question_ids.
 */
router.post(
  '/begin',
  authenticate,
  [body('quizId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const quizId = req.body.quizId;

      const quizzes = await DatabaseService.query<any>(
        'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
        { quizId, tenantId: req.user!.tenantId }
      );
      if (quizzes.length === 0) {
        throw NotFoundError('Quiz');
      }
      const quiz = quizzes[0];

      if (quiz.max_attempts) {
        const countResult = await DatabaseService.query<{ total: number }>(
          'SELECT COUNT(*) as total FROM quiz_attempts WHERE quiz_id = @quizId AND user_id = @userId',
          { quizId, userId: req.user!.id }
        );
        if (Number(countResult[0].total) >= quiz.max_attempts) {
          throw BadRequestError('Nombre maximum de tentatives atteint pour ce quiz', 'MAX_ATTEMPTS_REACHED');
        }
      }

      const lessons = await DatabaseService.query<{ duration_min: number | null }>(
        'SELECT duration_min FROM lessons WHERE id = @lessonId',
        { lessonId: quiz.lesson_id }
      );
      const requiredMinutes = lessons[0]?.duration_min || 0;
      if (requiredMinutes > 0) {
        const progress = await DatabaseService.query<{ time_spent_seconds: number }>(
          'SELECT time_spent_seconds FROM lesson_progress WHERE lesson_id = @lessonId AND user_id = @userId',
          { lessonId: quiz.lesson_id, userId: req.user!.id }
        );
        const spentSeconds = progress[0]?.time_spent_seconds || 0;
        const requiredSeconds = requiredMinutes * 60;
        if (spentSeconds < requiredSeconds) {
          const remainingMinutes = Math.ceil((requiredSeconds - spentSeconds) / 60);
          throw BadRequestError(
            `Vous devez encore passer environ ${remainingMinutes} minute(s) sur la leçon avant d'accéder au quiz`,
            'LESSON_DURATION_NOT_REACHED',
            { requiredSeconds, spentSeconds }
          );
        }
      }

      const allQuestions = await DatabaseService.query<{ id: number }>(
        'SELECT id FROM questions WHERE quiz_id = @quizId ORDER BY position',
        { quizId }
      );

      let questionIds: number[];
      if (quiz.questions_to_draw && quiz.questions_to_draw < allQuestions.length) {
        // TOP is a SQL Server prefix, LIMIT is a Postgres suffix — needs the full
        // query branched rather than a single substitutable fragment.
        const drawn = await DatabaseService.query<{ id: number }>(
          IS_PG
            ? `SELECT id FROM questions WHERE quiz_id = @quizId ORDER BY ${db.randomOrder()} LIMIT @drawCount`
            : `SELECT TOP (@drawCount) id FROM questions WHERE quiz_id = @quizId ORDER BY ${db.randomOrder()}`,
          { quizId, drawCount: quiz.questions_to_draw }
        );
        questionIds = drawn.map((q) => q.id);
      } else {
        questionIds = allQuestions.map((q) => q.id);
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, started_at, time_spent, question_ids)
             VALUES (@tenantId, @quizId, @userId, ${db.now()}, 0, @questionIds)
             RETURNING id`
          : `INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, started_at, time_spent, question_ids)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @quizId, @userId, ${db.now()}, 0, @questionIds)`,
        {
          tenantId: req.user!.tenantId,
          quizId,
          userId: req.user!.id,
          questionIds: JSON.stringify(questionIds),
        }
      );

      res.status(201).json({
        success: true,
        data: {
          attemptId: result[0].id,
          timeLimitMinutes: quiz.time_limit_minutes || undefined,
          maxAttempts: quiz.max_attempts || undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/attempts
 * @desc Submit a complete quiz attempt with all answers at once. If `attemptId`
 * is given (the normal path, from POST /attempts/begin) reuses that attempt and
 * enforces the quiz's time limit against its started_at; otherwise creates a
 * fresh attempt on the spot (back-compat for callers that skip /begin).
 */
router.post(
  '/',
  authenticate,
  [
    body('quizId').isInt(),
    body('answers').isArray(),
    body('timeSpent').optional().isInt(),
    body('attemptId').optional().isInt(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { quizId, answers, timeSpent, attemptId: bodyAttemptId } = req.body;

      // Check if quiz exists
      const quizzes = await DatabaseService.query<any>(
        'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
        { quizId, tenantId: req.user!.tenantId }
      );

      if (quizzes.length === 0) {
        throw NotFoundError('Quiz');
      }

      const quiz = quizzes[0];

      let attemptId: number;

      if (bodyAttemptId) {
        const existing = await DatabaseService.query<{ id: number; started_at: string; completed_at: string | null }>(
          `SELECT id, started_at, completed_at FROM quiz_attempts
           WHERE id = @attemptId AND quiz_id = @quizId AND user_id = @userId`,
          { attemptId: bodyAttemptId, quizId, userId: req.user!.id }
        );
        if (existing.length === 0) {
          throw NotFoundError('Attempt');
        }
        if (existing[0].completed_at) {
          throw BadRequestError('Cette tentative a déjà été soumise');
        }
        if (quiz.time_limit_minutes) {
          const elapsedMinutes = (Date.now() - new Date(existing[0].started_at).getTime()) / 60000;
          if (elapsedMinutes > quiz.time_limit_minutes + 1) {
            throw BadRequestError('Le temps imparti pour ce quiz est dépassé', 'TIME_LIMIT_EXCEEDED');
          }
        }
        attemptId = bodyAttemptId;
      } else {
        // Create attempt
        const attemptResult = await DatabaseService.query<{ id: number }>(
          IS_PG
            ? `INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, started_at, time_spent)
               VALUES (@tenantId, @quizId, @userId, ${db.now()}, @timeSpent)
               RETURNING id`
            : `INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, started_at, time_spent)
               OUTPUT INSERTED.id
               VALUES (@tenantId, @quizId, @userId, ${db.now()}, @timeSpent)`,
          {
            tenantId: req.user!.tenantId,
            quizId,
            userId: req.user!.id,
            timeSpent: timeSpent || 0,
          }
        );

        attemptId = attemptResult[0].id;
      }

      // Get all questions with their correct choices
      const questions = await DatabaseService.query<any>(
        `SELECT q.id, q.type,
                (SELECT id FROM choices WHERE question_id = q.id AND is_correct = ${db.bool(true)}) as correct_choice_id
         FROM questions q
         WHERE q.quiz_id = @quizId`,
        { quizId }
      );

      let correctCount = 0;
      const totalQuestions = questions.length;

      // Process each answer
      for (const answer of answers) {
        const question = questions.find((q: any) => q.id === answer.questionId);
        if (!question) continue;

        // For MCQ/TF, answer is the choice id (as string)
        const choiceId = answer.answer ? parseInt(answer.answer as string, 10) : null;
        const isCorrect = choiceId === question.correct_choice_id;

        if (isCorrect) {
          correctCount++;
        }

        // Save the answer
        await DatabaseService.execute(
          `INSERT INTO quiz_answers (tenant_id, attempt_id, question_id, choice_id, is_correct)
           VALUES (@tenantId, @attemptId, @questionId, @choiceId, @isCorrect)`,
          {
            tenantId: req.user!.tenantId,
            attemptId,
            questionId: answer.questionId,
            choiceId,
            isCorrect,
          }
        );
      }

      // Calculate score
      const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const passed = score >= quiz.passing_score;

      // Update attempt with score
      await DatabaseService.execute(
        `UPDATE quiz_attempts
         SET score = @score, passed = @passed, completed_at = ${db.now()}, time_spent = @timeSpent
         WHERE id = @attemptId`,
        { attemptId, score, passed, timeSpent: timeSpent || 0 }
      );

      // Get feedback for each question
      const feedback = await DatabaseService.query<any>(
        `SELECT qa.question_id, qa.is_correct as correct, qa.choice_id as selected_choice,
                (SELECT label FROM choices WHERE question_id = qa.question_id AND is_correct = ${db.bool(true)}) as correct_answer
         FROM quiz_answers qa
         WHERE qa.attempt_id = @attemptId`,
        { attemptId }
      );

      res.status(201).json({
        success: true,
        data: {
          id: attemptId,
          score,
          passed,
          passingScore: quiz.passing_score,
          totalQuestions,
          correctAnswers: correctCount,
          feedback: feedback.map((f: any) => ({
            questionId: f.question_id,
            correct: f.correct,
            correctAnswer: f.correct_answer,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/attempts/start
 * @desc Start a new quiz attempt
 */
router.post(
  '/start',
  authenticate,
  [body('quizId').isInt()],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const quizId = req.body.quizId;

      // Check if quiz exists
      const quizzes = await DatabaseService.query<any>(
        'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
        { quizId, tenantId: req.user!.tenantId }
      );

      if (quizzes.length === 0) {
        throw NotFoundError('Quiz');
      }

      // Check for existing in-progress attempt
      const existingAttempts = await DatabaseService.query<any>(
        `SELECT * FROM attempts 
         WHERE quiz_id = @quizId AND user_id = @userId AND status = 'in_progress'`,
        { quizId, userId: req.user!.id }
      );

      if (existingAttempts.length > 0) {
        res.json({
          success: true,
          data: existingAttempts[0],
          message: 'Resuming existing attempt',
        });
        return;
      }

      // Create new attempt
      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO attempts (tenant_id, quiz_id, user_id, status)
             VALUES (@tenantId, @quizId, @userId, 'in_progress')
             RETURNING id`
          : `INSERT INTO attempts (tenant_id, quiz_id, user_id, status)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @quizId, @userId, 'in_progress')`,
        { tenantId: req.user!.tenantId, quizId, userId: req.user!.id }
      );

      const attempt = await DatabaseService.query<any>(
        'SELECT * FROM attempts WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: attempt[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/attempts/:id/answer
 * @desc Submit an answer for a question
 */
router.post(
  '/:id/answer',
  authenticate,
  [
    body('questionId').isInt(),
    body('choiceId').optional().isInt(),
    body('textAnswer').optional().isString(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const attemptId = parseInt(req.params.id, 10);

      // Verify attempt belongs to user and is in progress
      const attempts = await DatabaseService.query<any>(
        `SELECT * FROM attempts 
         WHERE id = @attemptId AND user_id = @userId AND status = 'in_progress'`,
        { attemptId, userId: req.user!.id }
      );

      if (attempts.length === 0) {
        throw BadRequestError('Attempt not found or already submitted');
      }

      // Check if answer already exists
      const existingAnswers = await DatabaseService.query<any>(
        'SELECT id FROM answers WHERE attempt_id = @attemptId AND question_id = @questionId',
        { attemptId, questionId: req.body.questionId }
      );

      if (existingAnswers.length > 0) {
        // Update existing answer
        await DatabaseService.execute(
          `UPDATE answers SET choice_id = @choiceId, text_answer = @textAnswer
           WHERE attempt_id = @attemptId AND question_id = @questionId`,
          {
            attemptId,
            questionId: req.body.questionId,
            choiceId: req.body.choiceId || null,
            textAnswer: req.body.textAnswer || null,
          }
        );
      } else {
        // Create new answer
        await DatabaseService.execute(
          `INSERT INTO answers (tenant_id, attempt_id, question_id, choice_id, text_answer)
           VALUES (@tenantId, @attemptId, @questionId, @choiceId, @textAnswer)`,
          {
            tenantId: req.user!.tenantId,
            attemptId,
            questionId: req.body.questionId,
            choiceId: req.body.choiceId || null,
            textAnswer: req.body.textAnswer || null,
          }
        );
      }

      res.json({ success: true, message: 'Answer saved' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/attempts/:id/submit
 * @desc Submit quiz attempt for grading
 */
router.post('/:id/submit', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);

    // Verify attempt
    const attempts = await DatabaseService.query<any>(
      `SELECT a.*, q.passing_score 
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.id = @attemptId AND a.user_id = @userId AND a.status = 'in_progress'`,
      { attemptId, userId: req.user!.id }
    );

    if (attempts.length === 0) {
      throw BadRequestError('Attempt not found or already submitted');
    }

    const attempt = attempts[0];

    // Get all questions and answers
    const answers = await DatabaseService.query<any>(
      `SELECT a.*, q.type, c.is_correct as choice_is_correct
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       LEFT JOIN choices c ON a.choice_id = c.id
       WHERE a.attempt_id = @attemptId`,
      { attemptId }
    );

    // Calculate score
    let totalQuestions = 0;
    let correctAnswers = 0;

    const questions = await DatabaseService.query<any>(
      'SELECT id, type FROM questions WHERE quiz_id = @quizId',
      { quizId: attempt.quiz_id }
    );

    totalQuestions = questions.length;

    for (const answer of answers) {
      if (answer.type === 'mcq' || answer.type === 'true_false') {
        if (answer.choice_is_correct) {
          correctAnswers++;
          await DatabaseService.execute(
            `UPDATE answers SET is_correct = ${db.bool(true)}, points = 1 WHERE id = @id`,
            { id: answer.id }
          );
        } else {
          await DatabaseService.execute(
            `UPDATE answers SET is_correct = ${db.bool(false)}, points = 0 WHERE id = @id`,
            { id: answer.id }
          );
        }
      }
      // Essay and short_text need manual grading
    }

    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const passed = score >= attempt.passing_score;

    // Update attempt
    await DatabaseService.execute(
      `UPDATE attempts SET submitted_at = ${db.now()}, score = @score, status = 'graded'
       WHERE id = @attemptId`,
      { attemptId, score }
    );

    // Award badge if passed
    if (passed) {
      // JSON_VALUE/->> both return text, so the min_score comparison needs an
      // explicit numeric cast on the pg side (mssql implicitly converts nvarchar to int).
      const minScoreExpr = IS_PG
        ? `(${db.jsonExtract('b.criteria', 'min_score')})::numeric`
        : db.jsonExtract('b.criteria', 'min_score');

      const badges = await DatabaseService.query<any>(
        `SELECT b.id FROM badges b
         WHERE b.tenant_id = @tenantId
         AND ${minScoreExpr} <= @score`,
        { tenantId: req.user!.tenantId, score }
      );

      for (const badge of badges) {
        // Check if user already has this badge
        const existing = await DatabaseService.query<any>(
          'SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId',
          { userId: req.user!.id, badgeId: badge.id }
        );

        if (existing.length === 0) {
          await DatabaseService.execute(
            `INSERT INTO user_badges (tenant_id, user_id, badge_id)
             VALUES (@tenantId, @userId, @badgeId)`,
            { tenantId: req.user!.tenantId, userId: req.user!.id, badgeId: badge.id }
          );
        }
      }
    }

    // Get updated attempt with results
    const result = await DatabaseService.query<any>(
      `SELECT a.*,
              (SELECT COUNT(*) FROM answers WHERE attempt_id = a.id AND is_correct = ${db.bool(true)}) as correct_count,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = a.quiz_id) as total_questions
       FROM attempts a WHERE a.id = @attemptId`,
      { attemptId }
    );

    res.json({
      success: true,
      data: {
        ...result[0],
        passed,
        passingScore: attempt.passing_score,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/attempts/:id
 * @desc Get attempt details
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);

    const attempts = await DatabaseService.query<any>(
      `SELECT a.*, q.title as quiz_title, q.passing_score
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.id = @attemptId AND a.tenant_id = @tenantId`,
      { attemptId, tenantId: req.user!.tenantId }
    );

    if (attempts.length === 0) {
      throw NotFoundError('Attempt');
    }

    // Get answers with correct answers if submitted
    const showAnswers = attempts[0].status === 'graded';
    
    const answers = await DatabaseService.query<any>(
      `SELECT a.*, q.prompt, q.type,
              ${showAnswers ? 'a.is_correct, c.is_correct as correct_choice,' : ''}
              c.label as selected_choice
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       LEFT JOIN choices c ON a.choice_id = c.id
       WHERE a.attempt_id = @attemptId
       ORDER BY q.position`,
      { attemptId }
    );

    res.json({
      success: true,
      data: {
        ...attempts[0],
        answers,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/attempts/user/:userId
 * @desc Get user's attempts
 */
router.get('/user/:userId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.userId === 'me' ? req.user!.id : parseInt(req.params.userId, 10);

    // Check permissions
    if (req.user!.id !== userId && req.user!.role !== 'admin' && req.user!.role !== 'manager') {
      throw BadRequestError('Insufficient permissions');
    }

    const attempts = await DatabaseService.query<any>(
      `SELECT a.*, q.title as quiz_title, l.title as lesson_title, c.title as course_title
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       JOIN lessons l ON q.lesson_id = l.id
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       WHERE a.user_id = @userId AND a.tenant_id = @tenantId
       ORDER BY a.started_at DESC`,
      { userId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: attempts });
  } catch (error) {
    next(error);
  }
});

export default router;
