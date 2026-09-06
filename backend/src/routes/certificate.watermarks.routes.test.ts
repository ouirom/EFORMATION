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
const managerToken = tokenFor({ id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager' });

describe('GET /certificates/watermarks', () => {
  it('lists watermarks with file_assets joined and mapped to camelCase', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM certificate_watermarks cw')) {
        return Promise.resolve([
          {
            id: 5,
            name: 'Logo Nord',
            is_default: true,
            created_at: '2026-01-01',
            storage_key: 'watermarks/logo.png',
            mime_type: 'image/png',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/certificates/watermarks').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: 5,
      name: 'Logo Nord',
      isDefault: true,
      storageKey: 'watermarks/logo.png',
      mimeType: 'image/png',
    });
  });

  it('rejects a role that cannot manage watermarks', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'manager@test.com', role: 'manager' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/certificates/watermarks').set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(403);
  });
});

describe('POST /certificates/watermarks', () => {
  it('registers an uploaded file as a watermark and clears any previous default', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId') {
        return Promise.resolve([{ id: 42 }]);
      }
      if (query.includes('INSERT INTO certificate_watermarks')) return Promise.resolve([{ id: 9 }]);
      if (query.includes('FROM certificate_watermarks cw')) {
        return Promise.resolve([
          { id: 9, name: 'Logo', is_default: true, created_at: '2026-01-01', storage_key: 'watermarks/x.png', mime_type: 'image/png' },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/certificates/watermarks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileId: 42, name: 'Logo', isDefault: true });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 9, name: 'Logo', isDefault: true });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE certificate_watermarks SET is_default = 0'),
      expect.any(Object)
    );
  });

  it('404s when the referenced file does not belong to the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/certificates/watermarks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileId: 999 });

    expect(response.status).toBe(404);
  });

  it('rejects a request missing fileId', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/certificates/watermarks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'No file' });

    expect(response.status).toBe(400);
  });
});

describe('PUT /certificates/watermarks/:id', () => {
  it('404s when updating a watermark that does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/certificates/watermarks/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isDefault: true });

    expect(response.status).toBe(404);
  });

  it('sets a watermark as default, clearing the previous one first', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([{ id: 7 }]);
      if (query.includes('FROM certificate_watermarks cw')) {
        return Promise.resolve([
          { id: 7, name: 'Logo 2', is_default: true, created_at: '2026-01-01', storage_key: 'watermarks/y.png', mime_type: 'image/png' },
        ]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/certificates/watermarks/7')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isDefault: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 7, isDefault: true });
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE certificate_watermarks SET is_default = 0'),
      expect.any(Object)
    );
  });
});

describe('DELETE /certificates/watermarks/:id', () => {
  it('rejects deleting the default watermark', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, is_default FROM certificate_watermarks')) {
        return Promise.resolve([{ id: 3, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/certificates/watermarks/3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });

  it('deletes a non-default watermark', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, is_default FROM certificate_watermarks')) {
        return Promise.resolve([{ id: 3, is_default: false }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/certificates/watermarks/3')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      'DELETE FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId',
      { id: 3, tenantId: 10 }
    );
  });
});
