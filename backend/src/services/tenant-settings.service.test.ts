import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database.service';
import { NotificationService } from './notification.service';
import { TenantSettingsService, DEFAULT_PLATFORM_SETTINGS } from './tenant-settings.service';
import chatRoutes from '../routes/chat.routes';
import liveSessionRoutes from '../routes/live-session.routes';
import authRoutes from '../routes/auth.routes';
import organizationRoutes from '../routes/organization.routes';
import searchRoutes from '../routes/search.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/chat', chatRoutes);
  app.use('/live-sessions', liveSessionRoutes);
  app.use('/auth', authRoutes);
  app.use('/organizations', organizationRoutes);
  app.use('/search', searchRoutes);
  app.use(errorHandler);
  return app;
}

const token = (role = 'agent', id = 3) => jwt.sign({ id, tenantId: 10, email: 'u@test.com', role }, config.jwt.secret);

function authRow(role = 'agent', id = 3) {
  return {
    id, tenant_id: 10, email: 'u@test.com', display_name: 'U', avatar_url: null, role,
    enterprise_id: null, direction_id: null, service_id: null, is_active: true,
  };
}

/** Mocks the DB with a tenant_settings row (null = no row) plus route-specific answers. */
function mockDb(settings: Record<string, any> | null, extra: (q: string, p: any) => any = () => undefined, role = 'agent') {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([authRow(role)]);
    if (query.includes('FROM tenant_settings')) return Promise.resolve(settings ? [settings] : []);
    const answer = extra(query, params);
    return Promise.resolve(answer ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

const row = (overrides: Record<string, any> = {}) => ({
  allow_self_registration: true, default_language: 'fr', timezone: 'Europe/Paris',
  enable_notifications: true, enable_chat: true, enable_live_sessions: true,
  max_users_per_group: 50, certificate_validity: 365, ...overrides,
});

beforeEach(() => {
  TenantSettingsService.clearCache();
  mockedQuery.mockReset();
  mockedExecute.mockReset();
});

describe('TenantSettingsService', () => {
  it('falls back to the defaults when the tenant has no settings row', async () => {
    mockDb(null);
    expect(await TenantSettingsService.get(10)).toEqual(DEFAULT_PLATFORM_SETTINGS);
  });

  it('maps the stored row and caches it until invalidated', async () => {
    mockDb(row({ enable_chat: false, max_users_per_group: '8' }));
    const first = await TenantSettingsService.get(10);
    expect(first).toMatchObject({ enableChat: false, maxUsersPerGroup: 8 });

    mockDb(row({ enable_chat: true }));
    expect((await TenantSettingsService.get(10)).enableChat).toBe(false); // cached
    TenantSettingsService.invalidate(10);
    expect((await TenantSettingsService.get(10)).enableChat).toBe(true);
  });
});

describe('module switches', () => {
  it('refuses every chat endpoint with FEATURE_DISABLED when the chat is off', async () => {
    mockDb(row({ enable_chat: false }));
    const response = await request(makeApp()).get('/chat/conversations').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('refuses live-session endpoints when live sessions are off', async () => {
    mockDb(row({ enable_live_sessions: false }));
    const response = await request(makeApp()).get('/live-sessions').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('caps group conversations at the organization maximum', async () => {
    mockDb(row({ max_users_per_group: 3 }));
    const response = await request(makeApp()).post('/chat/conversations').set('Authorization', `Bearer ${token()}`)
      .send({ scope: 'group', title: 'G', participantIds: [4, 5, 6] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('GROUP_TOO_LARGE');
    expect(response.body.error.message).toContain('at most 3 participants (4 requested)');
  });

  it('leaves live sessions out of the global search when the module is off', async () => {
    mockDb(row({ enable_live_sessions: false }));
    await request(makeApp()).get('/search?q=formation').set('Authorization', `Bearer ${token()}`);
    expect(mockedQuery.mock.calls.some(([q]: [string]) => q.includes('FROM live_sessions'))).toBe(false);
  });
});

describe('self-registration', () => {
  const signUp = (body: Record<string, any> = {}) =>
    request(makeApp()).post('/auth/register').set('X-Tenant-ID', '10').send({
      email: 'new@test.com', password: 'Passw0rd!', displayName: 'New', ...body,
    });

  it('is refused when the organization closed sign-ups', async () => {
    mockDb(row({ allow_self_registration: false }));
    const response = await signUp();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REGISTRATION_CLOSED');
    expect(mockedQuery.mock.calls.some(([q]: [string]) => q.includes('INSERT INTO users'))).toBe(false);
  });

  it('always creates a learner account, whatever role the request asks for', async () => {
    mockDb(row(), (q) => (q.includes('INSERT INTO users') ? [{ id: 77 }] : undefined));
    jest.spyOn(NotificationService, 'send').mockResolvedValue({ id: 1, status: 'sent', channel: 'email' } as any);
    const response = await signUp({ role: 'admin' });
    expect(response.status).toBe(201);
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(params.role).toBe('agent');
  });

  it('exposes whether sign-ups are open before login', async () => {
    mockDb(row({ allow_self_registration: false, default_language: 'en' }));
    const response = await request(makeApp()).get('/auth/registration-settings').set('X-Tenant-ID', '10');
    expect(response.body.data).toEqual({
      allowSelfRegistration: false,
      defaultLanguage: 'en',
      requireApproval: true,
      allowedEmailDomains: [],
      passwordPolicy: { minLength: 8, requireComplexity: true },
    });
  });
});

describe('notifications switch', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('skips ordinary notifications when the organization turned them off', async () => {
    mockDb(row({ enable_notifications: false }));
    const result = await NotificationService.send({ tenantId: 10, userId: 3, channel: 'in_app', body: 'Rappel' });
    expect(result.status).toBe('skipped');
    expect(mockedQuery.mock.calls.some(([q]: [string]) => q.includes('INSERT INTO notifications'))).toBe(false);
  });

  it('still sends essential account/security notifications', async () => {
    mockDb(row({ enable_notifications: false }), (q) => {
      if (q.includes('FROM users WHERE id = @userId')) return [{ id: 3, email: 'u@test.com', display_name: 'U' }];
      if (q.includes('INSERT INTO notifications')) return [{ id: 9 }];
      return undefined;
    });
    await NotificationService.send({ tenantId: 10, userId: 3, channel: 'in_app', body: 'Mot de passe', essential: true });
    expect(mockedQuery.mock.calls.some(([q]: [string]) => q.includes('INSERT INTO notifications'))).toBe(true);
  });
});

describe('PUT /organizations/current/settings', () => {
  it('keeps the other settings when only one field is saved, and validates language/time zone', async () => {
    mockDb(row({ timezone: 'Africa/Abidjan', certificate_validity: 730 }), (q) =>
      q.includes('SELECT id FROM tenant_settings') ? [{ id: 1 }] : undefined, 'admin');

    const ok = await request(makeApp()).put('/organizations/current/settings')
      .set('Authorization', `Bearer ${token('admin', 1)}`).send({ enableChat: false });
    expect(ok.status).toBe(200);
    const [, params] = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('UPDATE tenant_settings SET'));
    expect(params).toMatchObject({ enableChat: false, timezone: 'Africa/Abidjan', certificateValidity: 730 });

    const badZone = await request(makeApp()).put('/organizations/current/settings')
      .set('Authorization', `Bearer ${token('admin', 1)}`).send({ timezone: 'Mars/Olympus' });
    expect(badZone.status).toBe(400);
    const badLang = await request(makeApp()).put('/organizations/current/settings')
      .set('Authorization', `Bearer ${token('admin', 1)}`).send({ defaultLanguage: 'de' });
    expect(badLang.status).toBe(400);
  });
});
