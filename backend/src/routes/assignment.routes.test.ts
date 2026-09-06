import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import assignmentRoutes from './assignment.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/assignments', assignmentRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 2, tenant_id: 10, email: 'director@test.com', display_name: 'Director',
    avatar_url: null, role: 'director', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const directorToken = tokenFor({ id: 2, tenantId: 10, email: 'director@test.com', role: 'director' });

describe('POST /assignments -- lesson scoping', () => {
  it('creates a lesson-scoped assignment: validates the lesson belongs to the course, notifies with the lesson subject/link', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5, title: 'Cours X' }]);
      if (query.includes('JOIN modules m ON l.module_id = m.id')) return Promise.resolve([{ title: 'Leçon Y' }]);
      if (query.includes('FROM users WHERE tenant_id = @tenantId AND id IN')) return Promise.resolve([{ id: 42 }]);
      if (query.startsWith('SELECT id FROM course_assignments')) return Promise.resolve([]); // no existing duplicate
      if (query.includes('INSERT INTO course_assignments')) return Promise.resolve([{ id: 99 }]);
      if (query.includes('FROM course_assignments ca') && query.includes('JOIN users u')) return Promise.resolve([{ id: 42 }]);
      if (query.includes('SELECT email FROM users WHERE id = @userId')) return Promise.resolve([{ email: 'learner@test.com' }]);
      if (query.includes('INSERT INTO pending_notifications')) return Promise.resolve([{ id: 7 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/assignments')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ courseId: 5, lessonId: 12, assignmentType: 'user', targetIds: [42] });

    expect(response.status).toBe(201);

    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO course_assignments'));
    expect(insertCall[1]).toMatchObject({ courseId: 5, lessonId: 12, targetId: 42 });

    const notificationCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO pending_notifications'));
    expect(notificationCall[1].subject).toContain('Leçon Y');
    expect(notificationCall[1].actionUrl).toContain('/courses/5/lessons/12');
  });

  it('rejects a lessonId that does not belong to the given course', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5, title: 'Cours X' }]);
      if (query.includes('JOIN modules m ON l.module_id = m.id')) return Promise.resolve([]); // lesson not in this course
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/assignments')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ courseId: 5, lessonId: 999, assignmentType: 'user', targetIds: [42] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_LESSON');
  });

  it('scopes the duplicate-assignment check with a NULL-safe lesson_id comparison', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5, title: 'Cours X' }]);
      if (query.includes('JOIN modules m ON l.module_id = m.id')) return Promise.resolve([{ title: 'Leçon Y' }]);
      if (query.includes('FROM users WHERE tenant_id = @tenantId AND id IN')) return Promise.resolve([{ id: 42 }]);
      if (query.startsWith('SELECT id FROM course_assignments')) return Promise.resolve([{ id: 1 }]); // already assigned
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/assignments')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ courseId: 5, lessonId: 12, assignmentType: 'user', targetIds: [42] });

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(0); // treated as a duplicate, nothing created

    const dupCall = mockedQuery.mock.calls.find(([q]: [string]) => q.startsWith('SELECT id FROM course_assignments'));
    expect(dupCall[0]).toContain('lesson_id = @lessonId OR (lesson_id IS NULL AND @lessonId IS NULL)');
    expect(dupCall[1].lessonId).toBe(12);
  });
});

describe('POST /assignments -- team assignment_type', () => {
  it('validates the team belongs to the tenant and creates the assignment', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5, title: 'Cours X' }]);
      if (query.startsWith('SELECT id FROM teams WHERE tenant_id')) return Promise.resolve([{ id: 7 }]);
      if (query.startsWith('SELECT id FROM course_assignments')) return Promise.resolve([]);
      if (query.includes('INSERT INTO course_assignments')) return Promise.resolve([{ id: 100 }]);
      if (query.includes('FROM course_assignments ca') && query.includes('JOIN users u')) return Promise.resolve([{ id: 42 }]);
      if (query.includes('SELECT email FROM users WHERE id = @userId')) return Promise.resolve([{ email: 'learner@test.com' }]);
      if (query.includes('INSERT INTO pending_notifications')) return Promise.resolve([{ id: 8 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/assignments')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ courseId: 5, assignmentType: 'team', targetIds: [7] });

    expect(response.status).toBe(201);
    const validationCall = mockedQuery.mock.calls.find(([q]: [string]) => q.startsWith('SELECT id FROM teams'));
    expect(validationCall).toBeDefined();
    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO course_assignments'));
    expect(insertCall[1]).toMatchObject({ assignmentType: 'team', targetId: 7 });
  });

  it('rejects a team that does not belong to this tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM courses WHERE id = @courseId')) return Promise.resolve([{ id: 5, title: 'Cours X' }]);
      if (query.startsWith('SELECT id FROM teams WHERE tenant_id')) return Promise.resolve([]); // no match
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/assignments')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ courseId: 5, assignmentType: 'team', targetIds: [999] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TARGET');
  });
});

describe('GET /assignments/my-courses -- team assignment_type', () => {
  it('includes a course assigned to a team the current user belongs to', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup({ id: 42, role: 'agent' })]);
      if (query.includes('FROM courses c') && query.includes('INNER JOIN course_assignments')) {
        expect(query).toContain("ca.assignment_type = 'team'");
        expect(query).toContain('tm.team_id = ca.target_id');
        return Promise.resolve([{ id: 5, public_id: 'uuid-5', title: 'Cours X', is_mandatory: true }]);
      }
      return Promise.resolve([]);
    });

    const agentToken = tokenFor({ id: 42, tenantId: 10, email: 'agent@test.com', role: 'agent' });
    const response = await request(makeApp())
      .get('/assignments/my-courses')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
});

describe('GET /assignments -- lesson scoping', () => {
  it('returns lessonId/lessonTitle for a lesson-scoped assignment', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM course_assignments ca')) {
        return Promise.resolve([
          {
            id: 1, tenant_id: 10, course_id: 5, lesson_id: 12, course_title: 'Cours X', lesson_title: 'Leçon Y',
            assignment_type: 'user', target_id: 42, target_name: 'Jane Doe', target_role: null,
            is_mandatory: false, due_date: null, assigned_by: 2, assigned_by_name: 'Director',
            created_at: '2026-01-01',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/assignments')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ lessonId: 12, lessonTitle: 'Leçon Y' });
  });
});
