import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import searchRoutes from './search.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/search', searchRoutes);
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

describe('GET /search', () => {
  it('returns course results with a public_id URL and real instructor/duration/level metadata', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM categories c')) return Promise.resolve([]);
      if (query.includes('FROM courses c')) {
        return Promise.resolve([{
          id: 8, public_id: 'f5ceca9d-9b99-41a0-8e81-7fc24298fa69', title: 'Sécurité', description: 'Cours de sécu',
          category: 'technology', level: 'advanced', duration: 8, instructor_name: 'Director Demo',
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/search?q=securite&types=course')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      type: 'course',
      url: '/courses/f5ceca9d-9b99-41a0-8e81-7fc24298fa69',
      metadata: { category: 'technology', instructor: 'Director Demo', duration: 8, level: 'advanced' },
    });
  });

  it('finds courses by category label, including a renamed built-in category', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM categories c')) {
        return Promise.resolve([
          { id: 1, code: 'hr', name: 'Personnel', course_count: 1 },
          { id: 2, code: 'technology', name: null, course_count: 5 },
        ]);
      }
      return Promise.resolve([]);
    });

    await request(makeApp()).get('/search?q=personnel&types=course').set('Authorization', `Bearer ${agentToken}`);

    const [query, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('FROM courses c') && q.includes('LIKE @like'));
    expect(query).toContain('c.category IN (@cat0)');
    expect(query).not.toContain('c.category LIKE');
    expect(params.cat0).toBe('hr');
  });

  it('returns lesson results with a public_id-based course/lesson URL', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM lessons l')) {
        return Promise.resolve([{
          id: 33, public_id: '7c65e53b-8a51-463d-bac5-2b80c14ce330', title: 'P1',
          course_public_id: 'f5ceca9d-9b99-41a0-8e81-7fc24298fa69', course_title: 'Sécurité',
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/search?q=p1&types=lesson')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].url).toBe(
      '/courses/f5ceca9d-9b99-41a0-8e81-7fc24298fa69/lessons/7c65e53b-8a51-463d-bac5-2b80c14ce330'
    );
  });

  it('returns blog results with real author/date metadata', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM blog_posts bp')) {
        return Promise.resolve([{
          id: 5, title: 'Nouveautés', published_at: '2026-08-01T00:00:00Z', created_at: '2026-07-30T00:00:00Z',
          author_name: 'Admin Demo',
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/search?q=nouveau&types=blog')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].metadata).toMatchObject({ author: 'Admin Demo', date: '2026-08-01T00:00:00Z' });
  });
});
