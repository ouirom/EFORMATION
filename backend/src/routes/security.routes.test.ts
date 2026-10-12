import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import securityRoutes from './security.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/security', securityRoutes);
  app.use(errorHandler);
  return app;
}

const tokenFor = (role: string) => jwt.sign({ id: 1, tenantId: 10, email: `${role}@test.com`, role }, config.jwt.secret);

function mockDb(role: string, extra: (q: string, p: any) => any = () => undefined) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM users WHERE id = @id')) {
      return Promise.resolve([{ id: 1, tenant_id: 10, email: `${role}@test.com`, display_name: role, avatar_url: null, role, enterprise_id: null, direction_id: 5, service_id: null, is_active: true }]);
    }
    return Promise.resolve(extra(query, params) ?? []);
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /security/login-events', () => {
  it('is reserved to admins', async () => {
    mockDb('director');
    const res = await request(makeApp()).get('/security/login-events').set('Authorization', `Bearer ${tokenFor('director')}`);
    expect(res.status).toBe(403);
  });

  it("lists the organization's sign-in events with their device and reason", async () => {
    mockDb('admin', (query) => {
      if (query.includes('COUNT(*) AS total')) return [{ total: 1 }];
      if (query.includes('ORDER BY a.created_at DESC')) {
        return [{
          id: 9, action: 'LOGIN_FAILED', created_at: new Date(), actor_id: 42,
          metadata: JSON.stringify({ reason: 'invalid_password', ip: '::ffff:10.0.0.5', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' }),
          subject_id: 42, subject_name: 'Jane', subject_email: 'jane@test.com', subject_role: 'agent',
        }];
      }
      return undefined;
    });

    const res = await request(makeApp())
      .get('/security/login-events?result=failure&period=24h&search=Jane')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      action: 'LOGIN_FAILED', group: 'failure', reason: 'invalid_password', ip: '10.0.0.5', browser: 'Firefox / Linux',
      subject: { id: 42, email: 'jane@test.com' }, actor: null,
    });
    expect(res.body.meta.total).toBe(1);

    const [sql, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('ORDER BY a.created_at DESC'));
    expect(params).toMatchObject({ tenantId: 10, search: '%jane%' });
    expect(sql).toContain("'LOGIN_FAILED'");
    expect(sql).toContain("'2FA_FAILED'");
    expect(sql).not.toContain("'USER_LOGIN'");
    expect(sql).toMatch(/-24/); // last 24 hours
  });
});

describe('GET /security/suspicious-ips', () => {
  it('groups recent failures by IP above the threshold, for this organization', async () => {
    mockDb('admin', (query) => (query.includes('GROUP BY ip') ? [{ ip: '10.0.0.5', failures: 7, accounts: 3, last_at: new Date() }] : undefined));

    const res = await request(makeApp()).get('/security/suspicious-ips?threshold=6').set('Authorization', `Bearer ${tokenFor('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ ip: '10.0.0.5', failures: 7, accounts: 3 })]);
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('GROUP BY ip'));
    expect(params).toEqual({ tenantId: 10, threshold: 6 });
  });
});
