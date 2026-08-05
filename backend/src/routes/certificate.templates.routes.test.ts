import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import certificateRoutes from './certificate.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/certificates', certificateRoutes);
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
    email: 'admin@test.com',
    display_name: 'Admin',
    avatar_url: null,
    role: 'admin',
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
    ...overrides,
  };
}

const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });

describe('GET /certificates (list, camelCase mapping)', () => {
  it('maps DB rows to the shape the admin UI expects', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM certificates c')) {
        return Promise.resolve([
          {
            id: 1,
            user_id: 5,
            course_id: 7,
            template_id: null,
            serial: 'CERT-1',
            issued_at: '2026-01-01T00:00:00.000Z',
            expires_at: null,
            revoked_at: null,
            user_name: 'Jane Doe',
            course_name: 'Sécurité',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/certificates')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: 1,
      userId: 5,
      courseId: 7,
      certificateNumber: 'CERT-1',
      userName: 'Jane Doe',
      courseName: 'Sécurité',
      status: 'issued',
    });
  });
});

describe('certificate templates CRUD', () => {
  it('creates a template and clears any previous default when isDefault is set', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('INSERT INTO certificate_templates')) return Promise.resolve([{ id: 9 }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const response = await request(makeApp())
      .post('/certificates/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Standard', description: 'desc', templateHtml: '<div/>', isDefault: true });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 9, name: 'Standard', isDefault: true });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE certificate_templates SET is_default = 0'),
      expect.any(Object)
    );
  });

  it('rejects deleting the default template', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, is_default FROM certificate_templates')) {
        return Promise.resolve([{ id: 3, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/certificates/templates/3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });

  it('returns 404 when updating a template that does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM certificate_templates')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/certificates/templates/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });

    expect(response.status).toBe(404);
  });
});

describe('PUT /certificates/:id/revoke', () => {
  it('revokes an existing certificate', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM certificates WHERE id = @id')) return Promise.resolve([{ id: 4 }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });

    const response = await request(makeApp())
      .put('/certificates/4/revoke')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('SET revoked_at = SYSUTCDATETIME()'),
      expect.objectContaining({ id: 4, revokedBy: 1 })
    );
  });

  it('returns 404 for a certificate that does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id FROM certificates WHERE id = @id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/certificates/999/revoke')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });

  it('returns 403 for a role that cannot revoke', async () => {
    const managerToken = tokenFor({ id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'manager@test.com', role: 'manager' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/certificates/4/revoke')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(403);
  });
});
