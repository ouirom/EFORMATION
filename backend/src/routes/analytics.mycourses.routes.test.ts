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

const agentToken = jwt.sign({ id: 5, tenantId: 10, email: 'agent@test.com', role: 'agent' }, config.jwt.secret);

function mockAuthLookup() {
  return {
    id: 5, tenant_id: 10, email: 'agent@test.com', display_name: 'Agent', avatar_url: null,
    role: 'agent', enterprise_id: null, direction_id: 3, service_id: null, is_active: true,
  };
}

describe('GET /analytics/my-courses', () => {
  it('merges assigned and enrolled courses with progress, lesson counts and due date', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM course_assignments ca')) {
        return Promise.resolve([
          {
            id: '18', public_id: 'abc', title: 'Gestion de projet', category: null, duration: null, level: null,
            progress_percent: '50.00', completed_at: null, enrolled_at: '2026-08-01', is_mandatory: 1,
            due_date: '2026-10-01', is_assigned: 1, total_lessons: '4', completed_lessons: '2',
          },
          {
            id: '21', public_id: 'def', title: 'Self-enrolled', category: 'Tech', duration: null, level: null,
            progress_percent: 100, completed_at: null, enrolled_at: '2026-08-02', is_mandatory: null,
            due_date: null, is_assigned: 0, total_lessons: 3, completed_lessons: 3,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/analytics/my-courses').set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: 18, isAssigned: true, isMandatory: true, dueDate: '2026-10-01', isEnrolled: true,
      progress: 50, isCompleted: false, totalLessons: 4, completedLessons: 2,
    });
    expect(response.body.data[1]).toMatchObject({ id: 21, isAssigned: false, isMandatory: false, isCompleted: true });

    const [query, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('FROM course_assignments ca'));
    expect(query).toContain('c.deleted_at IS NULL');
    expect(params).toMatchObject({ userId: 5, tenantId: 10, directionId: 3, enterpriseId: 0 });
  });
});
