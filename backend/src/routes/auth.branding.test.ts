import express from 'express';
import request from 'supertest';
import { DatabaseService } from '../services/database.service';
import authRoutes from './auth.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { errorHandler } from '../middleware/error.middleware';

jest.mock('../services/database.service');
jest.mock('../services/audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockedQuery.mockReset();
});

describe('GET /auth/branding', () => {
  it("publishes the organization's name, logo and colors before login", async () => {
    mockedQuery.mockResolvedValue([
      { name: 'BELIFE Insurance', logo_url: '/uploads/logos/belife.png', primary_color: '#8B1E1E', secondary_color: '#E9A23B' },
    ]);
    const response = await request(makeApp()).get('/auth/branding').set('X-Tenant-ID', '10');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      name: 'BELIFE Insurance',
      logoUrl: '/uploads/logos/belife.png',
      primaryColor: '#8B1E1E',
      secondaryColor: '#E9A23B',
      externalAccentColor: '#D97706',
      externalSurfaceColor: '#0F172A',
    });
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toContain('LEFT JOIN tenant_settings');
    expect(params).toEqual({ tenantId: 10 });
  });

  it('returns nulls when the organization has no customization', async () => {
    mockedQuery.mockResolvedValue([{ name: 'Acme', logo_url: null, primary_color: null, secondary_color: null }]);
    const response = await request(makeApp()).get('/auth/branding').set('X-Tenant-ID', '10');
    expect(response.body.data).toEqual({
      name: 'Acme', logoUrl: null, primaryColor: null, secondaryColor: null,
      externalAccentColor: '#D97706', externalSurfaceColor: '#0F172A',
    });
  });

  it('returns nulls for an unknown organization', async () => {
    mockedQuery.mockResolvedValue([]);
    const response = await request(makeApp()).get('/auth/branding').set('X-Tenant-ID', '10');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      name: null, logoUrl: null, primaryColor: null, secondaryColor: null,
      externalAccentColor: '#D97706', externalSurfaceColor: '#0F172A',
    });
  });

  it("publishes the partner theme chosen for external participants", async () => {
    mockedQuery.mockResolvedValue([
      { name: 'Acme', logo_url: null, primary_color: '#3B82F6', secondary_color: '#10B981', external_accent_color: '#0e7490', external_surface_color: '#1E293B' },
    ]);
    const response = await request(makeApp()).get('/auth/branding').set('X-Tenant-ID', '10');
    expect(response.body.data).toMatchObject({ externalAccentColor: '#0E7490', externalSurfaceColor: '#1E293B' });
    expect(mockedQuery.mock.calls[0][0]).toContain('external_accent_color');
  });
});
