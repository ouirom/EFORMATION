import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import aiRoutes from './ai.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

// AIService is NOT mocked here -- this exercises the real askTutor() fallback
// logic (no OpenAI key configured in the test env, same as the real backend/.env
// today) to prove app-usage questions get a real answer instead of the old
// blanket "AI unavailable" message.
jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiRoutes);
  app.use(errorHandler);
  return app;
}

function mockAuthLookup(role: string) {
  return {
    id: 1,
    tenant_id: 10,
    email: 'learner@test.com',
    display_name: 'Learner',
    avatar_url: null,
    role,
    enterprise_id: null,
    direction_id: null,
    service_id: null,
    is_active: true,
  };
}

function tokenFor(role: string) {
  return jwt.sign({ id: 1, tenantId: 10, email: 'learner@test.com', role }, config.jwt.secret);
}

beforeEach(() => {
  mockedExecute.mockResolvedValue({ rowsAffected: 1 });
});

describe('POST /ai/tutor/ask (no AI provider configured)', () => {
  it('answers an app-usage question via the keyword-matched guide instead of a generic unavailable message', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'Comment rejoindre une session live ?' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toContain('Sessions live');
    expect(response.body.data.answer.toLowerCase()).toContain('rejoindre');
    expect(response.body.data.answer).not.toContain('unavailable');
  });

  it('hides admin-only topics from a plain learner role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'Comment importer des utilisateurs en masse ?' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).not.toContain('Utilisateurs (administration)');
  });

  it('answers the same admin-only question for an admin role', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('admin')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ question: 'Comment importer des utilisateurs en masse ?' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toContain('Utilisateurs (administration)');
  });

  it('falls back to a clear "not configured" message when nothing matches', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'xyzzy qwerty unrelated gibberish 12345' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toMatch(/pas configur|reformuler/i);
  });

  it('answers in English when language=en is requested, even for a French question', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'Comment rejoindre une session live ?', language: 'en' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toContain('Live sessions');
    expect(response.body.data.answer.toLowerCase()).toContain('join');
  });

  it('rejects an unsupported language code', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'Comment rejoindre une session live ?', language: 'de' });

    expect(response.status).toBe(400);
  });

  it('falls back to the "not configured" message in English when nothing matches and language=en', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup('agent')]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/ai/tutor/ask')
      .set('Authorization', `Bearer ${tokenFor('agent')}`)
      .send({ question: 'xyzzy qwerty unrelated gibberish 12345', language: 'en' });

    expect(response.status).toBe(200);
    expect(response.body.data.answer).toMatch(/not configured|rephrasing/i);
  });
});
