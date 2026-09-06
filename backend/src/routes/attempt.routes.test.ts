import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import attemptRoutes from './attempt.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/pending-notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/attempts', attemptRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 5,
    tenant_id: 10,
    email: 'agent@test.com',
    display_name: 'Agent',
    avatar_url: null,
    role: 'agent',
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
    ...overrides,
  };
}

const agentToken = tokenFor({ id: 5, tenantId: 10, email: 'agent@test.com', role: 'agent' });

describe('POST /attempts/begin', () => {
  it('starts a new attempt when no duration gate or attempt cap blocks it', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, lesson_id: 7, max_attempts: null, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT duration_min FROM lessons')) return Promise.resolve([{ duration_min: 0 }]);
      if (query.includes('SELECT id FROM questions WHERE quiz_id = @quizId ORDER BY position')) {
        return Promise.resolve([{ id: 1 }, { id: 2 }]);
      }
      if (query.includes('INSERT INTO quiz_attempts')) return Promise.resolve([{ id: 900 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts/begin')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50 });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ attemptId: 900 });
  });

  it('blocks starting the attempt when the required lesson duration has not been reached', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, lesson_id: 7, max_attempts: null, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT duration_min FROM lessons')) return Promise.resolve([{ duration_min: 10 }]);
      if (query.includes('SELECT time_spent_seconds FROM lesson_progress')) return Promise.resolve([{ time_spent_seconds: 60 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts/begin')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('LESSON_DURATION_NOT_REACHED');
  });

  it('blocks starting the attempt once max_attempts has been reached', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, lesson_id: 7, max_attempts: 2, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT COUNT(*) as total FROM quiz_attempts')) return Promise.resolve([{ total: 2 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts/begin')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MAX_ATTEMPTS_REACHED');
  });

  it('returns 404 for a quiz that does not exist in the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts/begin')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 999 });

    expect(response.status).toBe(404);
  });
});

describe('POST /attempts (submit)', () => {
  it('scores a submitted attempt and reports pass/fail against the passing score', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, title: 'Module 1 Quiz', passing_score: 70, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT id, started_at, completed_at FROM quiz_attempts')) {
        return Promise.resolve([{ id: 900, started_at: new Date().toISOString(), completed_at: null }]);
      }
      if (query.includes('correct_choice_id')) {
        return Promise.resolve([
          { id: 1, type: 'mcq', correct_choice_id: 11 },
          { id: 2, type: 'mcq', correct_choice_id: 21 },
        ]);
      }
      if (query.includes('FROM quiz_answers qa')) {
        return Promise.resolve([
          { question_id: 1, correct: true, selected_choice: 11, correct_answer: 'A' },
          { question_id: 2, correct: false, selected_choice: 99, correct_answer: 'C' },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        quizId: 50,
        attemptId: 900,
        answers: [
          { questionId: 1, answer: '11' },
          { questionId: 2, answer: '99' },
        ],
        timeSpent: 120,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: 900,
      score: 50,
      passed: false,
      passingScore: 70,
      totalQuestions: 2,
      correctAnswers: 1,
    });
    expect(response.body.data.feedback).toHaveLength(2);
  });

  it('returns 404 when the given attemptId does not belong to the caller', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, title: 'Module 1 Quiz', passing_score: 70, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT id, started_at, completed_at FROM quiz_attempts')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50, attemptId: 12345, answers: [] });

    expect(response.status).toBe(404);
  });

  it('rejects re-submitting an attempt that has already been completed', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, title: 'Module 1 Quiz', passing_score: 70, time_limit_minutes: null }]);
      }
      if (query.includes('SELECT id, started_at, completed_at FROM quiz_attempts')) {
        return Promise.resolve([{ id: 900, started_at: new Date().toISOString(), completed_at: new Date().toISOString() }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50, attemptId: 900, answers: [] });

    expect(response.status).toBe(400);
  });

  it('rejects a submission past the quiz time limit', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, title: 'Module 1 Quiz', passing_score: 70, time_limit_minutes: 10 }]);
      }
      if (query.includes('SELECT id, started_at, completed_at FROM quiz_attempts')) {
        // Started 30 minutes ago, well past the 10-minute limit (+1 minute grace).
        return Promise.resolve([{ id: 900, started_at: new Date(Date.now() - 30 * 60000).toISOString(), completed_at: null }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/attempts')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 50, attemptId: 900, answers: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TIME_LIMIT_EXCEEDED');
  });
});
