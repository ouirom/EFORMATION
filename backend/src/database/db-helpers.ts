import { config } from '../config';

/** Whether DatabaseService is currently routing through the Postgres/Knex path — exported for call sites that need to branch on it directly (e.g. dialect-specific INSERT clause placement) rather than through one of the helpers below. */
export const IS_PG = config.database.client === 'pg';

export type DateAddUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

/**
 * SQL text fragments for the handful of T-SQL constructs that have no
 * portable equivalent across mssql/pg (see the DBMS-portability plan). Every
 * function here returns a plain SQL string to splice into a query built by
 * `DatabaseService.query`/`.execute` — same call pattern as today, just
 * dialect-aware instead of hardcoded to T-SQL. `OUTPUT INSERTED.id` is
 * deliberately not covered here: it belongs on the Knex query builder
 * (`.insert(data).returning('id')`) once a call site is converted, since
 * mssql/pg place that clause in different positions in the statement.
 */
export const db = {
  /** Current UTC timestamp — replaces `SYSUTCDATETIME()` / `GETUTCDATE()`. */
  now(): string {
    return IS_PG ? "(now() at time zone 'utc')" : 'SYSUTCDATETIME()';
  },

  /** Replaces `DATEADD(unit, amountExpr, dateExpr)`. `amountExpr` may be negative, a literal, or a bound param name (e.g. `-@days`). */
  dateAdd(unit: DateAddUnit, amountExpr: string, dateExpr: string): string {
    if (IS_PG) {
      return `(${dateExpr} + (${amountExpr}) * interval '1 ${unit}')`;
    }
    return `DATEADD(${unit}, ${amountExpr}, ${dateExpr})`;
  },

  /** Replaces `ORDER BY NEWID()` for a random row draw (used with `TOP`/`LIMIT`). */
  randomOrder(): string {
    return IS_PG ? 'random()' : 'NEWID()';
  },

  /** Replaces `JSON_VALUE(column, '$.path')` — `path` is the dot path without the leading `$.` (e.g. `'level'`, not `'$.level'`). */
  jsonExtract(column: string, path: string): string {
    if (IS_PG) {
      return `(${column}->>'${path}')`;
    }
    return `JSON_VALUE(${column}, '$.${path}')`;
  },

  /** Replaces `valueExpr IN (SELECT value FROM OPENJSON(column, '$.path'))` — membership test against a JSON array. */
  jsonArrayContains(column: string, path: string, valueExpr: string): string {
    if (IS_PG) {
      return `(${valueExpr}::text IN (SELECT jsonb_array_elements_text((${column}->'${path}'))))`;
    }
    return `${valueExpr} IN (SELECT value FROM OPENJSON(${column}, '$.${path}'))`;
  },

  /** Replaces `DATEDIFF(SECOND, '1970-01-01', expr)` — seconds since the Unix epoch. */
  epochSeconds(expr: string): string {
    return IS_PG ? `EXTRACT(EPOCH FROM ${expr})` : `DATEDIFF(SECOND, '1970-01-01', ${expr})`;
  },

  /** Replaces `DATEDIFF(SECOND, a, b)` — seconds elapsed from `a` to `b`. */
  diffSeconds(a: string, b: string): string {
    return IS_PG ? `EXTRACT(EPOCH FROM (${b} - ${a}))` : `DATEDIFF(SECOND, ${a}, ${b})`;
  },

  /** Replaces `DATEDIFF(day, a, b)` — whole days elapsed from `a` to `b`. */
  diffDays(a: string, b: string): string {
    return IS_PG ? `EXTRACT(DAY FROM (${b} - ${a}))` : `DATEDIFF(day, ${a}, ${b})`;
  },

  /**
   * A boolean literal for inline use in a WHERE clause or SET/VALUES list
   * (e.g. `` `is_active = ${db.bool(true)}` ``) — mssql's BIT columns accept
   * `1`/`0` directly, but pg's `boolean` type rejects integer literals
   * outright (`operator does not exist: boolean = integer`). Prefer binding
   * booleans as query params over this where the call site allows it — the
   * driver-level type binding in DatabaseService handles that case for free,
   * with no dialect branch needed; this helper is for the literal-in-text
   * cases (dynamically built WHERE/SET fragments) where a bound param isn't
   * practical.
   */
  bool(value: boolean): string {
    if (IS_PG) return value ? 'TRUE' : 'FALSE';
    return value ? '1' : '0';
  },

  /**
   * Reads a JSON/JSONB column value out of a query result row. Not a dialect
   * of SQL text like the helpers above — a driver-behavior difference found
   * empirically during the pilot conversion: node-pg deserializes jsonb
   * columns into JS objects automatically, while mssql's driver always
   * returns JSON columns (stored as NVARCHAR text, since T-SQL has no native
   * JSON type) as a raw string that the call site has to JSON.parse itself.
   * `JSON.parse(value)` alone crashes on the pg path with "[object Object]
   * is not valid JSON" once the column already comes back as an object.
   */
  parseJsonColumn<T = any>(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? JSON.parse(value) : (value as T);
  },
};
