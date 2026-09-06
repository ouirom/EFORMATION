import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import analyticsRoutes from './analytics.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/analytics', analyticsRoutes);
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

// Regression coverage: the activity-days query used to reference
// quiz_attempts.created_at, a column that doesn't exist (quiz_attempts only has
// started_at/completed_at) -- every call to this route 500'd until it was
// fixed to use started_at.
describe('GET /analytics/my-stats', () => {
  it('computes a real streak instead of erroring on quiz_attempts activity dates', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM enrollments') && query.includes('total_enrolled')) {
        return Promise.resolve([{ total_enrolled: 2, completed: 1, avg_progress: 50 }]);
      }
      if (query.includes('FROM lesson_progress') && query.includes('total_started')) {
        return Promise.resolve([{ total_started: 5, completed: 3, total_time_seconds: 7200 }]);
      }
      if (query.includes('FROM quiz_attempts') && query.includes('total_attempts')) {
        return Promise.resolve([{ total_attempts: 4, passed: 3, avg_score: 80 }]);
      }
      if (query.includes('FROM user_badges') && query.includes('total_badges')) {
        return Promise.resolve([{ total_badges: 2 }]);
      }
      if (query.includes('last_accessed_at as activity_at') || query.includes('started_at as activity_at')) {
        return Promise.resolve([{ activity_at: new Date().toISOString() }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/my-stats')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      coursesCompleted: 1,
      badges: 2,
      streak: 1,
      longestStreak: 1,
    });
  });
});
