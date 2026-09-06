import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import courseRoutes from './course.routes';
import { DatabaseService } from '../services/database.service';
import { CourseService } from '../services/course.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/course.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedCanAccessCourse = CourseService.canAccessCourse as jest.Mock;
const mockedGetFullStructure = CourseService.getFullStructure as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/courses', courseRoutes);
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

const COURSE_PUBLIC_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const FULL_COURSE = { id: 8, publicId: COURSE_PUBLIC_ID, title: 'Cours test', modules: [] };

describe('GET /courses/:id/full', () => {
  beforeEach(() => {
    mockedCanAccessCourse.mockResolvedValue(true);
    mockedGetFullStructure.mockResolvedValue(FULL_COURSE);
  });

  it('resolves a numeric id', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/courses/8/full')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 8, publicId: COURSE_PUBLIC_ID });
    expect(mockedGetFullStructure).toHaveBeenCalledWith(10, 8);
  });

  it('resolves the same course via its public UUID', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE public_id')) return Promise.resolve([{ id: 8 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get(`/courses/${COURSE_PUBLIC_ID}/full`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 8, publicId: COURSE_PUBLIC_ID });
    expect(mockedGetFullStructure).toHaveBeenCalledWith(10, 8);
  });

  it('404s for an unknown UUID', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE public_id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/courses/3fa85f64-0000-0000-0000-000000000000/full')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(404);
  });
});
