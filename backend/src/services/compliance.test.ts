import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database.service';
import { ComplianceService } from './compliance.service';
import { TenantSettingsService } from './tenant-settings.service';
import userRoutes from '../routes/user.routes';
import authRoutes from '../routes/auth.routes';
import organizationRoutes from '../routes/organization.routes';
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
  app.use('/users', userRoutes);
  app.use('/auth', authRoutes);
  app.use('/organizations', organizationRoutes);
  app.use(errorHandler);
  return app;
}

const token = (role = 'admin', id = 3) => jwt.sign({ id, tenantId: 10, email: 'a@test.com', role }, config.jwt.secret);

function mockDb(settings: Record<string, any> | null, extra: (q: string, p: any) => any = () => undefined, role = 'admin') {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_settings WHERE tenant_id')) return Promise.resolve(settings ? [settings] : []);
    if (query.includes('FROM users WHERE id = @id AND deleted_at IS NULL')) {
      return Promise.resolve([{ id: 3, tenant_id: 10, email: 'a@test.com', role, is_active: true }]);
    }
    return Promise.resolve(extra(query, params) ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

const executed = (fragment: string) => mockedExecute.mock.calls.filter(([q]: [string]) => q.includes(fragment));

beforeEach(() => {
  TenantSettingsService.clearCache();
  mockedQuery.mockReset();
  mockedExecute.mockReset();
});

describe('activity log retention', () => {
  it("purges each organization's log past its own retention only", async () => {
    mockedQuery.mockResolvedValue([{ tenant_id: 10, days: 90 }, { tenant_id: 11, days: '365' }]);
    mockedExecute.mockResolvedValue({ rowsAffected: 4 });
    const result = await ComplianceService.purgeAuditLogs();
    expect(mockedQuery.mock.calls[0][0]).toContain('audit_log_retention_days > 0');
    expect(executed('DELETE FROM audit_logs')).toHaveLength(2);
    expect(executed('DELETE FROM audit_logs')[0][0]).toMatch(/-90/);
    expect(executed('DELETE FROM audit_logs')[1][1]).toEqual({ tenantId: 11 });
    expect(result).toEqual({ deleted: 8 });
  });
});

describe('anonymization', () => {
  it('erases personal data but keeps the learning records', async () => {
    await ComplianceService.anonymizeUser(10, 42, 3);
    const [sql, params] = executed('UPDATE users SET')[0];
    expect(sql).toContain('avatar_url = NULL, phone = NULL');
    expect(sql).toContain('anonymized_at IS NULL');
    expect(params).toMatchObject({ email: 'deleted-42@anonymized.invalid', displayName: 'Utilisateur supprimé' });
    expect(executed('DELETE FROM notifications')).toHaveLength(1);
    expect(executed('UPDATE chat_messages')).toHaveLength(1);
    expect(mockedExecute.mock.calls.some(([q]: [string]) => /DELETE FROM (enrollments|certificates|quiz_attempts)/.test(q))).toBe(false);
  });

  it('happens on delete when the organization asks for it', async () => {
    mockDb({ anonymize_deleted_users: true });
    const response = await request(makeApp()).delete('/users/42').set('Authorization', `Bearer ${token()}`);
    expect(response.body.anonymized).toBe(true);
    expect(executed('anonymized_at = ')).toHaveLength(1);
  });

  it('does not happen on delete otherwise', async () => {
    mockDb(null);
    const response = await request(makeApp()).delete('/users/42').set('Authorization', `Bearer ${token()}`);
    expect(response.body.anonymized).toBe(false);
    expect(executed('anonymized_at = ')).toHaveLength(0);
  });

  it('refuses to anonymize an account that is not deleted', async () => {
    mockDb(null, (q) => (q.includes('SELECT id, deleted_at, anonymized_at') ? [{ id: 42, deleted_at: null, anonymized_at: null }] : undefined));
    const response = await request(makeApp()).post('/users/42/anonymize').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('USER_NOT_DELETED');
  });
});

describe('personal data export', () => {
  const profileRow = { id: 3, email: 'a@test.com', display_name: 'A', enterprise: 'Groupe' };

  it('lets anyone download their own data, without secrets', async () => {
    mockDb(null, (q) => (q.includes('LEFT JOIN subsidiaries sub ON sub.id = u.subsidiary_id') ? [profileRow] : undefined), 'agent');
    const response = await request(makeApp()).get('/users/me/export').set('Authorization', `Bearer ${token('agent')}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.body.profile).toEqual(profileRow);
    expect(response.body.learning).toHaveProperty('certificates');
    expect(JSON.stringify(response.body)).not.toMatch(/password_hash|token_version/);
  });

  it("refuses a learner downloading someone else's data", async () => {
    mockDb(null, undefined, 'agent');
    const response = await request(makeApp()).get('/users/42/export').set('Authorization', `Bearer ${token('agent')}`);
    expect(response.status).toBe(403);
  });
});

describe('legal information and settings', () => {
  it('publishes the legal notice before login', async () => {
    mockDb({ legal_notice: 'Éditeur : BELIFE', privacy_policy_url: 'https://belife.ci/privacy', privacy_contact_email: null });
    const response = await request(makeApp()).get('/auth/legal').set('X-Tenant-ID', '10');
    expect(response.body.data).toEqual({ legalNotice: 'Éditeur : BELIFE', privacyPolicyUrl: 'https://belife.ci/privacy', privacyContactEmail: '' });
  });

  it.each([[{ privacyPolicyUrl: 'javascript:alert(1)' }], [{ privacyContactEmail: 'not-an-email' }], [{ auditLogRetentionDays: -1 }]])(
    'rejects %j',
    async (body) => {
      mockDb(null);
      const response = await request(makeApp()).put('/organizations/current/settings').set('Authorization', `Bearer ${token()}`).send(body);
      expect(response.status).toBe(400);
    }
  );

  it('stores an emptied link as NULL', async () => {
    mockDb({ privacy_policy_url: 'https://old' }, (q) => (q.includes('SELECT id FROM tenant_settings') ? [{ id: 1 }] : undefined));
    await request(makeApp()).put('/organizations/current/settings').set('Authorization', `Bearer ${token()}`).send({ privacyPolicyUrl: '' });
    expect(executed('UPDATE tenant_settings')[0][1].privacyPolicyUrl).toBeNull();
  });

  it('lists the settings history with long texts shortened', async () => {
    mockDb(null, (q) =>
      q.includes('FROM audit_logs a')
        ? [{ id: 1, action: 'SETTINGS_UPDATED', metadata: JSON.stringify({ legalNotice: 'x'.repeat(200), maxLoginAttempts: 3 }), actor_name: 'Admin', created_at: '2026-09-27' }]
        : undefined
    );
    const response = await request(makeApp()).get('/organizations/current/history').set('Authorization', `Bearer ${token()}`);
    expect(response.body.data[0]).toMatchObject({ action: 'SETTINGS_UPDATED', actorName: 'Admin', changes: { maxLoginAttempts: 3 } });
    expect((response.body.data[0].changes.legalNotice as string).length).toBe(80);
  });
});
