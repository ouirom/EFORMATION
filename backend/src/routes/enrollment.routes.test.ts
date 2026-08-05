import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import enrollmentRoutes from './enrollment.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/enrollments', enrollmentRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
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

describe('POST /enrollments', () => {
  const token = tokenFor({ id: 1, tenantId: 10, email: 'agent@test.com', role: 'agent' });

  it('creates a new enrollment for a published course', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('SELECT id, course_id, progress_percent') && query.includes('WHERE course_id')) {
        return Promise.resolve([]); // no existing enrollment
      }
      if (query.includes('INSERT INTO enrollments')) return Promise.resolve([{ id: 42 }]);
      if (query.includes('WHERE id = @id') && query.includes('FROM enrollments')) {
        return Promise.resolve([{ id: 42, course_id: 5, progress_percent: 0, enrolled_at: new Date().toISOString(), started_at: null, completed_at: null }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ courseId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 42, course_id: 5 });
  });

  it('is idempotent: returns the existing enrollment instead of creating a duplicate', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('SELECT id, course_id, progress_percent')) {
        return Promise.resolve([{ id: 7, course_id: 5, progress_percent: 40, enrolled_at: new Date().toISOString(), started_at: null, completed_at: null }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ courseId: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 7, progress_percent: 40 });
  });

  it('returns 404 for an unpublished or non-existent course', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({ courseId: 999 });

    expect(response.status).toBe(404);
  });

  it('returns 400 when courseId is missing', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/enrollments')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
  });
});
