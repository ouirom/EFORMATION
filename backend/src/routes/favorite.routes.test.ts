import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import favoriteRoutes from './favorite.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/favorites', favoriteRoutes);
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

describe('POST /favorites', () => {
  it('adds a valid course favorite', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id FROM courses')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('SELECT id FROM favorites')) return Promise.resolve([]); // not already favorited
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/favorites')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ type: 'course', id: 5 });

    expect(response.status).toBe(201);
    const insertCall = mockedExecute.mock.calls.find(([q]: [string]) => q.startsWith('INSERT INTO favorites'));
    expect(insertCall[1]).toMatchObject({ type: 'course', id: 5, userId: 3, tenantId: 10 });
  });

  it('rejects an invalid type', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/favorites')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ type: 'quiz', id: 5 });

    expect(response.status).toBe(400);
  });

  it('404s when the target course/lesson does not exist for this tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id FROM lessons')) return Promise.resolve([]); // not found
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/favorites')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ type: 'lesson', id: 999 });

    expect(response.status).toBe(404);
  });

  it('is idempotent -- favoriting an already-favorited item does not insert a duplicate', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id FROM courses')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('SELECT id FROM favorites')) return Promise.resolve([{ id: 1 }]); // already favorited
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/favorites')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ type: 'course', id: 5 });

    expect(response.status).toBe(201);
    const insertCall = mockedExecute.mock.calls.find(([q]: [string]) => q.startsWith('INSERT INTO favorites'));
    expect(insertCall).toBeUndefined();
  });
});

describe('DELETE /favorites/:type/:id', () => {
  it('removes a favorite', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/favorites/course/5')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    const deleteCall = mockedExecute.mock.calls.find(([q]: [string]) => q.startsWith('DELETE FROM favorites'));
    expect(deleteCall[1]).toMatchObject({ type: 'course', id: 5, userId: 3, tenantId: 10 });
  });

  it('is idempotent -- removing a non-existent favorite is not an error', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/favorites/lesson/999')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
  });
});

describe('GET /favorites', () => {
  it('returns courses and lessons merged, each with the correct type', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      // Checked before the course-favorites branch below -- the lesson-favorites
      // query also joins courses (for course_title), so it would otherwise match
      // 'JOIN courses c' too.
      if (query.includes('JOIN modules m')) {
        return Promise.resolve([{ id: 2, item_id: 25, created_at: '2026-01-02T00:00:00Z', title: 'Leçon Y', course_id: 19, course_title: 'Cours Y' }]);
      }
      if (query.includes('JOIN courses c')) {
        return Promise.resolve([{ id: 1, item_id: 5, created_at: '2026-01-01T00:00:00Z', title: 'Cours X' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/favorites')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    // Most recently favorited first.
    expect(response.body.data[0]).toMatchObject({ type: 'lesson', itemId: 25, title: 'Leçon Y', courseId: 19, courseTitle: 'Cours Y' });
    expect(response.body.data[1]).toMatchObject({ type: 'course', itemId: 5, title: 'Cours X' });
  });
});
