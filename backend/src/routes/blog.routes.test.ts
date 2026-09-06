import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import blogRoutes from './blog.routes';
import { DatabaseService } from '../services/database.service';
import { errorHandler } from '../middleware/error.middleware';
import { config } from '../config';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/blog', blogRoutes);
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
const managerToken = tokenFor({ id: 4, tenantId: 10, email: 'manager@test.com', role: 'manager' });
const superAdminToken = tokenFor({ id: 5, tenantId: 10, email: 'super@test.com', role: 'super_admin' });

const authBranch = (role: string) => (query: string) =>
  query.includes('FROM users WHERE id = @id') ? Promise.resolve([mockAuthLookup({ role })]) : undefined;

describe('GET /blog/posts', () => {
  it('an agent only sees published posts, and the count query applies the same filter', () => {
    let countQuery = '';
    mockedQuery.mockImplementation((query: string, params: any) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT COUNT(*)')) {
        countQuery = query;
        expect(params.pubStatus).toBe('published');
        return Promise.resolve([{ total: 1 }]);
      }
      if (query.includes('FROM blog_posts bp')) {
        expect(query).toContain("bp.status = @pubStatus");
        return Promise.resolve([{ id: 1, title: 'Published post', status: 'published' }]);
      }
      if (query.includes('JOIN blog_post_tags')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    return request(makeApp())
      .get('/blog/posts')
      .set('Authorization', `Bearer ${agentToken}`)
      .then((response) => {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(countQuery).toContain('bp.status = @pubStatus');
      });
  });

  it('a super_admin can see draft posts too (not excluded by a hardcoded role list)', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('super_admin')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT COUNT(*)')) return Promise.resolve([{ total: 2 }]);
      if (query.includes('FROM blog_posts bp')) {
        expect(query).not.toContain('bp.status = @pubStatus');
        return Promise.resolve([
          { id: 1, title: 'Draft', status: 'draft' },
          { id: 2, title: 'Published', status: 'published' },
        ]);
      }
      if (query.includes('JOIN blog_post_tags')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/blog/posts')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it('applies the categoryId filter to both the count and the page query', async () => {
    mockedQuery.mockImplementation((query: string, params: any) => {
      const auth = authBranch('manager')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT COUNT(*)')) {
        expect(query).toContain('bp.category_id = @categoryId');
        expect(params.categoryId).toBe(7);
        return Promise.resolve([{ total: 0 }]);
      }
      if (query.includes('FROM blog_posts bp')) {
        expect(query).toContain('bp.category_id = @categoryId');
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/blog/posts?categoryId=7')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(0);
  });
});

describe('GET /blog/posts/:id', () => {
  it('404s when a non-manager requests a draft post directly by id', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.includes('WHERE bp.id = @postId')) {
        return Promise.resolve([{ id: 9, status: 'draft', title: 'Secret draft' }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .get('/blog/posts/9')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(404);
  });

  it('lets a manager read a draft post by id', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('manager')(query);
      if (auth) return auth;
      if (query.includes('WHERE bp.id = @postId')) {
        return Promise.resolve([{ id: 9, status: 'draft', title: 'Secret draft' }]);
      }
      if (query.includes('JOIN blog_post_tags')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .get('/blog/posts/9')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Secret draft');
  });

  it('returns a published post to anyone, and increments its view count', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.includes('WHERE bp.id = @postId')) {
        return Promise.resolve([{ id: 1, status: 'published', title: 'Public post' }]);
      }
      if (query.includes('JOIN blog_post_tags')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .get('/blog/posts/1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(200);
    const incrementCall = mockedExecute.mock.calls.find(([q]: [string]) => q.includes('view_count = view_count + 1'));
    expect(incrementCall[1]).toMatchObject({ postId: 1 });
  });
});

describe('PUT /blog/posts/:id', () => {
  it('404s instead of leaking another tenant\'s post when the id does not belong to this tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('manager')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId')) {
        return Promise.resolve([]); // belongs to another tenant
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .put('/blog/posts/999')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'Hijacked title' });

    expect(response.status).toBe(404);
    // Never reaches the UPDATE for a post outside this tenant.
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('updates a post belonging to this tenant and scopes the refetch by tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('manager')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId')) {
        return Promise.resolve([{ id: 5 }]);
      }
      if (query.startsWith('SELECT * FROM blog_posts WHERE id = @postId AND tenant_id = @tenantId')) {
        return Promise.resolve([{ id: 5, title: 'Updated title', status: 'draft' }]);
      }
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .put('/blog/posts/5')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'Updated title' });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Updated title');
  });
});

describe('POST /blog/posts/:id/comments', () => {
  it('404s when the post does not belong to the caller\'s tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_posts WHERE id = @postId')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/blog/posts/42/comments')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Nice post' });

    expect(response.status).toBe(404);
  });

  it('adds a comment to a post in the caller\'s tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_posts WHERE id = @postId')) return Promise.resolve([{ id: 1 }]);
      if (query.startsWith('INSERT INTO blog_comments') || query.includes('RETURNING id')) return Promise.resolve([{ id: 77 }]);
      if (query.includes('FROM blog_comments bc') && query.includes('WHERE bc.id = @id')) {
        return Promise.resolve([{ id: 77, body: 'Nice post', author_name: 'Agent' }]);
      }
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .post('/blog/posts/1/comments')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ body: 'Nice post' });

    expect(response.status).toBe(201);
    expect(response.body.data.body).toBe('Nice post');
  });
});

describe('DELETE /blog/comments/:id', () => {
  it('404s for a comment belonging to another tenant', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('admin')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT user_id FROM blog_comments')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/blog/comments/1')
      .set('Authorization', `Bearer ${tokenFor({ id: 6, tenantId: 10, email: 'admin@test.com', role: 'admin' })}`);

    expect(response.status).toBe(404);
  });

  it('lets a super_admin delete a comment authored by someone else', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('super_admin')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT user_id FROM blog_comments')) return Promise.resolve([{ user_id: 999 }]);
      return Promise.resolve([]);
    });
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/blog/comments/1')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
  });

  it('forbids a regular user from deleting someone else\'s comment', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('agent')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT user_id FROM blog_comments')) return Promise.resolve([{ user_id: 999 }]);
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .delete('/blog/comments/1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(response.status).toBe(403);
  });
});

describe('DELETE /blog/posts/:id', () => {
  it('deletes the post\'s tags and comments before the post itself (no FK violation)', async () => {
    mockedQuery.mockImplementation(authBranch('admin'));
    mockedExecute.mockResolvedValue(undefined);

    const response = await request(makeApp())
      .delete('/blog/posts/4')
      .set('Authorization', `Bearer ${tokenFor({ id: 6, tenantId: 10, email: 'admin@test.com', role: 'admin' })}`);

    expect(response.status).toBe(200);
    const calls = mockedExecute.mock.calls.map(([q]: [string]) => q);
    const tagsIdx = calls.findIndex((q) => q.startsWith('DELETE FROM blog_post_tags'));
    const commentsIdx = calls.findIndex((q) => q.startsWith('DELETE FROM blog_comments'));
    const postIdx = calls.findIndex((q) => q.startsWith('DELETE FROM blog_posts'));
    expect(tagsIdx).toBeGreaterThanOrEqual(0);
    expect(commentsIdx).toBeGreaterThanOrEqual(0);
    expect(postIdx).toBeGreaterThan(tagsIdx);
    expect(postIdx).toBeGreaterThan(commentsIdx);
  });
});

describe('POST /blog/categories and /blog/tags', () => {
  it('rejects a duplicate category slug', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('admin')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_categories WHERE tenant_id = @tenantId AND slug = @slug')) {
        return Promise.resolve([{ id: 1 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/blog/categories')
      .set('Authorization', `Bearer ${tokenFor({ id: 6, tenantId: 10, email: 'admin@test.com', role: 'admin' })}`)
      .send({ name: 'Développement' });

    expect(response.status).toBe(400);
  });

  it('rejects a duplicate tag slug', async () => {
    mockedQuery.mockImplementation((query: string) => {
      const auth = authBranch('manager')(query);
      if (auth) return auth;
      if (query.startsWith('SELECT id FROM blog_tags WHERE tenant_id = @tenantId AND slug = @slug')) {
        return Promise.resolve([{ id: 1 }]);
      }
      return Promise.resolve([]);
    });

    const response = await request(makeApp())
      .post('/blog/tags')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'React' });

    expect(response.status).toBe(400);
  });
});
