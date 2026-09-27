import { DatabaseService } from './database.service';
import { IS_PG } from '../database/db-helpers';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error.middleware';
import { slugify } from '../utils/slugify';

/**
 * Per-tenant course categories (see db/migrations/034_tenant_course_categories.sql).
 *
 * A category is identified by its `code`: it is what courses.category stores and it
 * never changes, so renaming a category never detaches its courses. `name` is the
 * admin-chosen label; NULL means "use the default label" -- the frontend translates
 * the built-in codes below (lib/categories.ts), so they stay bilingual until an admin
 * renames them.
 */
export const DEFAULT_CATEGORY_CODES = [
  'technology',
  'management',
  'marketing',
  'finance',
  'hr',
  'soft-skills',
  'compliance',
  'other',
] as const;

// Older rows/seed data used a short code for the same category.
const LEGACY_ALIASES: Record<string, string> = { tech: 'technology' };

export type CategoryLanguage = 'fr' | 'en';

// Default labels of the built-in codes. The frontend owns the on-screen translation
// (shared.json > courseCategories); this copy serves what the server produces or
// matches itself: search ("Technologie" -> "technology") and report exports.
// Keep in sync with frontend/src/i18n/locales/{fr,en}/shared.json.
const DEFAULT_LABELS: Record<string, { fr: string; en: string; aliases?: string[] }> = {
  technology: { fr: 'Technologie', en: 'Technology' },
  management: { fr: 'Management', en: 'Management' },
  marketing: { fr: 'Marketing', en: 'Marketing' },
  finance: { fr: 'Finance', en: 'Finance' },
  hr: { fr: 'Ressources humaines', en: 'Human resources', aliases: ['RH', 'HR'] },
  'soft-skills': { fr: 'Soft skills', en: 'Soft skills' },
  compliance: { fr: 'Conformité', en: 'Compliance' },
  other: { fr: 'Autre', en: 'Other' },
};

/** Case- and accent-insensitive form used to compare labels with a search term. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MAX_CODE_LENGTH = 50; // courses.category is VARCHAR(50)

export interface CourseCategory {
  code: string;
  name: string | null;
  isDefault: boolean;
  courseCount: number;
}

function isDefaultCode(code: string): boolean {
  return (DEFAULT_CATEGORY_CODES as readonly string[]).includes(code);
}

export class CategoryService {
  static async list(tenantId: number): Promise<CourseCategory[]> {
    const rows = await DatabaseService.query<{ id: number; code: string; name: string | null; course_count: number }>(
      `SELECT c.id, c.code, c.name,
              (SELECT COUNT(*) FROM courses co
               WHERE co.tenant_id = c.tenant_id AND co.category = c.code AND co.deleted_at IS NULL) as course_count
       FROM categories c
       WHERE c.tenant_id = @tenantId
       ORDER BY c.id`,
      { tenantId }
    );

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      isDefault: isDefaultCode(r.code),
      courseCount: Number(r.course_count) || 0,
    }));
  }

  /**
   * Codes of the tenant's categories whose label contains `term` -- the admin's
   * name if set, otherwise the built-in label in any language -- so a search for
   * "technologie" or a renamed "Personnel" finds courses stored under their code.
   */
  static async codesMatching(tenantId: number, term: string): Promise<string[]> {
    const needle = fold(term.trim());
    if (!needle) return [];
    return (await this.list(tenantId))
      .filter((c) => {
        const defaults = DEFAULT_LABELS[c.code];
        const labels = c.name
          ? [c.name]
          : defaults ? [defaults.fr, defaults.en, ...(defaults.aliases ?? [])] : [c.code];
        return labels.some((label) => fold(label).includes(needle));
      })
      .map((c) => c.code);
  }

  /**
   * Code -> display label for the tenant, in `language` (admin name first, then the
   * built-in label, then the raw code) -- for output the server renders itself, such
   * as report exports. Mirrors the frontend's useCategoryLabel().
   */
  static async labels(tenantId: number, language: CategoryLanguage = 'fr'): Promise<Map<string, string>> {
    return new Map(
      (await this.list(tenantId)).map((c) => [c.code, c.name ?? DEFAULT_LABELS[c.code]?.[language] ?? c.code])
    );
  }

  /** Inserts the built-in categories a tenant doesn't have yet (new tenants, re-runs). */
  static async seedDefaults(tenantId: number): Promise<void> {
    const existing = await DatabaseService.query<{ code: string }>(
      'SELECT code FROM categories WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const have = new Set(existing.map((r) => r.code));
    for (const code of DEFAULT_CATEGORY_CODES) {
      if (!have.has(code)) {
        await DatabaseService.execute(
          'INSERT INTO categories (tenant_id, code, name) VALUES (@tenantId, @code, NULL)',
          { tenantId, code }
        );
      }
    }
  }

  static async create(tenantId: number, rawName: string): Promise<CourseCategory> {
    const name = rawName.trim();
    const base = slugify(name).slice(0, MAX_CODE_LENGTH) || 'category';
    await this.assertNameAvailable(tenantId, name);

    // Derive a unique code from the name: "securite", then "securite-2", ...
    const taken = new Set(
      (await DatabaseService.query<{ code: string }>(
        'SELECT code FROM categories WHERE tenant_id = @tenantId',
        { tenantId }
      )).map((r) => r.code)
    );
    let code = base;
    for (let i = 2; taken.has(code); i++) {
      const suffix = `-${i}`;
      code = base.slice(0, MAX_CODE_LENGTH - suffix.length) + suffix;
    }

    await DatabaseService.query<{ id: number }>(
      IS_PG
        ? 'INSERT INTO categories (tenant_id, code, name) VALUES (@tenantId, @code, @name) RETURNING id'
        : 'INSERT INTO categories (tenant_id, code, name) OUTPUT INSERTED.id VALUES (@tenantId, @code, @name)',
      { tenantId, code, name }
    );

    return { code, name, isDefault: isDefaultCode(code), courseCount: 0 };
  }

  /**
   * Renames a category. An empty name restores the default (translated) label --
   * only possible for a built-in category, since a custom one has no other label.
   */
  static async rename(tenantId: number, code: string, rawName: string | null): Promise<CourseCategory> {
    const category = await this.get(tenantId, code);
    const name = rawName?.trim() || null;

    if (name === null && !category.isDefault) {
      throw BadRequestError('A custom category needs a name', 'CATEGORY_NAME_REQUIRED');
    }
    if (name !== null) await this.assertNameAvailable(tenantId, name, code);

    await DatabaseService.execute(
      'UPDATE categories SET name = @name WHERE tenant_id = @tenantId AND code = @code',
      { tenantId, code, name }
    );
    return { ...category, name };
  }

  /** Refuses to delete a category still used by a course, so no course is left pointing at nothing. */
  static async remove(tenantId: number, code: string): Promise<void> {
    const category = await this.get(tenantId, code);
    if (category.courseCount > 0) {
      throw ConflictError(
        `This category is still used by ${category.courseCount} course(s)`,
        'CATEGORY_IN_USE'
      );
    }
    await DatabaseService.execute(
      'DELETE FROM categories WHERE tenant_id = @tenantId AND code = @code',
      { tenantId, code }
    );
  }

  /**
   * Validates the category given for a course create/update/import and returns the
   * code to store: null/empty clears it, a legacy alias is normalized, and an unknown
   * code is rejected instead of silently creating an orphan value.
   */
  static async resolveForCourse(tenantId: number, value?: string | null): Promise<string | null> {
    const raw = value?.trim();
    if (!raw) return null;
    const code = LEGACY_ALIASES[raw.toLowerCase()] ?? raw;

    const rows = await DatabaseService.query<{ code: string }>(
      `SELECT code FROM categories
       WHERE tenant_id = @tenantId AND (code = @code OR LOWER(name) = LOWER(@code))`,
      { tenantId, code }
    );
    if (rows.length === 0) {
      throw BadRequestError(`Unknown course category "${raw}"`, 'UNKNOWN_CATEGORY');
    }
    return rows[0].code;
  }

  private static async get(tenantId: number, code: string): Promise<CourseCategory> {
    const category = (await this.list(tenantId)).find((c) => c.code === code);
    if (!category) throw NotFoundError('Category');
    return category;
  }

  private static async assertNameAvailable(tenantId: number, name: string, exceptCode?: string): Promise<void> {
    const rows = await DatabaseService.query<{ code: string }>(
      `SELECT code FROM categories WHERE tenant_id = @tenantId AND LOWER(name) = LOWER(@name)`,
      { tenantId, name }
    );
    if (rows.some((r) => r.code !== exceptCode)) {
      throw ConflictError('A category with this name already exists', 'CATEGORY_EXISTS');
    }
  }
}
