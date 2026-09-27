import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import reportRoutes from './report.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/reports', reportRoutes);
  app.use(errorHandler);
  return app;
}

function mockAuthLookup() {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
  };
}

const adminToken = jwt.sign({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' }, config.jwt.secret);

// Regression coverage: enrollments only has progress_percent/enrolled_at columns
// (no progress/started_at -- see db/bci_lms_schema_postgres.sql), but four of
// these report types referenced the wrong names and 500'd unconditionally
// whenever generated. Each case here asserts the actual query text uses the
// real column names.
describe('POST /reports/generate uses real enrollments column names', () => {
  const cases: Array<{ reportType: string; mustContain: string[]; mustNotContain: string[] }> = [
    {
      reportType: 'user_progress',
      mustContain: ['en.progress_percent'],
      mustNotContain: ['en.progress)', 'en.progress '],
    },
    {
      reportType: 'course_completion',
      mustContain: ['e.progress_percent', 'e.enrolled_at'],
      mustNotContain: ['e.progress)', 'e.started_at'],
    },
    {
      reportType: 'enrollment_summary',
      mustContain: ['e.enrolled_at'],
      mustNotContain: ['e.started_at'],
    },
    {
      reportType: 'organization_overview',
      mustContain: ['en.progress_percent'],
      mustNotContain: ['en.progress)'],
    },
    {
      // quizzes has no course_id column -- must reach courses via lesson -> module
      reportType: 'quiz_performance',
      mustContain: ['LEFT JOIN lessons l ON q.lesson_id = l.id', 'LEFT JOIN modules m ON l.module_id = m.id', 'LEFT JOIN courses c ON m.course_id = c.id'],
      mustNotContain: ['q.course_id'],
    },
    {
      // audit_logs has entity/entity_id, not resource_type/resource_id/ip_address
      reportType: 'activity_log',
      mustContain: ['al.entity', 'al.entity_id'],
      mustNotContain: ['al.resource_type', 'al.resource_id', 'al.ip_address'],
    },
  ];

  for (const { reportType, mustContain, mustNotContain } of cases) {
    it(`${reportType} query references real columns`, async () => {
      mockedQuery.mockImplementation((query: string) => {
        if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
        return Promise.resolve([]);
      });

      const response = await request(makeApp())
        .post('/reports/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reportType, format: 'json' });

      expect(response.status).toBe(200);
      const dataQuery = mockedQuery.mock.calls.find(([q]: [string]) => !q.includes('FROM users WHERE id = @id'))?.[0] || '';
      for (const fragment of mustContain) {
        expect(dataQuery).toContain(fragment);
      }
      for (const fragment of mustNotContain) {
        expect(dataQuery).not.toContain(fragment);
      }
    });
  }
});

// Regression coverage: with a date range supplied, the bare `created_at` filter
// used to be ambiguous whenever more than one joined table has a created_at
// column (e.g. users + enterprises, or quizzes + lessons + courses), which
// only surfaced once startDate/endDate were actually passed.
describe('POST /reports/generate qualifies the date filter when multiple joined tables have created_at', () => {
  const cases = [
    { reportType: 'user_progress', qualifiedColumn: 'u.created_at' },
    { reportType: 'quiz_performance', qualifiedColumn: 'q.created_at' },
  ];

  for (const { reportType, qualifiedColumn } of cases) {
    it(`${reportType} qualifies created_at as ${qualifiedColumn} when a date range is given`, async () => {
      mockedQuery.mockImplementation((query: string) => {
        if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
        return Promise.resolve([]);
      });

      const response = await request(makeApp())
        .post('/reports/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reportType, format: 'json', startDate: '2026-01-01', endDate: '2026-12-31' });

      expect(response.status).toBe(200);
      const dataQuery = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('@startDate'))?.[0] || '';
      expect(dataQuery).toContain(`${qualifiedColumn} >= @startDate`);
      expect(dataQuery).toContain(`${qualifiedColumn} < @endDate`);
      expect(dataQuery).not.toMatch(/[^.]\bcreated_at [<>]/);
    });
  }
});

describe('POST /reports/generate course_completion category labels', () => {
  function mockData() {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM categories c')) {
        return Promise.resolve([
          { id: 1, code: 'hr', name: null, course_count: 1 },
          { id: 2, code: 'annonces', name: 'Annonces', course_count: 1 },
        ]);
      }
      if (query.includes('total_enrollments')) {
        return Promise.resolve([
          { id: 1, title: 'RH', category: 'hr' },
          { id: 2, title: 'Infos', category: 'annonces' },
          { id: 3, title: 'Sans catégorie', category: null },
        ]);
      }
      return Promise.resolve([]);
    });
  }

  it('exports labels instead of codes, in the requested language (French by default)', async () => {
    mockData();
    const fr = await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'course_completion', format: 'json' });
    expect(fr.body.data.map((r: any) => r.category)).toEqual(['Ressources humaines', 'Annonces', null]);

    const en = await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'course_completion', format: 'json', language: 'en' });
    expect(en.body.data.map((r: any) => r.category)).toEqual(['Human resources', 'Annonces', null]);
  });
});

describe('POST /reports/generate presentation', () => {
  function mockRows() {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM tenant_settings')) return Promise.resolve([{ timezone: 'Europe/Paris' }]);
      if (query.includes('enrolled_courses')) {
        return Promise.resolve([
          { id: 1, display_name: 'Dupont, "Jean"', email: 'j@x.fr', role: 'agent', enterprise: null, enrolled_courses: 2, avg_progress: '66.6666666667', completed_courses: 1 },
        ]);
      }
      return Promise.resolve([]);
    });
  }

  it('returns localized columns and clean values in the JSON preview', async () => {
    mockRows();
    const response = await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'user_progress', format: 'json', language: 'en' });

    expect(response.body.data[0]).toMatchObject({ role: 'Agent', avg_progress: 66.7 });
    expect(response.body.meta).toMatchObject({ title: 'User progress', rowCount: 1, language: 'en', period: 'all time' });
    expect(response.body.meta.columns.map((c: any) => c.label)).toContain('Average progress');
  });

  it('writes a BOM-prefixed CSV with translated headers and RFC 4180 quoting', async () => {
    mockRows();
    const response = await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'user_progress', format: 'csv' });

    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = response.text.slice(1).split('\r\n');
    expect(header).toBe('ID,Nom,E-mail,Rôle,Entreprise,Cours suivis,Progression moyenne,Cours terminés');
    expect(line).toBe('1,"Dupont, ""Jean""",j@x.fr,Agent,,2,"66,7 %",1');
  });

  it('leaves deleted users out of the progress report', async () => {
    mockRows();
    await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'user_progress', format: 'json' });
    const [query] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('enrolled_courses'));
    expect(query).toContain('u.deleted_at IS NULL');
  });
});

describe('POST /reports/generate period filter', () => {
  it('includes the whole end day and supports an end date alone', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'enrollment_summary', format: 'json', startDate: '2026-07-01', endDate: '2026-07-23' });
    let [query, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('unique_users'));
    expect(query).toContain('e.enrolled_at >= @startDate');
    expect(query).toContain('e.enrolled_at < @endDate');
    expect(params.endDate).toBe('2026-07-24');

    mockedQuery.mockClear();
    await request(makeApp()).post('/reports/generate').set('Authorization', `Bearer ${adminToken}`)
      .send({ reportType: 'activity_log', format: 'json', endDate: '2026-07-23' });
    [query] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('FROM audit_logs al'));
    expect(query).toContain('al.created_at < @endDate');
    expect(query).not.toContain('@startDate');
  });
});
