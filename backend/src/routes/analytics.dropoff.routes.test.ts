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
    id: 2,
    tenant_id: 10,
    email: 'manager@test.com',
    display_name: 'Manager',
    avatar_url: null,
    role: 'manager',
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('GET /analytics/courses/:id/lesson-dropoff', () => {
  it('computes reach rate and drop-off for each lesson in order', async () => {
    const managerToken = tokenFor({ id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup()]);
      }
      if (query.includes('FROM enrollments WHERE course_id')) {
        return Promise.resolve([{ total: 10 }]);
      }
      if (query.includes('FROM lessons l')) {
        return Promise.resolve([
          { lesson_id: 1, title: 'Intro', module_title: 'Module 1', completed_count: 10 },
          { lesson_id: 2, title: 'Suite', module_title: 'Module 1', completed_count: 6 },
          { lesson_id: 3, title: 'Fin', module_title: 'Module 2', completed_count: 2 },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/courses/5/lesson-dropoff')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.enrolledTotal).toBe(10);
    expect(response.body.data.funnel).toEqual([
      { lessonId: 1, lessonTitle: 'Intro', moduleTitle: 'Module 1', position: 1, completedCount: 10, reachRatePercent: 100, dropFromPrevious: 0 },
      { lessonId: 2, lessonTitle: 'Suite', moduleTitle: 'Module 1', position: 2, completedCount: 6, reachRatePercent: 60, dropFromPrevious: 4 },
      { lessonId: 3, lessonTitle: 'Fin', moduleTitle: 'Module 2', position: 3, completedCount: 2, reachRatePercent: 20, dropFromPrevious: 4 },
    ]);
  });

  it('returns an empty funnel with 0 enrolled when the course has no data', async () => {
    const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 1, email: 'admin@test.com', role: 'admin' })]);
      }
      if (query.includes('FROM enrollments WHERE course_id')) return Promise.resolve([{ total: 0 }]);
      if (query.includes('FROM lessons l')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/courses/999/lesson-dropoff')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ courseId: 999, enrolledTotal: 0, funnel: [] });
  });

  it('returns 403 for an agent (insufficient role)', async () => {
    const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });

    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 3, email: 'agent@test.com', role: 'agent' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/analytics/courses/5/lesson-dropoff')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });

  it('returns 401 without a token', async () => {
    const response = await request(makeApp()).get('/analytics/courses/5/lesson-dropoff');
    expect(response.status).toBe(401);
  });
});
