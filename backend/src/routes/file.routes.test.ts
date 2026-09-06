import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fileRoutes from './file.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/files', fileRoutes);
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
const directorToken = tokenFor({ id: 2, tenantId: 10, email: 'director@test.com', role: 'director' });

const FILE_ROW = { id: 7, tenant_id: 10, filename: 'doc.docx', storage_key: 'docs/doc.docx' };

describe('GET /files/:id/download -- allow_document_download', () => {
  function mockDownload(opts: { role: 'agent' | 'director'; lessonRows: Array<{ allow_document_download: boolean }> }) {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup(opts.role === 'director' ? { id: 2, role: 'director' } : {})]);
      }
      if (query.includes('FROM file_assets WHERE id = @fileId')) return Promise.resolve([FILE_ROW]);
      if (query.includes('FROM contents c') && query.includes('JOIN lessons l')) {
        return Promise.resolve(opts.lessonRows);
      }
      return Promise.resolve([]);
    });
  }

  it('blocks a learner from downloading a document whose lesson disables downloads', async () => {
    mockDownload({ role: 'agent', lessonRows: [{ allow_document_download: false }] });

    const response = await request(makeApp())
      .get('/files/7/download')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });

  it('does not block a learner when the lesson allows downloads', async () => {
    mockDownload({ role: 'agent', lessonRows: [{ allow_document_download: true }] });

    const response = await request(makeApp())
      .get('/files/7/download')
      .set('Authorization', `Bearer ${agentToken}`);

    // Passes the permission check and falls through to the (missing-on-disk) file
    // lookup in this test environment -- the point is it's not a 403.
    expect(response.status).not.toBe(403);
  });

  it('does not block a learner when the file is not attached to any lesson', async () => {
    mockDownload({ role: 'agent', lessonRows: [] });

    const response = await request(makeApp())
      .get('/files/7/download')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).not.toBe(403);
  });

  it('exempts a director from the restriction, without even checking the lesson setting', async () => {
    mockDownload({ role: 'director', lessonRows: [{ allow_document_download: false }] });

    const response = await request(makeApp())
      .get('/files/7/download')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).not.toBe(403);
    const lessonLookup = mockedQuery.mock.calls.find(
      ([q]: [string]) => q.includes('FROM contents c') && q.includes('JOIN lessons l')
    );
    expect(lessonLookup).toBeUndefined();
  });
});
