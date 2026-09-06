import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import badgeRoutes from './badge.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/badges', badgeRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 3, tenant_id: 10, email: 'agent@test.com', display_name: 'Agent',
    avatar_url: null, role: 'agent', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });

// Regression coverage for a routing-order bug: GET /:id was registered before
// GET /my-badges and GET /stats/leaderboard, so Express matched those literal
// paths as if "my-badges"/"stats" were the :id param -- every call 500'd trying
// to use the string as a numeric badge id. GET /:id was moved after them.
describe('badge.routes.ts literal-path routes are not shadowed by GET /:id', () => {
  it('GET /my-badges returns the current user\'s badges, not a :id lookup', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM user_badges ub') && query.includes('JOIN badges b')) {
        return Promise.resolve([{ id: 1, badge_type: 'trophy', name: 'Champion' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/badges/my-badges')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.badges).toEqual([{ id: 1, badge_type: 'trophy', name: 'Champion' }]);
    expect(response.body.data.stats).toMatchObject({ total: 1, trophies: 1 });
  });

  it('GET /stats/leaderboard is not shadowed either', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/badges/stats/leaderboard')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
  });

  it('GET /:id still resolves a real numeric badge id', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT b.*, f.storage_key as icon_url\n       FROM badges b')) {
        return Promise.resolve([{ id: 42, name: 'Perfectionist' }]);
      }
      if (query.includes('FROM user_badges ub') && query.includes('JOIN users u')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/badges/42')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 42, name: 'Perfectionist' });
  });
});

// Regression coverage: POST /award-quiz used to trust score/passed straight
// from the request body, so any authenticated user could POST
// {quizId, score: 100, passed: true} directly and self-award a "Perfect
// Score"/"Gold Trophy" badge without ever taking the quiz. It now looks up
// the caller's own graded quiz_attempts row and ignores any score/passed the
// client sends.
describe('POST /badges/award-quiz trusts the stored attempt, not the request body', () => {
  const mockedExecute = DatabaseService.execute as jest.Mock;

  it('awards badges based on the real stored score, ignoring a forged score in the body', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT score, passed FROM quiz_attempts')) {
        return Promise.resolve([{ score: 40, passed: false }]); // the real, graded result
      }
      if (query.includes("code = 'QUIZ_COMPLETED'")) return Promise.resolve([{ id: 1 }]);
      if (query.includes("code = 'PERFECT_SCORE'")) return Promise.resolve([{ id: 2 }]);
      if (query.includes('FROM user_badges WHERE user_id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/badges/award-quiz')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 7, attemptId: 99, score: 100, passed: true }); // forged fields

    expect(response.status).toBe(200);
    // Failed for real (40%) -- no QUIZ_COMPLETED/PERFECT_SCORE badge should be awarded,
    // regardless of the forged score:100/passed:true in the request body.
    expect(response.body.data.awardedBadges).toEqual([]);
  });

  it('rejects award-quiz when no matching graded attempt exists for this user/quiz', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT score, passed FROM quiz_attempts')) return Promise.resolve([]); // no such attempt
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/badges/award-quiz')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ quizId: 7, attemptId: 999, score: 100, passed: true });

    expect(response.status).toBe(403);
  });
});
