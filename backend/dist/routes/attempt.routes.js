"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route POST /api/v1/attempts
 * @desc Submit a complete quiz attempt with all answers at once
 */
router.post('/', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('quizId').isInt(),
    (0, express_validator_1.body)('answers').isArray(),
    (0, express_validator_1.body)('timeSpent').optional().isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const { quizId, answers, timeSpent } = req.body;
        // Check if quiz exists
        const quizzes = await database_service_1.DatabaseService.query('SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId', { quizId, tenantId: req.user.tenantId });
        if (quizzes.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Quiz');
        }
        const quiz = quizzes[0];
        // Create attempt
        const attemptResult = await database_service_1.DatabaseService.query(`INSERT INTO attempts (tenant_id, quiz_id, user_id, started_at, time_spent)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @quizId, @userId, SYSUTCDATETIME(), @timeSpent)`, {
            tenantId: req.user.tenantId,
            quizId,
            userId: req.user.id,
            timeSpent: timeSpent || 0,
        });
        const attemptId = attemptResult[0].id;
        // Get all questions with their correct choices
        const questions = await database_service_1.DatabaseService.query(`SELECT q.id, q.type, 
                (SELECT id FROM choices WHERE question_id = q.id AND is_correct = 1) as correct_choice_id
         FROM questions q
         WHERE q.quiz_id = @quizId`, { quizId });
        let correctCount = 0;
        const totalQuestions = questions.length;
        // Process each answer
        for (const answer of answers) {
            const question = questions.find((q) => q.id === answer.questionId);
            if (!question)
                continue;
            // For MCQ/TF, answer is the choice id (as string)
            const choiceId = answer.answer ? parseInt(answer.answer, 10) : null;
            const isCorrect = choiceId === question.correct_choice_id;
            if (isCorrect) {
                correctCount++;
            }
            // Save the answer
            await database_service_1.DatabaseService.execute(`INSERT INTO answers (tenant_id, attempt_id, question_id, choice_id, is_correct)
           VALUES (@tenantId, @attemptId, @questionId, @choiceId, @isCorrect)`, {
                tenantId: req.user.tenantId,
                attemptId,
                questionId: answer.questionId,
                choiceId,
                isCorrect,
            });
        }
        // Calculate score
        const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const passed = score >= quiz.passing_score;
        // Update attempt with score
        await database_service_1.DatabaseService.execute(`UPDATE attempts 
         SET score = @score, passed = @passed, completed_at = SYSUTCDATETIME()
         WHERE id = @attemptId`, { attemptId, score, passed });
        // Get feedback for each question
        const feedback = await database_service_1.DatabaseService.query(`SELECT qa.question_id, qa.is_correct as correct, qa.choice_id as selected_choice,
                (SELECT label FROM choices WHERE question_id = qa.question_id AND is_correct = 1) as correct_answer
         FROM answers qa
         WHERE qa.attempt_id = @attemptId`, { attemptId });
        res.status(201).json({
            success: true,
            data: {
                id: attemptId,
                score,
                passed,
                passingScore: quiz.passing_score,
                totalQuestions,
                correctAnswers: correctCount,
                feedback: feedback.map((f) => ({
                    questionId: f.question_id,
                    correct: f.correct,
                    correctAnswer: f.correct_answer,
                })),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/attempts/start
 * @desc Start a new quiz attempt
 */
router.post('/start', auth_middleware_1.authenticate, [(0, express_validator_1.body)('quizId').isInt()], async (req, res, next) => {
    try {
        validate(req);
        const quizId = req.body.quizId;
        // Check if quiz exists
        const quizzes = await database_service_1.DatabaseService.query('SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId', { quizId, tenantId: req.user.tenantId });
        if (quizzes.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Quiz');
        }
        // Check for existing in-progress attempt
        const existingAttempts = await database_service_1.DatabaseService.query(`SELECT * FROM attempts 
         WHERE quiz_id = @quizId AND user_id = @userId AND status = 'in_progress'`, { quizId, userId: req.user.id });
        if (existingAttempts.length > 0) {
            res.json({
                success: true,
                data: existingAttempts[0],
                message: 'Resuming existing attempt',
            });
            return;
        }
        // Create new attempt
        const result = await database_service_1.DatabaseService.query(`INSERT INTO attempts (tenant_id, quiz_id, user_id, status)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @quizId, @userId, 'in_progress')`, { tenantId: req.user.tenantId, quizId, userId: req.user.id });
        const attempt = await database_service_1.DatabaseService.query('SELECT * FROM attempts WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: attempt[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/attempts/:id/answer
 * @desc Submit an answer for a question
 */
router.post('/:id/answer', auth_middleware_1.authenticate, [
    (0, express_validator_1.body)('questionId').isInt(),
    (0, express_validator_1.body)('choiceId').optional().isInt(),
    (0, express_validator_1.body)('textAnswer').optional().isString(),
], async (req, res, next) => {
    try {
        validate(req);
        const attemptId = parseInt(req.params.id, 10);
        // Verify attempt belongs to user and is in progress
        const attempts = await database_service_1.DatabaseService.query(`SELECT * FROM attempts 
         WHERE id = @attemptId AND user_id = @userId AND status = 'in_progress'`, { attemptId, userId: req.user.id });
        if (attempts.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('Attempt not found or already submitted');
        }
        // Check if answer already exists
        const existingAnswers = await database_service_1.DatabaseService.query('SELECT id FROM answers WHERE attempt_id = @attemptId AND question_id = @questionId', { attemptId, questionId: req.body.questionId });
        if (existingAnswers.length > 0) {
            // Update existing answer
            await database_service_1.DatabaseService.execute(`UPDATE answers SET choice_id = @choiceId, text_answer = @textAnswer
           WHERE attempt_id = @attemptId AND question_id = @questionId`, {
                attemptId,
                questionId: req.body.questionId,
                choiceId: req.body.choiceId || null,
                textAnswer: req.body.textAnswer || null,
            });
        }
        else {
            // Create new answer
            await database_service_1.DatabaseService.execute(`INSERT INTO answers (tenant_id, attempt_id, question_id, choice_id, text_answer)
           VALUES (@tenantId, @attemptId, @questionId, @choiceId, @textAnswer)`, {
                tenantId: req.user.tenantId,
                attemptId,
                questionId: req.body.questionId,
                choiceId: req.body.choiceId || null,
                textAnswer: req.body.textAnswer || null,
            });
        }
        res.json({ success: true, message: 'Answer saved' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/attempts/:id/submit
 * @desc Submit quiz attempt for grading
 */
router.post('/:id/submit', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const attemptId = parseInt(req.params.id, 10);
        // Verify attempt
        const attempts = await database_service_1.DatabaseService.query(`SELECT a.*, q.passing_score 
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.id = @attemptId AND a.user_id = @userId AND a.status = 'in_progress'`, { attemptId, userId: req.user.id });
        if (attempts.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('Attempt not found or already submitted');
        }
        const attempt = attempts[0];
        // Get all questions and answers
        const answers = await database_service_1.DatabaseService.query(`SELECT a.*, q.type, c.is_correct as choice_is_correct
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       LEFT JOIN choices c ON a.choice_id = c.id
       WHERE a.attempt_id = @attemptId`, { attemptId });
        // Calculate score
        let totalQuestions = 0;
        let correctAnswers = 0;
        const questions = await database_service_1.DatabaseService.query('SELECT id, type FROM questions WHERE quiz_id = @quizId', { quizId: attempt.quiz_id });
        totalQuestions = questions.length;
        for (const answer of answers) {
            if (answer.type === 'mcq' || answer.type === 'true_false') {
                if (answer.choice_is_correct) {
                    correctAnswers++;
                    await database_service_1.DatabaseService.execute('UPDATE answers SET is_correct = 1, points = 1 WHERE id = @id', { id: answer.id });
                }
                else {
                    await database_service_1.DatabaseService.execute('UPDATE answers SET is_correct = 0, points = 0 WHERE id = @id', { id: answer.id });
                }
            }
            // Essay and short_text need manual grading
        }
        const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
        const passed = score >= attempt.passing_score;
        // Update attempt
        await database_service_1.DatabaseService.execute(`UPDATE attempts SET submitted_at = SYSUTCDATETIME(), score = @score, status = 'graded'
       WHERE id = @attemptId`, { attemptId, score });
        // Award badge if passed
        if (passed) {
            const badges = await database_service_1.DatabaseService.query(`SELECT b.id FROM badges b
         WHERE b.tenant_id = @tenantId 
         AND JSON_VALUE(b.criteria, '$.min_score') <= @score`, { tenantId: req.user.tenantId, score });
            for (const badge of badges) {
                // Check if user already has this badge
                const existing = await database_service_1.DatabaseService.query('SELECT id FROM user_badges WHERE user_id = @userId AND badge_id = @badgeId', { userId: req.user.id, badgeId: badge.id });
                if (existing.length === 0) {
                    await database_service_1.DatabaseService.execute(`INSERT INTO user_badges (tenant_id, user_id, badge_id)
             VALUES (@tenantId, @userId, @badgeId)`, { tenantId: req.user.tenantId, userId: req.user.id, badgeId: badge.id });
                }
            }
        }
        // Get updated attempt with results
        const result = await database_service_1.DatabaseService.query(`SELECT a.*, 
              (SELECT COUNT(*) FROM answers WHERE attempt_id = a.id AND is_correct = 1) as correct_count,
              (SELECT COUNT(*) FROM questions WHERE quiz_id = a.quiz_id) as total_questions
       FROM attempts a WHERE a.id = @attemptId`, { attemptId });
        res.json({
            success: true,
            data: {
                ...result[0],
                passed,
                passingScore: attempt.passing_score,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/attempts/:id
 * @desc Get attempt details
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const attemptId = parseInt(req.params.id, 10);
        const attempts = await database_service_1.DatabaseService.query(`SELECT a.*, q.title as quiz_title, q.passing_score
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.id = @attemptId AND a.tenant_id = @tenantId`, { attemptId, tenantId: req.user.tenantId });
        if (attempts.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Attempt');
        }
        // Get answers with correct answers if submitted
        const showAnswers = attempts[0].status === 'graded';
        const answers = await database_service_1.DatabaseService.query(`SELECT a.*, q.prompt, q.type,
              ${showAnswers ? 'a.is_correct, c.is_correct as correct_choice,' : ''}
              c.label as selected_choice
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       LEFT JOIN choices c ON a.choice_id = c.id
       WHERE a.attempt_id = @attemptId
       ORDER BY q.position`, { attemptId });
        res.json({
            success: true,
            data: {
                ...attempts[0],
                answers,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/attempts/user/:userId
 * @desc Get user's attempts
 */
router.get('/user/:userId', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        // Check permissions
        if (req.user.id !== userId && req.user.role !== 'admin' && req.user.role !== 'manager') {
            throw (0, error_middleware_1.BadRequestError)('Insufficient permissions');
        }
        const attempts = await database_service_1.DatabaseService.query(`SELECT a.*, q.title as quiz_title, l.title as lesson_title, c.title as course_title
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       JOIN lessons l ON q.lesson_id = l.id
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       WHERE a.user_id = @userId AND a.tenant_id = @tenantId
       ORDER BY a.started_at DESC`, { userId, tenantId: req.user.tenantId });
        res.json({ success: true, data: attempts });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=attempt.routes.js.map