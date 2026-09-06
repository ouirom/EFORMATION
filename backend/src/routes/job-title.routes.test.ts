import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import jobTitleRoutes from './job-title.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/job-titles', jobTitleRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const adminToken = tokenFor({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' });
const agentToken = tokenFor({ id: 5, tenantId: 10, email: 'agent@test.com', role: 'agent' });

describe('GET /job-titles', () => {
  it('lists job titles for the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM job_titles WHERE tenant_id')) {
        return Promise.resolve([{ id: 1, label: 'PDG' }, { id: 2, label: 'Défaut' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/job-titles').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 1, label: 'PDG' }, { id: 2, label: 'Défaut' }]);
  });
});

describe('POST /job-titles', () => {
  it('creates a new job title', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE tenant_id = @tenantId AND label = @label') return Promise.resolve([]);
      if (query.includes('INSERT INTO job_titles')) return Promise.resolve([{ id: 11 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/job-titles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Consultant' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 11, label: 'Consultant' });
  });

  it('rejects a duplicate label', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE tenant_id = @tenantId AND label = @label') return Promise.resolve([{ id: 3 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/job-titles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'PDG' });

    expect(response.status).toBe(400);
  });

  it('rejects a caller without admin/director role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 5, role: 'agent' })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/job-titles')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ label: 'Consultant' });

    expect(response.status).toBe(403);
  });
});

describe('PUT /job-titles/:id', () => {
  it('renames a job title', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([{ id: 7 }]);
      if (query.includes('AND label = @label AND id != @id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/job-titles/7')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Directeur Général' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 7, label: 'Directeur Général' });
  });

  it('404s when the job title does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/job-titles/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'X' });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /job-titles/:id', () => {
  it('deletes a job title', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([{ id: 4 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).delete('/job-titles/4').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      'DELETE FROM job_titles WHERE id = @id AND tenant_id = @tenantId',
      { id: 4, tenantId: 10 }
    );
  });

  it('404s for a job title outside the caller tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query === 'SELECT id FROM job_titles WHERE id = @id AND tenant_id = @tenantId') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).delete('/job-titles/4').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
