import { DatabaseService } from '../services/database.service';
import { NotFoundError } from '../middleware/error.middleware';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTITY_NAMES: Record<string, string> = {
  courses: 'Course',
  lessons: 'Lesson',
  chat_conversations: 'Conversation',
};

/**
 * Resolves a course/lesson/conversation URL param to its internal numeric id --
 * the param may be either the opaque public UUID shown in the browser's address
 * bar, or a legacy plain numeric id (kept working so an old bookmarked/shared
 * URL never breaks). Only the handful of routes hit directly by a shareable
 * browser URL (GET /courses/:id, GET /courses/:id/full, GET /lessons/:id,
 * GET /modules?courseId=, GET /chat/conversations/:id) need this -- every other
 * route a page calls internally after that already has the resolved numeric id
 * from the initial fetch and doesn't need to re-resolve.
 */
export async function resolveEntityId(
  table: 'courses' | 'lessons' | 'chat_conversations',
  raw: string,
  tenantId: number
): Promise<number> {
  const entityName = ENTITY_NAMES[table];

  if (UUID_REGEX.test(raw)) {
    const rows = await DatabaseService.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE public_id = @raw AND tenant_id = @tenantId`,
      { raw, tenantId }
    );
    if (rows.length === 0) {
      throw NotFoundError(entityName);
    }
    return rows[0].id;
  }

  const numeric = parseInt(raw, 10);
  if (Number.isNaN(numeric)) {
    throw NotFoundError(entityName);
  }
  return numeric;
}
