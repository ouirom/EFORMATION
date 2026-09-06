import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { db, IS_PG } from '../database/db-helpers';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// ==================== QUIZZES ====================

router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const lessonId = req.query.lessonId as string;
  let query = `SELECT q.*, l.title as lesson_title,
                      (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count
               FROM quizzes q
               JOIN lessons l ON q.lesson_id = l.id
               WHERE q.tenant_id = @tenantId`;
  const params: Record<string, any> = { tenantId: req.user!.tenantId };

  if (lessonId) {
    query += ' AND q.lesson_id = @lessonId';
    params.lessonId = parseInt(lessonId, 10);
  }

  query += ' ORDER BY q.created_at DESC';

  const quizzes = await DatabaseService.query<any>(query, params);
  res.json({ success: true, data: quizzes });
}));

router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const quizId = parseInt(req.params.id, 10);

  const quizzes = await DatabaseService.query<any>(
    'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
    { quizId, tenantId: req.user!.tenantId }
  );

  if (quizzes.length === 0) {
    throw NotFoundError('Quiz');
  }

  const questions = await DatabaseService.query<any>(
    'SELECT * FROM questions WHERE quiz_id = @quizId ORDER BY position',
    { quizId }
  );

  const choicesByQuestion = new Map<number, any[]>();
  if (questions.length > 0) {
    const questionIds: number[] = questions.map((q: any) => q.id);
    const placeholders = questionIds.map((_, i) => `@questionId${i}`).join(', ');
    const params: Record<string, any> = {};
    questionIds.forEach((id, i) => { params[`questionId${i}`] = id; });

    const allChoices = await DatabaseService.query<any>(
      `SELECT id, question_id, label, is_correct, position FROM choices WHERE question_id IN (${placeholders}) ORDER BY question_id, position`,
      params
    );
    for (const c of allChoices) {
      const list = choicesByQuestion.get(c.question_id) || [];
      // Map is_correct to isCorrect for frontend compatibility
      list.push({ id: c.id, label: c.label, isCorrect: c.is_correct, position: c.position });
      choicesByQuestion.set(c.question_id, list);
    }
  }

  const questionsWithChoices = questions.map((q: any) => ({
    ...q,
    choices: choicesByQuestion.get(q.id) || [],
  }));

  res.json({
    success: true,
    data: {
      ...quizzes[0],
      questions: questionsWithChoices,
    },
  });
}));

// Get quiz for taking (without correct answers)
router.get('/:id/take', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const quizId = parseInt(req.params.id, 10);
  const attemptId = req.query.attemptId ? parseInt(req.query.attemptId as string, 10) : undefined;

  const quizzes = await DatabaseService.query<any>(
    'SELECT id, title, passing_score, randomized, shuffle_choices FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
    { quizId, tenantId: req.user!.tenantId }
  );

  if (quizzes.length === 0) {
    throw NotFoundError('Quiz');
  }
  const quiz = quizzes[0];

  let questions: any[];

  if (attemptId) {
    // A live attempt: the order was fixed by /attempts/begin (question_ids, drawn
    // and stored once) so refetching mid-attempt returns the exact same set.
    const attempts = await DatabaseService.query<{ question_ids: string | null }>(
      `SELECT question_ids FROM quiz_attempts WHERE id = @attemptId AND quiz_id = @quizId AND user_id = @userId`,
      { attemptId, quizId, userId: req.user!.id }
    );
    if (attempts.length === 0) {
      throw NotFoundError('Attempt');
    }
    const questionIds: number[] = db.parseJsonColumn(attempts[0].question_ids) || [];
    const allQuestions = await DatabaseService.query<any>(
      'SELECT id, type, prompt, position, points FROM questions WHERE quiz_id = @quizId',
      { quizId }
    );
    const byId = new Map(allQuestions.map((q: any) => [q.id, q]));
    questions = questionIds.map((id) => byId.get(id)).filter(Boolean);
  } else {
    // No attempt started yet (instructions/preview screen) — live-randomize per fetch.
    questions = await DatabaseService.query<any>(
      'SELECT id, type, prompt, position, points FROM questions WHERE quiz_id = @quizId ORDER BY position',
      { quizId }
    );
    if (quiz.randomized) {
      questions = questions.sort(() => Math.random() - 0.5);
    }
  }

  const choiceQuestionIds: number[] = questions
    .filter((q: any) => q.type === 'mcq' || q.type === 'true_false')
    .map((q: any) => q.id);

  const choicesByQuestion = new Map<number, any[]>();
  if (choiceQuestionIds.length > 0) {
    const placeholders = choiceQuestionIds.map((_, i) => `@questionId${i}`).join(', ');
    const params: Record<string, any> = {};
    choiceQuestionIds.forEach((id, i) => { params[`questionId${i}`] = id; });

    const allChoices = await DatabaseService.query<any>(
      `SELECT id, question_id, label, position FROM choices WHERE question_id IN (${placeholders}) ORDER BY question_id, position`,
      params
    );
    for (const c of allChoices) {
      const list = choicesByQuestion.get(c.question_id) || [];
      list.push(c);
      choicesByQuestion.set(c.question_id, list);
    }
  }

  const questionsWithChoices = questions.map((q: any) => {
    if (q.type === 'mcq' || q.type === 'true_false') {
      let choices = choicesByQuestion.get(q.id) || [];
      if (quiz.shuffle_choices) {
        choices = [...choices].sort(() => Math.random() - 0.5);
      }
      return { ...q, choices };
    }
    return q;
  });

  res.json({
    success: true,
    data: {
      ...quiz,
      questions: questionsWithChoices,
    },
  });
}));

// ==================== AVAILABLE QUESTIONS ====================

// Get available questions for selection (questions not yet in any quiz or from question bank)
router.get('/:id/available-questions', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const quizId = parseInt(req.params.id, 10);

  // First verify the quiz exists and belongs to this tenant
  const quizzes = await DatabaseService.query<any>(
    'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
    { quizId, tenantId: req.user!.tenantId }
  );

  if (quizzes.length === 0) {
    throw NotFoundError('Quiz');
  }

  // Get all questions for this tenant that are not assigned to this specific quiz
  const questions = await DatabaseService.query<any>(
    `SELECT q.id, q.type, q.prompt,
            (SELECT COUNT(*) FROM choices WHERE question_id = q.id) as choice_count
     FROM questions q
     WHERE q.tenant_id = @tenantId
       AND (q.quiz_id IS NULL OR q.quiz_id != @quizId)
     ORDER BY q.created_at DESC`,
    { tenantId: req.user!.tenantId, quizId }
  );

  res.json({ success: true, data: questions });
}));

// Add questions to quiz
router.post(
  '/:id/add-questions',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('questionIds').isArray({ min: 1 }).withMessage('At least one question is required'),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const quizId = parseInt(req.params.id, 10);
    const questionIds: number[] = req.body.questionIds;

    // Verify quiz exists and belongs to tenant
    const quizzes = await DatabaseService.query<any>(
      'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
      { quizId, tenantId: req.user!.tenantId }
    );

    if (quizzes.length === 0) {
      throw NotFoundError('Quiz');
    }

    // Get current max position in this quiz
    const maxPosition = await DatabaseService.query<any>(
      'SELECT COALESCE(MAX(position), 0) as max_pos FROM questions WHERE quiz_id = @quizId',
      { quizId }
    );

    let nextPosition = (maxPosition[0].max_pos || 0) + 1;

    // Add questions to quiz
    for (const questionId of questionIds) {
      // Check if question already in quiz
      const existing = await DatabaseService.query<any>(
        'SELECT id FROM questions WHERE id = @questionId AND quiz_id = @quizId',
        { questionId, quizId }
      );

      if (existing.length === 0) {
        await DatabaseService.execute(
          `UPDATE questions SET quiz_id = @quizId, position = @position
           WHERE id = @questionId AND tenant_id = @tenantId`,
          { quizId, questionId, position: nextPosition, tenantId: req.user!.tenantId }
        );
        nextPosition++;
      }
    }

    // Return updated quiz with questions
    const questions = await DatabaseService.query<any>(
      'SELECT * FROM questions WHERE quiz_id = @quizId ORDER BY position',
      { quizId }
    );

    res.json({ success: true, data: { quizId, questions } });
  })
);

// Remove question from quiz
router.post(
  '/:id/remove-question/:questionId',
  authenticate,
  authorize('admin', 'director', 'manager'),
  asyncHandler(async (req: AuthRequest, res) => {
    const quizId = parseInt(req.params.id, 10);
    const questionId = parseInt(req.params.questionId, 10);

    // Verify quiz exists and belongs to tenant
    const quizzes = await DatabaseService.query<any>(
      'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
      { quizId, tenantId: req.user!.tenantId }
    );

    if (quizzes.length === 0) {
      throw NotFoundError('Quiz');
    }

    // Remove the question from quiz by setting quiz_id to null
    await DatabaseService.execute(
      'UPDATE questions SET quiz_id = NULL, position = NULL WHERE id = @questionId AND quiz_id = @quizId AND tenant_id = @tenantId',
      { questionId, quizId, tenantId: req.user!.tenantId }
    );

    // Reorder remaining questions
    const remaining = await DatabaseService.query<any>(
      'SELECT id FROM questions WHERE quiz_id = @quizId ORDER BY position',
      { quizId }
    );

    for (let i = 0; i < remaining.length; i++) {
      await DatabaseService.execute(
        'UPDATE questions SET position = @position WHERE id = @questionId',
        { position: i + 1, questionId: remaining[i].id }
      );
    }

    res.json({ success: true, message: 'Question removed from quiz' });
  })
);

// Reorder questions
router.post(
  '/:id/reorder-question',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('questionId').isInt(),
    body('direction').isIn(['up', 'down']),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const quizId = parseInt(req.params.id, 10);
    const { questionId, direction } = req.body;

    // Verify quiz exists and belongs to tenant
    const quizzes = await DatabaseService.query<any>(
      'SELECT id FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
      { quizId, tenantId: req.user!.tenantId }
    );

    if (quizzes.length === 0) {
      throw NotFoundError('Quiz');
    }

    // Get the question's current position
    const question = await DatabaseService.query<any>(
      'SELECT position FROM questions WHERE id = @questionId AND quiz_id = @quizId AND tenant_id = @tenantId',
      { questionId, quizId, tenantId: req.user!.tenantId }
    );

    if (question.length === 0) {
      throw NotFoundError('Question');
    }

    const currentPos = question[0].position;

    if (direction === 'up' && currentPos > 1) {
      // Find question at position - 1
      const prevQuestion = await DatabaseService.query<any>(
        'SELECT id FROM questions WHERE quiz_id = @quizId AND position = @position',
        { quizId, position: currentPos - 1 }
      );

      if (prevQuestion.length > 0) {
        // Swap positions
        await DatabaseService.execute(
          'UPDATE questions SET position = @position WHERE id = @questionId',
          { position: currentPos - 1, questionId }
        );
        await DatabaseService.execute(
          'UPDATE questions SET position = @position WHERE id = @questionId',
          { position: currentPos, questionId: prevQuestion[0].id }
        );
      }
    } else if (direction === 'down') {
      // Find question at position + 1
      const nextQuestion = await DatabaseService.query<any>(
        'SELECT id FROM questions WHERE quiz_id = @quizId AND position = @position',
        { quizId, position: currentPos + 1 }
      );

      if (nextQuestion.length > 0) {
        // Swap positions
        await DatabaseService.execute(
          'UPDATE questions SET position = @position WHERE id = @questionId',
          { position: currentPos + 1, questionId }
        );
        await DatabaseService.execute(
          'UPDATE questions SET position = @position WHERE id = @questionId',
          { position: currentPos, questionId: nextQuestion[0].id }
        );
      }
    }

    res.json({ success: true, message: 'Question reordered' });
  })
);

router.post(
  '/',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('lessonId').isInt(),
    body('title').notEmpty().trim(),
    body('passingScore').optional().isInt({ min: 0, max: 100 }),
    body('randomized').optional().isBoolean(),
    body('questionsToDraw').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);

    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO quizzes (tenant_id, lesson_id, title, passing_score, randomized, questions_to_draw)
           VALUES (@tenantId, @lessonId, @title, @passingScore, @randomized, @questionsToDraw)
           RETURNING id`
        : `INSERT INTO quizzes (tenant_id, lesson_id, title, passing_score, randomized, questions_to_draw)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @lessonId, @title, @passingScore, @randomized, @questionsToDraw)`,
      {
        tenantId: req.user!.tenantId,
        lessonId: req.body.lessonId,
        title: req.body.title,
        passingScore: req.body.passingScore || 70,
        randomized: req.body.randomized || false,
        questionsToDraw: req.body.questionsToDraw || null,
      }
    );

    const quiz = await DatabaseService.query<any>(
      'SELECT * FROM quizzes WHERE id = @id',
      { id: result[0].id }
    );

    res.status(201).json({ success: true, data: quiz[0] });
  })
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('instructions').optional().trim(),
    body('passingScore').optional().isInt({ min: 0, max: 100 }),
    body('randomized').optional().isBoolean(),
    body('timeLimitMinutes').optional().isInt({ min: 0 }),
    body('maxAttempts').optional().isInt({ min: 1 }),
    body('expiresAt').optional().isISO8601(),
    body('badgeId').optional().isInt(),
    body('certificateEnabled').optional().isBoolean(),
    body('showCorrectAnswers').optional().isBoolean(),
    body('shuffleChoices').optional().isBoolean(),
    body('questionsToDraw').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const quizId = parseInt(req.params.id, 10);

    const updateFields: string[] = [];
    const params: Record<string, any> = { quizId, tenantId: req.user!.tenantId };


    if (req.body.title !== undefined) {
      updateFields.push('title = @title');
      params.title = req.body.title;
    }
    if (req.body.description !== undefined) {
      updateFields.push('description = @description');
      params.description = req.body.description;
    }
    if (req.body.instructions !== undefined) {
      updateFields.push('instructions = @instructions');
      params.instructions = req.body.instructions;
    }
    if (req.body.passingScore !== undefined) {
      updateFields.push('passing_score = @passingScore');
      params.passingScore = req.body.passingScore;
    }
    if (req.body.randomized !== undefined) {
      updateFields.push('randomized = @randomized');
      params.randomized = req.body.randomized;
    }
    if (req.body.timeLimitMinutes !== undefined) {
      updateFields.push('time_limit_minutes = @timeLimitMinutes');
      params.timeLimitMinutes = req.body.timeLimitMinutes;
    }
    if (req.body.maxAttempts !== undefined) {
      updateFields.push('max_attempts = @maxAttempts');
      params.maxAttempts = req.body.maxAttempts;
    }
    if (req.body.expiresAt !== undefined) {
      updateFields.push('expires_at = @expiresAt');
      params.expiresAt = req.body.expiresAt;
    }
    if (req.body.badgeId !== undefined) {
      updateFields.push('badge_id = @badgeId');
      params.badgeId = req.body.badgeId;
    }
    if (req.body.certificateEnabled !== undefined) {
      updateFields.push('certificate_enabled = @certificateEnabled');
      params.certificateEnabled = req.body.certificateEnabled;
    }
    if (req.body.showCorrectAnswers !== undefined) {
      updateFields.push('show_correct_answers = @showCorrectAnswers');
      params.showCorrectAnswers = req.body.showCorrectAnswers;
    }
    if (req.body.shuffleChoices !== undefined) {
      updateFields.push('shuffle_choices = @shuffleChoices');
      params.shuffleChoices = req.body.shuffleChoices;
    }
    if (req.body.questionsToDraw !== undefined) {
      updateFields.push('questions_to_draw = @questionsToDraw');
      params.questionsToDraw = req.body.questionsToDraw || null;
    }

    if (updateFields.length > 0) {
      await DatabaseService.execute(
        `UPDATE quizzes SET ${updateFields.join(', ')} WHERE id = @quizId AND tenant_id = @tenantId`,
        params
      );
    }

    const quiz = await DatabaseService.query<any>(
      'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
      { quizId, tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: quiz[0] });
  })
);

router.delete('/:id', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const quizId = parseInt(req.params.id, 10);
  await DatabaseService.execute(
    'DELETE FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId',
    { quizId, tenantId: req.user!.tenantId }
  );
  res.json({ success: true, message: 'Quiz deleted' });
}));

// ==================== QUESTIONS ====================

router.post(
  '/:quizId/questions',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('type').isIn(['mcq', 'true_false', 'short_text', 'essay']),
    body('prompt').notEmpty(),
    body('position').optional().isInt(),
    body('choices').optional().isArray(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const quizId = parseInt(req.params.quizId, 10);

    let position = req.body.position;
    if (position === undefined) {
      const maxPos = await DatabaseService.query<{ max_pos: number }>(
        'SELECT COALESCE(MAX(position), 0) as max_pos FROM questions WHERE quiz_id = @quizId',
        { quizId }
      );
      position = maxPos[0].max_pos + 1;
    }

    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO questions (tenant_id, quiz_id, type, prompt, position)
           VALUES (@tenantId, @quizId, @type, @prompt, @position)
           RETURNING id`
        : `INSERT INTO questions (tenant_id, quiz_id, type, prompt, position)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @quizId, @type, @prompt, @position)`,
      {
        tenantId: req.user!.tenantId,
        quizId,
        type: req.body.type,
        prompt: req.body.prompt,
        position,
      }
    );

    const questionId = result[0].id;

    // Add choices if provided (for MCQ/true_false)
    if (req.body.choices && req.body.choices.length > 0) {
      for (let i = 0; i < req.body.choices.length; i++) {
        const choice = req.body.choices[i];
        await DatabaseService.execute(
          `INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
           VALUES (@tenantId, @questionId, @label, @isCorrect, @position)`,
          {
            tenantId: req.user!.tenantId,
            questionId,
            label: choice.label,
            isCorrect: choice.isCorrect || false,
            position: i + 1,
          }
        );
      }
    }

    const question = await DatabaseService.query<any>(
      'SELECT * FROM questions WHERE id = @questionId',
      { questionId }
    );

    const choices = await DatabaseService.query<any>(
      'SELECT * FROM choices WHERE question_id = @questionId ORDER BY position',
      { questionId }
    );

    // Map is_correct to isCorrect for frontend compatibility
    const mappedChoices = choices.map((c: any) => ({
      id: c.id,
      label: c.label,
      isCorrect: c.is_correct,
      position: c.position,
    }));

    res.status(201).json({
      success: true,
      data: { ...question[0], choices: mappedChoices },
    });
  })
);

router.put(
  '/:quizId/questions/:questionId',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('prompt').optional(),
    body('position').optional().isInt(),
    body('choices').optional().isArray(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const questionId = parseInt(req.params.questionId, 10);

    const updateFields: string[] = [];
    const params: Record<string, any> = { questionId, tenantId: req.user!.tenantId };

    if (req.body.prompt) {
      updateFields.push('prompt = @prompt');
      params.prompt = req.body.prompt;
    }
    if (req.body.position !== undefined) {
      updateFields.push('position = @position');
      params.position = req.body.position;
    }

    if (updateFields.length > 0) {
      await DatabaseService.execute(
        `UPDATE questions SET ${updateFields.join(', ')} WHERE id = @questionId AND tenant_id = @tenantId`,
        params
      );
    }

    // Update choices if provided
    if (req.body.choices) {
      // Delete existing choices
      await DatabaseService.execute(
        'DELETE FROM choices WHERE question_id = @questionId',
        { questionId }
      );

      // Add new choices
      for (let i = 0; i < req.body.choices.length; i++) {
        const choice = req.body.choices[i];
        await DatabaseService.execute(
          `INSERT INTO choices (tenant_id, question_id, label, is_correct, position)
           VALUES (@tenantId, @questionId, @label, @isCorrect, @position)`,
          {
            tenantId: req.user!.tenantId,
            questionId,
            label: choice.label,
            isCorrect: choice.isCorrect || false,
            position: i + 1,
          }
        );
      }
    }

    const question = await DatabaseService.query<any>(
      'SELECT * FROM questions WHERE id = @questionId',
      { questionId }
    );

    const choices = await DatabaseService.query<any>(
      'SELECT * FROM choices WHERE question_id = @questionId ORDER BY position',
      { questionId }
    );

    // Map is_correct to isCorrect for frontend compatibility
    const mappedChoices = choices.map((c: any) => ({
      id: c.id,
      label: c.label,
      isCorrect: c.is_correct,
      position: c.position,
    }));

    res.json({
      success: true,
      data: { ...question[0], choices: mappedChoices },
    });
  })
);

router.delete(
  '/:quizId/questions/:questionId',
  authenticate,
  authorize('admin', 'director', 'manager'),
  asyncHandler(async (req: AuthRequest, res) => {
    const questionId = parseInt(req.params.questionId, 10);

    // First delete quiz_answers for this question
    await DatabaseService.execute(
      'DELETE FROM quiz_answers WHERE question_id = @questionId',
      { questionId }
    );

    // Delete answers for this question (answers references choices, so delete answers first)
    await DatabaseService.execute(
      'DELETE FROM answers WHERE question_id = @questionId',
      { questionId }
    );

    // Delete all choices for this question
    await DatabaseService.execute(
      'DELETE FROM choices WHERE question_id = @questionId',
      { questionId }
    );

    // Then delete the question
    await DatabaseService.execute(
      'DELETE FROM questions WHERE id = @questionId AND tenant_id = @tenantId',
      { questionId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Question deleted' });
  })
);

export default router;
