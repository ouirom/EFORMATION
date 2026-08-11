import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import settingsRoutes from './settings.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedListRooms = jest.fn();
jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => ({ listRooms: mockedListRooms })),
}));

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRoutes);
  app.use(errorHandler);
  return app;
}

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'admin@test.com', display_name: 'Admin',
    avatar_url: null, role: 'admin', enterprise_id: null, direction_id: null, service_id: null, is_active: true,
    ...overrides,
  };
}

const adminToken = jwt.sign({ id: 1, tenantId: 10, email: 'admin@test.com', role: 'admin' }, config.jwt.secret);

beforeEach(() => {
  mockedListRooms.mockReset();
});

describe('GET /settings/livekit', () => {
  it('returns an empty/disabled shape when no row exists yet', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM livekit_settings')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/settings/livekit').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ enabled: false, url: '', apiKey: '', apiSecret: '' });
  });

  it('masks a stored secret instead of returning it in plaintext', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM livekit_settings')) {
        return Promise.resolve([{ enabled: true, url: 'wss://real.livekit.cloud', api_key: 'realkey', api_secret: 'realsecret' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/settings/livekit').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.apiSecret).toBe('••••••••');
    expect(response.body.data.apiSecret).not.toBe('realsecret');
    expect(response.body.data.url).toBe('wss://real.livekit.cloud');
  });
});

describe('PUT /settings/livekit', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
  });

  it('inserts a new row when none exists', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, api_secret FROM livekit_settings')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/livekit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, url: 'wss://new.livekit.cloud', apiKey: 'newkey', apiSecret: 'newsecret' });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO livekit_settings'),
      expect.objectContaining({ tenantId: 10, url: 'wss://new.livekit.cloud', apiSecret: 'newsecret' })
    );
  });

  it('preserves the existing secret when the client echoes back the masked placeholder', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, api_secret FROM livekit_settings')) {
        return Promise.resolve([{ id: 5, api_secret: 'original-secret' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/livekit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, url: 'wss://updated.livekit.cloud', apiKey: 'key', apiSecret: '••••••••' });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE livekit_settings'),
      expect.objectContaining({ apiSecret: 'original-secret' })
    );
  });

  it('overwrites the secret when a genuinely new value is sent', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT id, api_secret FROM livekit_settings')) {
        return Promise.resolve([{ id: 5, api_secret: 'original-secret' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/settings/livekit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, url: 'wss://updated.livekit.cloud', apiKey: 'key', apiSecret: 'brand-new-secret' });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE livekit_settings'),
      expect.objectContaining({ apiSecret: 'brand-new-secret' })
    );
  });
});

describe('POST /settings/livekit/test', () => {
  it('succeeds when the configured credentials work', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM livekit_settings')) {
        return Promise.resolve([{ enabled: true, url: 'wss://real.livekit.cloud', api_key: 'realkey', api_secret: 'realsecret' }]);
      }
      return Promise.resolve([]);
    });
    mockedListRooms.mockResolvedValue([]);

    const response = await request(makeApp()).post('/settings/livekit/test').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });

  it('returns a clear error when the credentials are rejected', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM livekit_settings')) {
        return Promise.resolve([{ enabled: true, url: 'wss://real.livekit.cloud', api_key: 'badkey', api_secret: 'badsecret' }]);
      }
      return Promise.resolve([]);
    });
    mockedListRooms.mockRejectedValue(new Error('invalid API key'));

    const response = await request(makeApp()).post('/settings/livekit/test').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/invalid API key/);
  });
});
