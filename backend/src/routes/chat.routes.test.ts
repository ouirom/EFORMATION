import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import chatRoutes from './chat.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/chat', chatRoutes);
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

describe('POST /chat/conversations/:id/messages -- replies', () => {
  it('sends a reply and returns it with a replyTo preview', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('SELECT id FROM chat_messages WHERE id = @replyToMessageId')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('INSERT INTO chat_messages')) return Promise.resolve([{ id: 42 }]);
      if (query.includes('LEFT JOIN chat_messages rt')) {
        return Promise.resolve([{
          id: 42, conversation_id: 1, sender_id: 3, body: 'Oui, exactement.', reply_to_message_id: 5,
          sender_name: 'Agent', sender_email: 'agent@test.com',
          reply_to_id: 5, reply_to_body: 'Est-ce que la formation est terminée ?',
          reply_to_deleted_at: null, reply_to_sender_name: 'Director',
        }]);
      }
      if (query.startsWith('SELECT ca.id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Oui, exactement.', replyToMessageId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.data.replyTo).toMatchObject({
      id: 5, body: 'Est-ce que la formation est terminée ?', senderName: 'Director', deleted: false,
    });
    expect(response.body.data.reply_to_id).toBeUndefined();
    const insertCall = mockedQuery.mock.calls.find(([q]: [string]) => q.startsWith('INSERT INTO chat_messages'));
    expect(insertCall[1]).toMatchObject({ replyToMessageId: 5 });
  });

  it('rejects a reply to a message from a different conversation', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('SELECT id FROM chat_messages WHERE id = @replyToMessageId')) return Promise.resolve([]); // not in this conversation
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Bonjour', replyToMessageId: 999 });

    expect(response.status).toBe(400);
  });

  it('shows a placeholder replyTo when the original message was soft-deleted', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('SELECT id FROM chat_messages WHERE id = @replyToMessageId')) return Promise.resolve([{ id: 5 }]);
      if (query.startsWith('INSERT INTO chat_messages')) return Promise.resolve([{ id: 43 }]);
      if (query.includes('LEFT JOIN chat_messages rt')) {
        return Promise.resolve([{
          id: 43, conversation_id: 1, sender_id: 3, body: 'Toujours valable ?', reply_to_message_id: 5,
          sender_name: 'Agent', sender_email: 'agent@test.com',
          reply_to_id: 5, reply_to_body: 'Message original supprimé entre-temps',
          reply_to_deleted_at: '2026-08-20T10:00:00Z', reply_to_sender_name: 'Director',
        }]);
      }
      if (query.startsWith('SELECT ca.id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Toujours valable ?', replyToMessageId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.data.replyTo).toMatchObject({ id: 5, body: null, deleted: true });
  });
});

describe('GET /chat/conversations/:id/messages -- replies', () => {
  it('includes a replyTo preview for messages that are replies', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('SELECT COUNT(*) as total FROM chat_messages')) return Promise.resolve([{ total: 1 }]);
      if (query.includes('LEFT JOIN chat_messages rt')) {
        return Promise.resolve([{
          id: 42, conversation_id: 1, sender_id: 3, body: 'Oui, exactement.', reply_to_message_id: 5,
          sender_name: 'Agent', sender_email: 'agent@test.com',
          reply_to_id: 5, reply_to_body: 'Est-ce que la formation est terminée ?',
          reply_to_deleted_at: null, reply_to_sender_name: 'Director',
        }]);
      }
      if (query.startsWith('SELECT ca.id')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].replyTo).toMatchObject({ id: 5, senderName: 'Director' });
  });
});

describe('DELETE /chat/messages/:id', () => {
  it('lets the sender delete their own message', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT * FROM chat_messages WHERE id = @messageId AND sender_id')) {
        return Promise.resolve([{ id: 42, sender_id: 3 }]);
      }
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/chat/messages/42')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    const updateCall = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('UPDATE chat_messages SET deleted_at'));
    expect(updateCall[1]).toMatchObject({ messageId: 42 });
  });

  it('refuses to delete a message sent by someone else', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.startsWith('SELECT * FROM chat_messages WHERE id = @messageId AND sender_id')) {
        return Promise.resolve([]); // no row matches sender_id = current user
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/chat/messages/99')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });
});

// Regression coverage: both attachment queries used to expose chat_attachments'
// own join-row id (ca.id) as the attachment's "id", instead of file_assets' id
// (f.id) -- the id the frontend actually needs to stream/download the file via
// POST /files/:id/stream-token. Since both tables auto-increment from 1, this
// silently pointed at a same-numbered but unrelated file (or 404'd) rather than
// throwing, so it never surfaced until download was actually wired up.
describe('chat_attachments expose the underlying file_assets id, not their own', () => {
  it('on GET /chat/conversations/:id/messages', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('SELECT COUNT(*) as total FROM chat_messages')) return Promise.resolve([{ total: 1 }]);
      if (query.includes('LEFT JOIN chat_messages rt')) {
        return Promise.resolve([{ id: 42, conversation_id: 1, sender_id: 3, body: null, sender_name: 'Agent', sender_email: 'agent@test.com' }]);
      }
      if (query.includes('FROM chat_attachments ca') && query.includes('JOIN file_assets f')) {
        // ca.id (the join row) is 999, deliberately different from f.id (7) --
        // the response must carry file_assets' id, never the join row's.
        return Promise.resolve([{ id: 7, filename: 'plan.pdf', mime_type: 'application/pdf', storage_key: 'chat/plan.pdf', size_bytes: 2048 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].attachments[0].id).toBe(7);
  });

  it('on the POST /chat/conversations/:id/messages response', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      if (query.startsWith('INSERT INTO chat_messages')) return Promise.resolve([{ id: 50 }]);
      if (query.includes('LEFT JOIN chat_messages rt')) {
        return Promise.resolve([{ id: 50, conversation_id: 1, sender_id: 3, body: null, sender_name: 'Agent', sender_email: 'agent@test.com' }]);
      }
      if (query.includes('FROM chat_attachments ca') && query.includes('JOIN file_assets f')) {
        return Promise.resolve([{ id: 7, filename: 'plan.pdf', mime_type: 'application/pdf', storage_key: 'chat/plan.pdf', size_bytes: 2048 }]);
      }
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/chat/conversations/1/messages')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ attachmentIds: [3] });

    expect(response.status).toBe(201);
    expect(response.body.data.attachments[0].id).toBe(7);
  });
});

// Regression coverage: /chat/:id URLs used to leak the sequential internal
// conversation id in clear, letting anyone type/increment their way into a
// conversation they don't belong to. The server already returned 403 for a
// non-participant either way, but the id is now an opaque public_id UUID too
// (mirroring courses/lessons), and GET /conversations/:id -- previously unused
// by the frontend -- is the entry point that resolves it and enforces access.
describe('GET /chat/conversations/:id -- public_id resolution and access control', () => {
  it('resolves a public_id UUID to the conversation for a participant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_conversations WHERE public_id')) return Promise.resolve([{ id: 1 }]);
      if (query.includes('FROM chat_participants WHERE conversation_id') && query.includes('user_id')) {
        return Promise.resolve([{ conversation_id: 1, user_id: 3 }]);
      }
      if (query.startsWith('SELECT * FROM chat_conversations WHERE id')) {
        return Promise.resolve([{ id: 1, public_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', scope: 'direct', title: null }]);
      }
      if (query.includes('FROM chat_participants cp')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/chat/conversations/3fa85f64-5717-4562-b3fc-2c963f66afa6')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(1);
  });

  it('returns 403 for a conversation the user is not a participant of, instead of silently returning empty data', async () => {
    mockedQuery.mockImplementation((query: string) => {
      if (query.includes('FROM users WHERE id = @id')) return Promise.resolve([mockAuthLookup()]);
      if (query.includes('FROM chat_participants WHERE conversation_id')) return Promise.resolve([]); // not a participant
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/chat/conversations/6')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });
});
