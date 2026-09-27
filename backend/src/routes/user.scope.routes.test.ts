import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import userRoutes from './user.routes';
import { DatabaseService } from '../services/database.service';
import { NotificationService } from '../services/notification.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');
jest.mock('../services/notification.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;
const mockedSend = NotificationService.send as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(user: Record<string, any>) {
  return jwt.sign(user, config.jwt.secret);
}

const directorPayload = { id: 1, tenantId: 10, email: 'director@test.com', role: 'director', directionId: 5 };
const directorToken = tokenFor(directorPayload);

function mockAuthLookup(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1, tenant_id: 10, email: 'director@test.com', display_name: 'Director',
    avatar_url: null, role: 'director', enterprise_id: null, direction_id: 5, service_id: null, is_active: true,
    ...overrides,
  };
}

// POST /users sends a best-effort welcome email; the auto-mock otherwise
// returns undefined, and calling .catch() on that throws synchronously.
beforeEach(() => {
  mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
});

describe('GET /users list scoping', () => {
  it('excludes peers/superiors from the WHERE clause a director-scoped query builds', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('SELECT COUNT(*) as total')) return Promise.resolve([{ total: 0 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users').set('Authorization', `Bearer ${directorToken}`);

    expect(response.status).toBe(200);
    const [, countParams] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('SELECT COUNT(*) as total'));
    expect(countParams.requesterLevel).toBe(4); // director's own level — only rows below it match
    expect(countParams.userDirectionId).toBe(5);
  });
});

describe('GET /users/:id scoping', () => {
  it('allows a director to view a subordinate (manager) in their own direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 42, email: 'manager@test.com', role: 'manager', direction_id: 5, service_id: 7, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/42').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(200);
  });

  it('blocks a director from viewing a peer (another director) even in the same direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 43, email: 'other-director@test.com', role: 'director', direction_id: 5, service_id: null, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/43').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(403);
  });

  it('blocks a director from viewing a subordinate outside their direction', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{
          id: 44, email: 'other-manager@test.com', role: 'manager', direction_id: 99, service_id: 7, tenant_id: 10,
        }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/44').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(403);
  });

  it('always allows a user to view their own record', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([mockAuthLookup()]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/1').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(200);
  });

  it('lets an admin view anyone regardless of scope', async () => {
    const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{ id: 44, email: 'x@test.com', role: 'director', direction_id: 99, service_id: null, tenant_id: 10 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/44').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
  });

  it('allows a supervisor to view an agent explicitly assigned to them', async () => {
    const supervisorToken = tokenFor({ id: 17, tenantId: 10, email: 'supervisor@test.com', role: 'supervisor', serviceId: 5 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 17, email: 'supervisor@test.com', role: 'supervisor', direction_id: null, service_id: 5 })]);
      }
      if (query.includes('WHERE u.id = @userId')) {
        return Promise.resolve([{ id: 3, email: 'agent@test.com', role: 'agent', direction_id: null, service_id: 5, supervisor_id: 17, tenant_id: 10 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/3').set('Authorization', `Bearer ${supervisorToken}`);
    expect(response.status).toBe(200);
  });

  it('blocks a supervisor from viewing an agent in the same service who is not assigned to them', async () => {
    const supervisorToken = tokenFor({ id: 17, tenantId: 10, email: 'supervisor@test.com', role: 'supervisor', serviceId: 5 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 17, email: 'supervisor@test.com', role: 'supervisor', direction_id: null, service_id: 5 })]);
      }
      if (query.includes('WHERE u.id = @userId')) {
        // Same service, but assigned to a different supervisor (id 99)
        return Promise.resolve([{ id: 3, email: 'agent@test.com', role: 'agent', direction_id: null, service_id: 5, supervisor_id: 99, tenant_id: 10 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp()).get('/users/3').set('Authorization', `Bearer ${supervisorToken}`);
    expect(response.status).toBe(403);
  });
});

describe('POST /users externe/stagiaire roles', () => {
  const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });

  it.each(['externe', 'stagiaire'])('creates a user with role "%s"', async (role) => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 101 }]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([{ id: 101, role }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `new-${role}@test.com`, password: 'password123', displayName: `New ${role}`, role });

    expect(response.status).toBe(201);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.objectContaining({ role })
    );
  });

  it('lets a supervisor be assigned to an externe user, same as an agent', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id, role FROM users WHERE id = @supervisorId')) {
        return Promise.resolve([{ id: 17, role: 'supervisor' }]);
      }
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 102 }]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([{ id: 102 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new-externe@test.com', password: 'password123', displayName: 'New Externe', role: 'externe', supervisorId: 17 });

    expect(response.status).toBe(201);
  });
});

describe('POST /users duplicate email handling', () => {
  const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });

  it('rejects an email already used in a different tenant with a clean 409', async () => {
    // users.email is a GLOBAL unique constraint, not scoped per tenant -- the
    // duplicate check must catch a cross-tenant collision too, or it falls
    // through to an unhandled constraint violation on the INSERT.
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([{ id: 999 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'taken@test.com', password: 'password123', displayName: 'Dup', role: 'agent' });

    expect(response.status).toBe(409);
    const emailCheckCall = mockedQuery.mock.calls.find(([q]: [string]) =>
      q.includes('SELECT id FROM users WHERE email')
    );
    expect(emailCheckCall[0]).not.toContain('tenant_id');
    expect(emailCheckCall[0]).toContain('deleted_at IS NULL');
  });

  it('allows reusing the email of a soft-deleted account', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      // deleted_at IS NULL is part of the query text, so the mock simply returns
      // no rows -- exercising the real SQL text is covered by the assertion above.
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 103 }]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([{ id: 103 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'freed-up@test.com', password: 'password123', displayName: 'Reused Email', role: 'agent' });

    expect(response.status).toBe(201);
  });
});

describe('POST /users supervisorId assignment', () => {
  const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });

  it('creates a user with a valid supervisor (higher role level)', async () => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id, role FROM users WHERE id = @supervisorId')) {
        return Promise.resolve([{ id: 17, role: 'supervisor' }]);
      }
      if (query.includes('INSERT INTO users')) return Promise.resolve([{ id: 100 }]);
      if (query.includes('WHERE u.id = @userId')) return Promise.resolve([{ id: 100 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new-agent@test.com', password: 'password123', displayName: 'New Agent', role: 'agent', supervisorId: 17 });

    expect(response.status).toBe(201);
  });

  it('rejects a supervisorId that has the same or lower role level than the assigned user', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id, role FROM users WHERE id = @supervisorId')) {
        return Promise.resolve([{ id: 3, role: 'agent' }]); // same level as the new agent
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new-agent2@test.com', password: 'password123', displayName: 'New Agent 2', role: 'agent', supervisorId: 3 });

    expect(response.status).toBe(400);
  });

  it('rejects a supervisorId that does not exist', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id FROM users WHERE email')) return Promise.resolve([]);
      if (query.includes('SELECT id, role FROM users WHERE id = @supervisorId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new-agent3@test.com', password: 'password123', displayName: 'New Agent 3', role: 'agent', supervisorId: 999 });

    expect(response.status).toBe(400);
  });
});

describe('PUT /users/:id supervisorId assignment', () => {
  it('lets an admin assign a direct supervisor to another user', async () => {
    const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id, role FROM users WHERE id = @supervisorId')) {
        return Promise.resolve([{ id: 17, role: 'supervisor' }]);
      }
      if (query.includes('SELECT role FROM users WHERE id = @userId')) {
        return Promise.resolve([{ role: 'agent' }]);
      }
      if (query.includes('SELECT u.id')) return Promise.resolve([{ id: 3 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supervisorId: 17 });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('supervisor_id = @supervisorId'),
      expect.objectContaining({ supervisorId: 17 })
    );
  });

  it('does not let a user assign their own supervisor via self-edit', async () => {
    const agentToken = tokenFor({ id: 3, tenantId: 10, email: 'agent@test.com', role: 'agent' });
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 3, email: 'agent@test.com', role: 'agent', direction_id: null })]);
      }
      if (query.includes('SELECT u.id')) return Promise.resolve([{ id: 3 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ displayName: 'Me', supervisorId: 17 });

    expect(response.status).toBe(200);
    if (mockedExecute.mock.calls.length > 0) {
      const [, params] = mockedExecute.mock.calls[0];
      expect(params.supervisorId).toBeUndefined();
    }
  });
});

describe('PUT /users/:id/status', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValue({ rowsAffected: 1 });
    mockedSend.mockResolvedValue({ id: 1, status: 'sent', channel: 'email' });
  });

  it('lets an admin activate a pending user', async () => {
    const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      if (query.includes('SELECT id, role, direction_id, service_id, supervisor_id, status')) {
        return Promise.resolve([{ id: 3, role: 'agent', direction_id: null, service_id: null, supervisor_id: null, status: 'pending', display_name: 'New Agent', email: 'agent@test.com' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(200);
    expect(mockedExecute).toHaveBeenCalledWith(
      expect.stringContaining('status = @status'),
      expect.objectContaining({ status: 'active', isActive: true, userId: 3 })
    );
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, subject: expect.stringContaining('activé') }));
  });

  it("lets a supervisor activate their own assigned agent's pending account", async () => {
    const supervisorToken = tokenFor({ id: 17, tenantId: 10, email: 'supervisor@test.com', role: 'supervisor', serviceId: 5 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 17, email: 'supervisor@test.com', role: 'supervisor', direction_id: null, service_id: 5 })]);
      }
      if (query.includes('SELECT id, role, direction_id, service_id, supervisor_id, status')) {
        return Promise.resolve([{ id: 3, role: 'agent', direction_id: null, service_id: 5, supervisor_id: 17, status: 'pending', display_name: 'Agent', email: 'agent@test.com' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3/status')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(200);
  });

  it('blocks a supervisor from activating an agent not assigned to them', async () => {
    const supervisorToken = tokenFor({ id: 17, tenantId: 10, email: 'supervisor@test.com', role: 'supervisor', serviceId: 5 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 17, email: 'supervisor@test.com', role: 'supervisor', direction_id: null, service_id: 5 })]);
      }
      if (query.includes('SELECT id, role, direction_id, service_id, supervisor_id, status')) {
        return Promise.resolve([{ id: 3, role: 'agent', direction_id: null, service_id: 5, supervisor_id: 99, status: 'pending', display_name: 'Agent', email: 'agent@test.com' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3/status')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(403);
  });

  it('rejects an invalid status value', async () => {
    const adminToken = tokenFor({ id: 2, tenantId: 10, email: 'admin@test.com', role: 'admin' });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'admin@test.com', role: 'admin', direction_id: null })]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'bogus' });

    expect(response.status).toBe(400);
  });

  it('blocks a manager from changing the status of a user outside their service', async () => {
    const managerToken = tokenFor({ id: 2, tenantId: 10, email: 'manager@test.com', role: 'manager', serviceId: 5 });
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) {
        return Promise.resolve([mockAuthLookup({ id: 2, email: 'manager@test.com', role: 'manager', direction_id: null, service_id: 5 })]);
      }
      if (query.includes('SELECT id, role, direction_id, service_id, supervisor_id, status')) {
        return Promise.resolve([{ id: 3, role: 'agent', direction_id: null, service_id: 99, supervisor_id: null, status: 'pending', display_name: 'Agent', email: 'agent@test.com' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/users/3/status')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(403);
  });
});

describe('GET /users/:id/{badges,certificates,progress} scoping', () => {
  const agentToken = tokenFor({ id: 9, tenantId: 10, email: 'agent@test.com', role: 'agent' });

  function mockTarget(target: Record<string, any> | null, requester = mockAuthLookup()) {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([requester]);
      if (query.includes('SELECT role, direction_id, service_id, supervisor_id FROM users')) {
        return Promise.resolve(target ? [target] : []);
      }
      return Promise.resolve([]);
    });
  }

  it.each(['badges', 'certificates', 'progress'])('blocks an agent from reading another user\'s %s', async (resource) => {
    mockTarget({ role: 'agent', direction_id: null, service_id: null, supervisor_id: null },
      mockAuthLookup({ id: 9, role: 'agent', direction_id: null }));

    const response = await request(makeApp()).get(`/users/42/${resource}`).set('Authorization', `Bearer ${agentToken}`);
    expect(response.status).toBe(403);
  });

  it('lets a user read their own badges via "me" without a target lookup', async () => {
    mockTarget(null, mockAuthLookup({ id: 9, role: 'agent', direction_id: null }));

    const response = await request(makeApp()).get('/users/me/badges').set('Authorization', `Bearer ${agentToken}`);
    expect(response.status).toBe(200);
    const [, params] = mockedQuery.mock.calls.find(([q]: [string]) => q.includes('FROM user_badges'));
    expect(params.userId).toBe(9);
  });

  it('lets a director read the progress of a subordinate in their direction', async () => {
    mockTarget({ role: 'agent', direction_id: 5, service_id: 7, supervisor_id: null });

    const response = await request(makeApp()).get('/users/42/progress').set('Authorization', `Bearer ${directorToken}`);
    expect(response.status).toBe(200);
  });

  it('returns 404 for an unknown or non-numeric user id', async () => {
    mockTarget(null);

    expect((await request(makeApp()).get('/users/999/badges').set('Authorization', `Bearer ${directorToken}`)).status).toBe(404);
    expect((await request(makeApp()).get('/users/abc/badges').set('Authorization', `Bearer ${directorToken}`)).status).toBe(404);
  });
});
