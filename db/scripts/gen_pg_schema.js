// Regenerates db/bci_lms_schema_postgres.sql from the JSON dumps produced by
// dump_mssql_schema.js. Usage (from backend/, so the mssql driver resolves):
//   node ../db/scripts/dump_mssql_schema.js ../db/scripts/.tmp
//   node ../db/scripts/gen_pg_schema.js ../db/scripts/.tmp
const fs = require('fs');
const path = require('path');

const dumpDir = process.argv[2] || path.join(__dirname, '.tmp');

const cols = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_columns.json'), 'utf8'));
const pks = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_pks.json'), 'utf8'));
const fks = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_fks.json'), 'utf8'));
const uqs = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_uqs.json'), 'utf8'));

// Columns holding JSON text on the mssql side (confirmed via ISJSON CHECK constraints,
// plus two known JSON-holding columns that have no formal CHECK: quiz_attempts.question_ids
// and notifications.metadata). These become JSONB in Postgres so db.jsonExtract()'s `->>`
// operator and db.parseJsonColumn() work as designed.
const JSONB_COLUMNS = new Set([
  'ai_generated_contents.metadata',
  'ai_recommendations.recommendation',
  'api_keys.scopes',
  'badges.criteria',
  'courses.audience_scope',
  'courses.prerequisites',
  'learning_analytics.context',
  'notifications.payload',
  'notifications.metadata',
  'search_index.metadata',
  'quiz_attempts.question_ids',
]);

function mapType(c) {
  const key = `${c.table_name}.${c.column_name}`;
  if (JSONB_COLUMNS.has(key)) return 'JSONB';
  switch (c.data_type) {
    case 'bigint': return 'BIGINT';
    case 'int': return 'INTEGER';
    case 'smallint': return 'SMALLINT';
    case 'tinyint': return 'SMALLINT';
    case 'bit': return 'BOOLEAN';
    case 'decimal':
    case 'numeric': return `NUMERIC(${c.precision},${c.scale})`;
    case 'float': return 'DOUBLE PRECISION';
    case 'datetime2':
    case 'datetime':
    case 'smalldatetime': return 'TIMESTAMP';
    case 'date': return 'DATE';
    case 'nvarchar':
      return c.max_length === -1 ? 'TEXT' : `VARCHAR(${c.max_length / 2})`;
    case 'varchar':
      return c.max_length === -1 ? 'TEXT' : `VARCHAR(${c.max_length})`;
    case 'nchar':
      return `CHAR(${c.max_length / 2})`;
    case 'char':
      return `CHAR(${c.max_length})`;
    case 'uniqueidentifier': return 'UUID';
    default:
      throw new Error(`unmapped type ${c.data_type} on ${c.table_name}.${c.column_name}`);
  }
}

function mapDefault(c, pgType) {
  let d = c.default_definition;
  if (!d) return null;
  let inner = d;
  while (inner.startsWith('(') && inner.endsWith(')')) inner = inner.slice(1, -1);
  const lower = inner.toLowerCase();
  if (lower === 'sysutcdatetime()' || lower === 'getutcdate()' || lower === 'getdate()') {
    return `(now() at time zone 'utc')`;
  }
  if (pgType === 'BOOLEAN') return inner === '1' ? 'TRUE' : 'FALSE';
  if (inner.startsWith("N'")) return inner.slice(1);
  return inner;
}

function translateCheck(def) {
  if (/isjson/i.test(def)) return null;
  return def.replace(/\[(\w+)\]/g, '$1');
}

const byTable = {};
for (const c of cols) (byTable[c.table_name] ||= []).push(c);

const pkByTable = {};
for (const p of pks) (pkByTable[p.table_name] ||= []).push(p.column_name);

const uqByIndex = {};
for (const u of uqs) {
  const key = `${u.table_name}::${u.index_name}`;
  (uqByIndex[key] ||= { table: u.table_name, cols: [] }).cols.push(u.column_name);
}

const tableNames = Object.keys(byTable).sort();
let out = [];
out.push(`-- GENERATED FILE — full PostgreSQL schema translated 1:1 from the live SQL Server`);
out.push(`-- database (db_eformation), introspected via sys.tables/sys.columns/sys.foreign_keys`);
out.push(`-- rather than from db/bci_lms_schema_sqlserver.sql + db/migrations/*.sql, because those`);
out.push(`-- files were found to be out of sync with the real running schema (missing tables like`);
out.push(`-- course_assignments/enrollments/lesson_progress were already known; this generation`);
out.push(`-- pass additionally found the live DB itself is missing several tables the application`);
out.push(`-- code references — ai_usage_logs, awarded_badges, blog_categories/blog_tags/`);
out.push(`-- blog_post_tags/blog_comments, push_subscriptions, scheduled_reports, search_history,`);
out.push(`-- user_devices, user_profiles, webhooks, webhook_deliveries — those code paths are`);
out.push(`-- already broken against SQL Server today; this file intentionally matches the real`);
out.push(`-- mssql schema as-is rather than inventing tables for already-broken features.`);
out.push(`-- Regenerate: node db/scripts/dump_mssql_schema.js <dir> && node db/scripts/gen_pg_schema.js <dir>`);
out.push('');
out.push('BEGIN;');
out.push('');

// Pass 1: tables (no FKs yet)
for (const t of tableNames) {
  const tcols = byTable[t].sort((a, b) => a.column_id - b.column_id);
  const pk = pkByTable[t] || [];
  const singleSerialPk = pk.length === 1 && tcols.find(c => c.column_name === pk[0])?.is_identity;

  out.push(`CREATE TABLE IF NOT EXISTS ${t} (`);
  const lines = [];
  for (const c of tcols) {
    const pgType = mapType(c);
    let colType = pgType;
    if (singleSerialPk && c.column_name === pk[0]) {
      colType = 'BIGSERIAL PRIMARY KEY';
    }
    let line = `  ${c.column_name.padEnd(20)} ${colType}`;
    if (colType === pgType) {
      if (!c.is_nullable) line += ' NOT NULL';
      const def = mapDefault(c, pgType);
      if (def !== null) line += ` DEFAULT ${def}`;
    }
    if (c.check_definition) {
      const chk = translateCheck(c.check_definition);
      if (chk) line += ` CHECK (${chk})`;
    }
    lines.push(line);
  }
  if (!singleSerialPk && pk.length > 0) {
    lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
  }
  out.push(lines.join(',\n'));
  out.push(');');
  out.push('');
}

// Pass 2: unique constraints
out.push('-- Unique constraints');
for (const key of Object.keys(uqByIndex).sort()) {
  const { table, cols: ucols } = uqByIndex[key];
  const idxName = key.split('::')[1];
  out.push(`ALTER TABLE ${table} ADD CONSTRAINT ${idxName} UNIQUE (${ucols.join(', ')});`);
}
out.push('');

// Pass 3: foreign keys
out.push('-- Foreign keys');
const fkByName = {};
for (const f of fks) (fkByName[f.fk_name] ||= { table: f.table_name, ref: f.ref_table, cols: [], refCols: [] });
for (const f of fks) {
  fkByName[f.fk_name].cols.push(f.column_name);
  fkByName[f.fk_name].refCols.push(f.ref_column);
}
for (const name of Object.keys(fkByName).sort()) {
  const { table, ref, cols: fcols, refCols } = fkByName[name];
  out.push(`ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${fcols.join(', ')}) REFERENCES ${ref} (${refCols.join(', ')});`);
}
out.push('');
out.push('COMMIT;');

const outPath = path.join(__dirname, '..', 'bci_lms_schema_postgres.sql');
fs.writeFileSync(outPath, out.join('\n') + '\n');
console.log(`Wrote ${outPath}: ${out.length} lines, ${tableNames.length} tables.`);
