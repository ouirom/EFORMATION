import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import importRoutes from './import.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/import', importRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

const adminUser = { id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' };
const adminToken = tokenFor(adminUser);
const managerUser = { id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager' };
const managerToken = tokenFor(managerUser);

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

async function makeXlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('GET /import/*/template', () => {
  it('returns a downloadable xlsx for an admin', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/import/organization/template')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
  });

  it('returns 403 for organization template when requester is a manager', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'manager@test.com', role: 'manager' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/import/organization/template')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(403);
  });
});

describe('POST /import/organization', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('creates the full enterprise/direction/service chain from a new row', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id FROM enterprises')) return Promise.resolve([]);
      if (query.startsWith('SELECT id FROM directions')) return Promise.resolve([]);
      if (query.startsWith('SELECT id FROM services')) return Promise.resolve([]);
      if (query.startsWith('INSERT INTO enterprises')) return Promise.resolve([{ id: 101 }]);
      if (query.startsWith('INSERT INTO directions')) return Promise.resolve([{ id: 201 }]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['enterpriseName', 'enterpriseCode', 'directionName', 'directionCode', 'serviceName', 'serviceCode'],
      [['Acme', 'ACME', 'Tech', 'TECH', 'Engineering', 'ENG']]
    );

    const response = await request(makeApp())
      .post('/import/organization')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'org.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.results[0].status).toBe('created');
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO services'),
      expect.objectContaining({ name: 'Engineering', code: 'ENG' })
    );
  });

  it('skips a service that already exists and errors a row missing enterpriseName', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT id FROM enterprises')) return Promise.resolve([{ id: 101 }]);
      if (query.startsWith('SELECT id FROM directions')) return Promise.resolve([{ id: 201 }]);
      if (query.startsWith('SELECT id FROM services')) return Promise.resolve([{ id: 301 }]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['enterpriseName', 'enterpriseCode', 'directionName', 'directionCode', 'serviceName', 'serviceCode'],
      [
        ['Acme', 'ACME', 'Tech', 'TECH', 'Engineering', 'ENG'],
        ['', '', 'Tech', 'TECH', 'Support', 'SUP'],
      ]
    );

    const response = await request(makeApp())
      .post('/import/organization')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'org.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(0);
    expect(response.body.data.results[0].status).toBe('skipped');
    expect(response.body.data.results[1].status).toBe('error');
  });
});

describe('POST /import/courses', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('creates a new course and skips one with a duplicate title', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT title FROM courses')) return Promise.resolve([{ title: 'Existing Course' }]);
      if (query.includes('FROM categories')) return Promise.resolve([{ code: 'other' }]);
      if (query.startsWith('INSERT INTO courses')) return Promise.resolve([{ id: 55 }]);
      if (query.includes('FROM courses c') && query.includes('WHERE c.id = @courseId')) {
        return Promise.resolve([{
          id: 55, tenant_id: 10, title: 'New Course', description: null, category: null, level: 'beginner',
          duration: null, audience_scope: null, prerequisites: null, is_published: 0, created_by: 1,
          created_at: new Date(), updated_at: new Date(), creator_name: null, module_count: 0, avg_rating: null, review_count: 0,
        }]);
      }
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['title', 'description', 'category', 'level', 'durationMin', 'isPublished'],
      [
        ['New Course', 'desc', 'General', 'beginner', 30, 'non'],
        ['Existing Course', 'desc', 'General', 'beginner', 30, 'non'],
      ]
    );

    const response = await request(makeApp())
      .post('/import/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'courses.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.results[0].status).toBe('created');
    expect(response.body.data.results[1].status).toBe('skipped');
  });
  it('reports a row whose category does not exist instead of creating the course', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT title FROM courses')) return Promise.resolve([]);
      if (query.includes('FROM categories')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['title', 'description', 'category', 'level', 'durationMin', 'isPublished'],
      [['New Course', 'desc', 'Astrologie', 'beginner', 30, 'non']]
    );

    const response = await request(makeApp())
      .post('/import/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'courses.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(0);
    expect(response.body.data.results[0]).toMatchObject({ status: 'error', message: 'Catégorie inconnue "Astrologie"' });
    expect(mockedQuery.mock.calls.some(([q]: [string]) => q.startsWith('INSERT INTO courses'))).toBe(false);
  });

});

describe('POST /import/lessons', () => {
  it('errors a row whose course cannot be found', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM courses WHERE tenant_id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['courseTitle', 'moduleTitle', 'lessonTitle', 'durationMin'],
      [['Unknown Course', 'Module 1', 'Lesson 1', 10]]
    );

    const response = await request(makeApp())
      .post('/import/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'lessons.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].status).toBe('error');
    expect(response.body.data.results[0].message).toContain('introuvable');
  });

  it('creates a new module and lesson under an existing course', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM courses WHERE tenant_id')) return Promise.resolve([{ id: 5 }]);
      if (query.includes('SELECT id FROM modules WHERE course_id')) return Promise.resolve([]);
      if (query.includes('SELECT COALESCE(MAX(position), 0) as max_pos FROM modules')) return Promise.resolve([{ max_pos: 0 }]);
      if (query.startsWith('INSERT INTO modules')) return Promise.resolve([{ id: 20 }]);
      if (query.includes('SELECT * FROM modules WHERE id = @id')) return Promise.resolve([{ id: 20, course_id: 5, title: 'Module 1', position: 1 }]);
      if (query.includes('SELECT id FROM lessons WHERE module_id')) return Promise.resolve([]);
      if (query.includes('SELECT COALESCE(MAX(position), 0) as max_pos FROM lessons')) return Promise.resolve([{ max_pos: 0 }]);
      if (query.startsWith('INSERT INTO lessons')) return Promise.resolve([{ id: 30 }]);
      if (query.includes('SELECT * FROM lessons WHERE id = @id')) return Promise.resolve([{ id: 30, module_id: 20, title: 'Lesson 1', position: 1 }]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['courseTitle', 'moduleTitle', 'lessonTitle', 'durationMin'],
      [['Existing Course', 'Module 1', 'Lesson 1', 10]]
    );

    const response = await request(makeApp())
      .post('/import/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'lessons.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.results[0].status).toBe('created');
  });
});

describe('POST /import/quizzes', () => {
  it('errors a row whose lesson cannot be found', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM lessons l')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['courseTitle', 'lessonTitle', 'quizTitle', 'passingScore', 'questionType', 'questionPrompt', 'questionPoints', 'choice1', 'choice1Correct', 'choice2', 'choice2Correct', 'choice3', 'choice3Correct', 'choice4', 'choice4Correct'],
      [['Unknown Course', 'Unknown Lesson', 'Quiz A', 70, 'mcq', 'Question?', 1, 'A', 'oui', 'B', 'non', '', '', '', '']]
    );

    const response = await request(makeApp())
      .post('/import/quizzes')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'quizzes.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].status).toBe('error');
    expect(response.body.data.results[0].message).toContain('introuvable');
  });

  it('creates a quiz with a question and its choices', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM lessons l')) return Promise.resolve([{ id: 30 }]);
      if (query.includes('SELECT id FROM quizzes WHERE lesson_id')) return Promise.resolve([]);
      if (query.startsWith('INSERT INTO quizzes')) return Promise.resolve([{ id: 40 }]);
      if (query.includes('SELECT COALESCE(MAX(position), 0) as max_pos FROM questions')) return Promise.resolve([{ max_pos: 0 }]);
      if (query.startsWith('INSERT INTO questions')) return Promise.resolve([{ id: 50 }]);
      return Promise.resolve([]);
    });

    const buffer = await makeXlsxBuffer(
      ['courseTitle', 'lessonTitle', 'quizTitle', 'passingScore', 'questionType', 'questionPrompt', 'questionPoints', 'choice1', 'choice1Correct', 'choice2', 'choice2Correct', 'choice3', 'choice3Correct', 'choice4', 'choice4Correct'],
      [['Existing Course', 'Existing Lesson', 'Quiz A', 70, 'mcq', 'Question?', 1, 'A', 'oui', 'B', 'non', '', '', '', '']]
    );

    const response = await request(makeApp())
      .post('/import/quizzes')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'quizzes.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.results[0].status).toBe('created');
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO choices'),
      expect.objectContaining({ label: 'A', isCorrect: true })
    );
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO choices'),
      expect.objectContaining({ label: 'B', isCorrect: false })
    );
  });
});
