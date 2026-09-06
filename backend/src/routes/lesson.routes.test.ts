import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import lessonRoutes from './lesson.routes';
import { DatabaseService } from '../services/database.service';
import { CourseService } from '../services/course.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/course.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedCanAccessCourse = CourseService.canAccessCourse as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/lessons', lessonRoutes);
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

const LESSON_ROW = {
  id: 17, public_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', module_id: 4,
  course_id: 8, title: 'Leçon test', type: 'video',
};

describe('GET /lessons/:id', () => {
  beforeEach(() => {
    mockedCanAccessCourse.mockResolvedValue(true);
  });

  it('resolves a numeric id', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('JOIN modules m ON l.module_id = m.id')) return Promise.resolve([LESSON_ROW]);
      if (query.startsWith('SELECT c.*')) return Promise.resolve([]);
      if (query.startsWith('SELECT * FROM quizzes')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/lessons/17')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 17, public_id: LESSON_ROW.public_id });
    // resolveEntityId shouldn't hit the DB for a plain numeric id.
    expect(mockedQuery).not.toHaveBeenCalledWith(expect.stringContaining('WHERE public_id'), expect.anything());
  });

  it('resolves the same lesson via its public UUID', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM lessons WHERE public_id')) return Promise.resolve([{ id: 17 }]);
      if (query.includes('JOIN modules m ON l.module_id = m.id')) return Promise.resolve([LESSON_ROW]);
      if (query.startsWith('SELECT c.*')) return Promise.resolve([]);
      if (query.startsWith('SELECT * FROM quizzes')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get(`/lessons/${LESSON_ROW.public_id}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 17, public_id: LESSON_ROW.public_id });
  });

  it('404s for an unknown UUID', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM lessons WHERE public_id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/lessons/3fa85f64-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(404);
  });
});
