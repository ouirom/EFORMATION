import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import aiRoutes from './ai.routes';
import { DatabaseService } from '../services/database.service';
import { AIService } from '../services/ai.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/ai.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedGetRecommendations = AIService.getRecommendations as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiRoutes);
  app.use(errorHandler);
  return app;
}

function mockAuthLookup() {
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
  };
}

const token = jwt.sign({ id: 1, tenantId: 10, email: 'agent@test.com', role: 'agent' }, config.jwt.secret);

describe('GET /ai/recommendations/courses', () => {
  it('logs recommendations using parameterized placeholders, not interpolated values', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM enrollments e')) return Promise.resolve([]);
      if (query.includes('FROM user_profiles')) return Promise.resolve([{ interests: null, learning_goals: null }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedGetRecommendations.mockResolvedValue([
      { courseId: 5, score: 0.9, reason: "Great fit; contains a ' quote" },
    ]);

    const response = await request(makeApp())
      .get('/ai/recommendations/courses')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledTimes(1);
    const [insertQuery, insertParams] = mockedExecute.mock.calls[0];
    expect(insertQuery).not.toContain("quote");
    expect(insertQuery).toContain('@reason0');
    expect(insertParams.reason0).toBe("Great fit; contains a ' quote");
  });

  it('skips the logging insert when there are no recommendations', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM enrollments e')) return Promise.resolve([]);
      if (query.includes('FROM user_profiles')) return Promise.resolve([{}]);
      return Promise.resolve([]);
    });
    mockedGetRecommendations.mockResolvedValue([]);

    const response = await request(makeApp())
      .get('/ai/recommendations/courses')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).not.toHaveBeenCalled();
  });
});
