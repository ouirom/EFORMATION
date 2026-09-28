import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { DatabaseService } from './database.service';
import { SsoConfigService } from './sso-config.service';
import { TenantSettingsService } from './tenant-settings.service';
import { LdapService } from './ldap.service';
import authRoutes from '../routes/auth.routes';
import settingsRoutes from '../routes/settings.routes';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('./database.service');
jest.mock('./audit.service');
jest.mock('axios');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/auth', authRoutes);
  app.use('/settings', settingsRoutes);
  app.use(errorHandler);
  return app;
}

const OTHER_TENANT = 20; // not the default tenant
const adminToken = (tenantId = OTHER_TENANT) =>
  jwt.sign({ id: 3, tenantId, email: 'a@test.com', role: 'admin' }, config.jwt.secret);

const ssoRow = (overrides: Record<string, any> = {}) => ({
  tenant_id: OTHER_TENANT,
  azure_enabled: true, azure_directory_id: 'contoso-dir', azure_client_id: 'azure-client', azure_client_secret: 'azure-secret',
  google_enabled: false, google_client_id: null, google_client_secret: null,
  ldap_enabled: true, ldap_url: 'ldaps://dc.contoso.local', ldap_bind_dn: 'cn=svc', ldap_bind_password: 'ldap-secret',
  ldap_search_base: 'dc=contoso', ldap_search_filter: null, ldap_email_attribute: null, ldap_name_attribute: null,
  ...overrides,
});

/** Mocks the DB: the SSO row of each tenant, plus route-specific answers. */
function mockDb(rows: Record<number, any>, extra: (q: string, p: any) => any = () => undefined) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('FROM tenant_sso_settings')) return Promise.resolve(rows[params?.tenantId] ? [rows[params.tenantId]] : []);
    if (query.includes('FROM users WHERE id = @id')) {
      return Promise.resolve([{ id: 3, tenant_id: params?.tenantId ?? OTHER_TENANT, email: 'a@test.com', role: 'admin', is_active: true }]);
    }
    return Promise.resolve(extra(query, params) ?? []);
  });
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
}

const savedPlatform = { azure: { ...config.azureAd }, google: { ...config.google } };

beforeEach(() => {
  SsoConfigService.clearCache();
  TenantSettingsService.clearCache();
  mockedQuery.mockReset();
  mockedExecute.mockReset();
  mockedAxios.post.mockReset();
  mockedAxios.get.mockReset();
  Object.assign(config.azureAd, { tenantId: 'platform-dir', clientId: 'platform-client', clientSecret: 'platform-secret' });
  Object.assign(config.google, { clientId: '', clientSecret: '' });
});

afterAll(() => {
  Object.assign(config.azureAd, savedPlatform.azure);
  Object.assign(config.google, savedPlatform.google);
});

describe('SsoConfigService', () => {
  it("uses the organization's own provider", async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const providers = await SsoConfigService.get(OTHER_TENANT);
    expect(providers.azure).toEqual({ directoryId: 'contoso-dir', clientId: 'azure-client', clientSecret: 'azure-secret' });
    expect(providers.ldap).toMatchObject({ url: 'ldaps://dc.contoso.local', searchFilter: expect.stringContaining('{{username}}'), emailAttribute: 'mail' });
    expect(providers.google).toBeNull();
    expect(providers.source).toEqual({ azure: 'tenant', google: null, ldap: 'tenant' });
  });

  it('never hands the platform (.env) provider to another organization', async () => {
    mockDb({});
    const providers = await SsoConfigService.get(OTHER_TENANT);
    expect(providers.azure).toBeNull();
  });

  it('keeps the platform provider for the default tenant', async () => {
    mockDb({});
    const providers = await SsoConfigService.get(config.defaultTenantId);
    expect(providers.azure).toMatchObject({ clientId: 'platform-client' });
    expect(providers.source.azure).toBe('platform');
  });

  it('ignores a disabled provider', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow({ azure_enabled: false }) });
    expect((await SsoConfigService.get(OTHER_TENANT)).azure).toBeNull();
  });

  it('signs a state bound to the organization and the provider', () => {
    const state = SsoConfigService.signState(OTHER_TENANT, 'azure');
    expect(SsoConfigService.verifyState(state, 'azure')).toBe(OTHER_TENANT);
    expect(() => SsoConfigService.verifyState(state, 'google')).toThrow(/Invalid or expired SSO session/);
    expect(() => SsoConfigService.verifyState('forged', 'azure')).toThrow();
  });
});

describe('SSO login flow', () => {
  it("redirects to the organization's Azure app with a signed state", async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const response = await request(makeApp()).get(`/auth/sso/azure?tenant=${OTHER_TENANT}`);
    expect(response.status).toBe(302);
    const url = new URL(response.headers.location);
    expect(url.pathname).toBe('/contoso-dir/oauth2/v2.0/authorize');
    expect(url.searchParams.get('client_id')).toBe('azure-client');
    expect(SsoConfigService.verifyState(url.searchParams.get('state'), 'azure')).toBe(OTHER_TENANT);
  });

  it('answers 400 SSO_NOT_CONFIGURED when the organization has no such provider', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const response = await request(makeApp()).get(`/auth/sso/google?tenant=${OTHER_TENANT}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('refuses a callback without a state it issued', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const response = await request(makeApp()).post('/auth/sso/azure/callback').send({ code: 'abc' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SSO_INVALID_STATE');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  function mockAzureProfile(email: string) {
    mockedAxios.post.mockResolvedValue({ data: { access_token: 'provider-token' } } as any);
    mockedAxios.get.mockResolvedValue({ data: { id: 'ext-42', mail: email, displayName: 'Jane' } } as any);
  }

  it("exchanges the code with the organization's credentials and provisions the account there", async () => {
    mockAzureProfile('jane@contoso.com');
    mockDb({ [OTHER_TENANT]: ssoRow() }, (q) => {
      if (q.includes('INSERT INTO users')) return [{ id: 99 }];
      if (q.includes('FROM users WHERE id = @userId')) return [{ id: 99, tenant_id: OTHER_TENANT, email: 'jane@contoso.com', role: 'agent', token_version: 0, status: 'active' }];
      return undefined;
    });
    const state = SsoConfigService.signState(OTHER_TENANT, 'azure');
    const response = await request(makeApp()).post('/auth/sso/azure/callback').send({ code: 'abc', state });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    const [tokenUrl, form] = mockedAxios.post.mock.calls[0] as [string, URLSearchParams];
    expect(tokenUrl).toContain('/contoso-dir/');
    expect(form.get('client_id')).toBe('azure-client');
    expect(form.get('client_secret')).toBe('azure-secret');
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO users'));
    expect(params.tenantId).toBe(OTHER_TENANT);
  });

  it("refuses to open another organization's account", async () => {
    mockAzureProfile('boss@other.com');
    mockDb({ [OTHER_TENANT]: ssoRow() }, (q) => (q.includes('FROM users') && q.includes('email = @email') ? [{ id: 5, tenant_id: '1' }] : undefined));
    const state = SsoConfigService.signState(OTHER_TENANT, 'azure');
    const response = await request(makeApp()).post('/auth/sso/azure/callback').send({ code: 'abc', state });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SSO_WRONG_ORGANIZATION');
    expect(mockedExecute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sso_identities'), expect.anything());
  });

  it('lists the providers of the requesting organization', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const response = await request(makeApp()).get('/auth/sso/providers').set('X-Tenant-ID', String(OTHER_TENANT));
    expect(response.body.data).toEqual({ azure: true, google: false, ldap: true });
  });
});

describe('LDAP login', () => {
  it("authenticates against the organization's directory", async () => {
    const spy = jest.spyOn(LdapService, 'authenticate').mockResolvedValue({ email: 'jane@contoso.com', displayName: 'Jane' });
    mockDb({ [OTHER_TENANT]: ssoRow() }, (q) => {
      if (q.includes('SELECT id, tenant_id, is_active FROM users')) return [{ id: 99, tenant_id: OTHER_TENANT, is_active: true }];
      if (q.includes('FROM users WHERE id = @userId')) return [{ id: 99, tenant_id: OTHER_TENANT, email: 'jane@contoso.com', role: 'agent', token_version: 0 }];
      return undefined;
    });
    const response = await request(makeApp())
      .post('/auth/ldap/login')
      .set('X-Tenant-ID', String(OTHER_TENANT))
      .send({ username: 'jane', password: 'secret' });
    expect(response.status).toBe(200);
    expect(spy.mock.calls[0][2]).toMatchObject({ url: 'ldaps://dc.contoso.local', bindDN: 'cn=svc' });
    spy.mockRestore();
  });

  it("refuses an account of another organization", async () => {
    const spy = jest.spyOn(LdapService, 'authenticate').mockResolvedValue({ email: 'boss@other.com', displayName: 'Boss' });
    mockDb({ [OTHER_TENANT]: ssoRow() }, (q) =>
      q.includes('SELECT id, tenant_id, is_active FROM users') ? [{ id: 5, tenant_id: 1, is_active: true }] : undefined
    );
    const response = await request(makeApp())
      .post('/auth/ldap/login')
      .set('X-Tenant-ID', String(OTHER_TENANT))
      .send({ username: 'boss', password: 'secret' });
    expect(response.status).toBe(403);
    spy.mockRestore();
  });
});

describe('admin SSO settings', () => {
  it('never returns the secrets', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    const response = await request(makeApp()).get('/settings/sso').set('Authorization', `Bearer ${adminToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ azureClientId: 'azure-client', azureClientSecret: '••••••••', ldapBindPassword: '••••••••', googleClientSecret: '' });
    expect(JSON.stringify(response.body)).not.toContain('azure-secret');
    expect(response.body.data.redirectUris.azure).toMatch(/\/auth\/callback\/azure$/);
  });

  it('keeps a secret sent back masked and invalidates the cache', async () => {
    mockDb({ [OTHER_TENANT]: ssoRow() });
    await SsoConfigService.get(OTHER_TENANT); // cached
    const response = await request(makeApp())
      .put('/settings/sso')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ azureEnabled: true, azureClientId: 'new-client', azureClientSecret: '••••••••' });
    expect(response.status).toBe(200);
    const [, params] = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('UPDATE tenant_sso_settings'));
    expect(params).toMatchObject({ azureClientId: 'new-client', azureClientSecret: 'azure-secret', ldapBindPassword: 'ldap-secret' });
    mockDb({ [OTHER_TENANT]: ssoRow({ azure_client_id: 'new-client' }) });
    expect((await SsoConfigService.get(OTHER_TENANT)).azure?.clientId).toBe('new-client');
  });

  it('refuses to enable an incomplete provider', async () => {
    mockDb({});
    const response = await request(makeApp())
      .put('/settings/sso')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ googleEnabled: true, googleClientId: 'only-the-id' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SSO_INCOMPLETE');
  });

  it('rejects an LDAP filter without {{username}}', async () => {
    mockDb({});
    const response = await request(makeApp())
      .put('/settings/sso')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ldapSearchFilter: '(uid=*)' });
    expect(response.status).toBe(400);
  });
});
