import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import quizRoutes from './quiz.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/quizzes', quizRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 2,
    tenant_id: 10,
    email: 'director@test.com',
    display_name: 'Director Demo',
    avatar_url: null,
    role: 'director',
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
    ...overrides,
  };
}

const directorToken = tokenFor({ id: 2, tenantId: 10, email: 'director@test.com', role: 'director' });
const agentToken = tokenFor({ id: 5, tenantId: 10, email: 'agent@test.com', role: 'agent' });

describe('GET /quizzes/:id', () => {
  it('groups choices correctly under their own question (no N+1 mismatch)', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 5, role: 'agent' })]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 50, tenant_id: 10, lesson_id: 7, title: 'Module 1 Quiz', passing_score: 70 }]);
      }
      if (query === 'SELECT * FROM questions WHERE quiz_id = @quizId ORDER BY position') {
        return Promise.resolve([
          { id: 1, quiz_id: 50, type: 'mcq', prompt: 'Q1', position: 1, points: 1 },
          { id: 2, quiz_id: 50, type: 'mcq', prompt: 'Q2', position: 2, points: 1 },
        ]);
      }
      if (query.includes('FROM choices WHERE question_id IN') && query.includes('is_correct')) {
        return Promise.resolve([
          { id: 11, question_id: 1, label: 'A', is_correct: true, position: 1 },
          { id: 12, question_id: 1, label: 'B', is_correct: false, position: 2 },
          { id: 21, question_id: 2, label: 'C', is_correct: false, position: 1 },
          { id: 22, question_id: 2, label: 'D', is_correct: true, position: 2 },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/quizzes/50').set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.questions).toHaveLength(2);

    const [q1, q2] = response.body.data.questions;
    expect(q1.id).toBe(1);
    expect(q1.choices.map((c: any) => c.id)).toEqual([11, 12]);
    expect(q1.choices[0]).toMatchObject({ id: 11, label: 'A', isCorrect: true });
    expect(q1.choices[1]).toMatchObject({ id: 12, label: 'B', isCorrect: false });

    expect(q2.id).toBe(2);
    expect(q2.choices.map((c: any) => c.id)).toEqual([21, 22]);
    expect(q2.choices[0]).toMatchObject({ id: 21, label: 'C', isCorrect: false });
    expect(q2.choices[1]).toMatchObject({ id: 22, label: 'D', isCorrect: true });
  });

  it('returns 404 for a quiz outside the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT * FROM quizzes WHERE id = @quizId AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/quizzes/999').set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).toBe(404);
  });
});

describe('GET /quizzes/:id/take', () => {
  it('never exposes is_correct/isCorrect on the choices returned for taking the quiz', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 5, role: 'agent' })]);
      if (query.includes('SELECT id, title, passing_score, randomized, shuffle_choices FROM quizzes')) {
        return Promise.resolve([{ id: 50, title: 'Module 1 Quiz', passing_score: 70, randomized: false, shuffle_choices: false }]);
      }
      if (query.includes('SELECT id, type, prompt, position, points FROM questions')) {
        return Promise.resolve([
          { id: 1, type: 'mcq', prompt: 'Q1', position: 1, points: 1 },
          { id: 2, type: 'mcq', prompt: 'Q2', position: 2, points: 1 },
        ]);
      }
      if (query.includes('FROM choices WHERE question_id IN')) {
        // Note: no is_correct column selected on this path.
        return Promise.resolve([
          { id: 11, question_id: 1, label: 'A', position: 1 },
          { id: 12, question_id: 1, label: 'B', position: 2 },
          { id: 21, question_id: 2, label: 'C', position: 1 },
          { id: 22, question_id: 2, label: 'D', position: 2 },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/quizzes/50/take').set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.questions).toHaveLength(2);
    for (const question of response.body.data.questions) {
      for (const choice of question.choices) {
        expect(choice).not.toHaveProperty('isCorrect');
        expect(choice).not.toHaveProperty('is_correct');
      }
    }
  });
});

describe('POST /quizzes', () => {
  it('creates a quiz as a director', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('INSERT INTO quizzes')) return Promise.resolve([{ id: 80 }]);
      if (query === 'SELECT * FROM quizzes WHERE id = @id') {
        return Promise.resolve([{ id: 80, tenant_id: 10, lesson_id: 7, title: 'New Quiz', passing_score: 70 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/quizzes')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ lessonId: 7, title: 'New Quiz' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 80, title: 'New Quiz' });
  });

  it('rejects an agent (learner) from creating a quiz', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 5, role: 'agent' })]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/quizzes')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ lessonId: 7, title: 'New Quiz' });

    expect(response.status).toBe(403);
  });
});
