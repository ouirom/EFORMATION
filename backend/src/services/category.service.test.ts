import { CategoryService } from './category.service';
import { DatabaseService } from './database.service';

jest.mock('./database.service');

const mockedQuery = DatabaseService.query as jest.Mock;
const mockedExecute = DatabaseService.execute as jest.Mock;

type Row = { id: number; code: string; name: string | null; course_count: number };

/** In-memory stand-in for the categories table of tenant 10. */
function mockCategories(rows: Row[]) {
  mockedQuery.mockImplementation((query: string, params: any) => {
    if (query.includes('course_count')) return Promise.resolve(rows);
    if (query.includes('LOWER(name) = LOWER(@name)')) {
      return Promise.resolve(rows.filter((r) => r.name?.toLowerCase() === params.name.toLowerCase()));
    }
    if (query.includes('code = @code OR LOWER(name) = LOWER(@code)')) {
      return Promise.resolve(rows.filter((r) => r.code === params.code || r.name?.toLowerCase() === params.code.toLowerCase()));
    }
    if (query.includes('SELECT code FROM categories')) return Promise.resolve(rows);
    if (query.includes('INSERT INTO categories')) return Promise.resolve([{ id: 99 }]);
    return Promise.resolve([]);
  });
  mockedExecute.mockResolvedValue(undefined);
}

beforeEach(() => {
  mockedQuery.mockReset();
  mockedExecute.mockReset();
});

describe('CategoryService.list', () => {
  it('flags built-in codes and exposes the course count', async () => {
    mockCategories([
      { id: 1, code: 'technology', name: null, course_count: 3 },
      { id: 2, code: 'annonces', name: 'Annonces', course_count: 0 },
    ]);
    expect(await CategoryService.list(10)).toEqual([
      { code: 'technology', name: null, isDefault: true, courseCount: 3 },
      { code: 'annonces', name: 'Annonces', isDefault: false, courseCount: 0 },
    ]);
  });
});

describe('CategoryService.create', () => {
  it('derives an accent-free code from the name', async () => {
    mockCategories([]);
    const created = await CategoryService.create(10, '  Sécurité IT ');
    expect(created).toMatchObject({ code: 'securite-it', name: 'Sécurité IT', isDefault: false });
  });

  it('suffixes the code when it is already taken', async () => {
    mockCategories([{ id: 1, code: 'securite', name: 'Sécurité (ancien)', course_count: 0 }]);
    expect((await CategoryService.create(10, 'Securite')).code).toBe('securite-2');
  });

  it('rejects a name already used (case-insensitive)', async () => {
    mockCategories([{ id: 1, code: 'annonces', name: 'Annonces', course_count: 0 }]);
    await expect(CategoryService.create(10, 'annonces')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('CategoryService.rename', () => {
  it('lets a built-in category go back to its default label with an empty name', async () => {
    mockCategories([{ id: 1, code: 'hr', name: 'Personnel', course_count: 1 }]);
    const renamed = await CategoryService.rename(10, 'hr', '');
    expect(renamed.name).toBeNull();
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE categories'), expect.objectContaining({ code: 'hr', name: null }));
  });

  it('refuses an empty name for a custom category', async () => {
    mockCategories([{ id: 2, code: 'annonces', name: 'Annonces', course_count: 0 }]);
    await expect(CategoryService.rename(10, 'annonces', ' ')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s on an unknown code', async () => {
    mockCategories([]);
    await expect(CategoryService.rename(10, 'nope', 'X')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('CategoryService.remove', () => {
  it('refuses to delete a category still used by courses', async () => {
    mockCategories([{ id: 1, code: 'technology', name: null, course_count: 2 }]);
    await expect(CategoryService.remove(10, 'technology')).rejects.toMatchObject({ statusCode: 409 });
    expect(mockedExecute).not.toHaveBeenCalled();
  });

  it('deletes an unused category', async () => {
    mockCategories([{ id: 2, code: 'annonces', name: 'Annonces', course_count: 0 }]);
    await CategoryService.remove(10, 'annonces');
    expect(mockedExecute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM categories'), { tenantId: 10, code: 'annonces' });
  });
});

describe('CategoryService.resolveForCourse', () => {
  beforeEach(() => mockCategories([
    { id: 1, code: 'technology', name: null, course_count: 0 },
    { id: 2, code: 'annonces', name: 'Annonces', course_count: 0 },
  ]));

  it('returns null for an empty value (clears the category)', async () => {
    expect(await CategoryService.resolveForCourse(10, '')).toBeNull();
    expect(await CategoryService.resolveForCourse(10, undefined)).toBeNull();
  });

  it('accepts a code, a legacy alias or a label', async () => {
    expect(await CategoryService.resolveForCourse(10, 'technology')).toBe('technology');
    expect(await CategoryService.resolveForCourse(10, 'tech')).toBe('technology');
    expect(await CategoryService.resolveForCourse(10, 'ANNONCES')).toBe('annonces');
  });

  it('rejects an unknown category', async () => {
    await expect(CategoryService.resolveForCourse(10, 'astrologie')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('CategoryService.seedDefaults', () => {
  it('only inserts the built-in codes the tenant is missing', async () => {
    mockCategories([{ id: 1, code: 'technology', name: null, course_count: 0 }]);
    await CategoryService.seedDefaults(10);
    const inserted = mockedExecute.mock.calls.map(([, p]: [string, any]) => p.code);
    expect(inserted).toHaveLength(7);
    expect(inserted).not.toContain('technology');
  });
});
