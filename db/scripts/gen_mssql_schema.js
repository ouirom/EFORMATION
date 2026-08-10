// Regenerates db/bci_lms_schema_sqlserver.sql from the JSON dumps produced by
// dump_mssql_schema.js -- so the committed SQL Server schema file matches the live
// database exactly (see [[schema_drift_course_assignments]]: the old hand-written file
// was missing several columns/tables that exist live, e.g. courses.category/level/
// duration, badges.badge_type). This is a straight passthrough (mssql -> mssql, no type
// translation needed), unlike gen_pg_schema.js which also translates types.
//
// Usage (from backend/, so the mssql driver resolves for the dump step):
//   node ../db/scripts/dump_mssql_schema.js ../db/scripts/.tmp
//   node ../db/scripts/gen_mssql_schema.js ../db/scripts/.tmp
const fs = require('fs');
const path = require('path');

const dumpDir = process.argv[2] || path.join(__dirname, '.tmp');

const cols = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_columns.json'), 'utf8'));
const pks = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_pks.json'), 'utf8'));
const fks = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_fks.json'), 'utf8'));
const uqs = JSON.parse(fs.readFileSync(path.join(dumpDir, 'mssql_uqs.json'), 'utf8'));

function formatType(c) {
  switch (c.data_type) {
    case 'bigint': return 'BIGINT';
    case 'int': return 'INT';
    case 'smallint': return 'SMALLINT';
    case 'tinyint': return 'TINYINT';
    case 'bit': return 'BIT';
    case 'decimal':
    case 'numeric': return `DECIMAL(${c.precision},${c.scale})`;
    case 'float': return 'FLOAT';
    case 'datetime2': return 'DATETIME2(0)';
    case 'datetime': return 'DATETIME';
    case 'smalldatetime': return 'SMALLDATETIME';
    case 'date': return 'DATE';
    case 'nvarchar':
      return c.max_length === -1 ? 'NVARCHAR(MAX)' : `NVARCHAR(${c.max_length / 2})`;
    case 'varchar':
      return c.max_length === -1 ? 'VARCHAR(MAX)' : `VARCHAR(${c.max_length})`;
    case 'nchar':
      return `NCHAR(${c.max_length / 2})`;
    case 'char':
      return `CHAR(${c.max_length})`;
    case 'uniqueidentifier': return 'UNIQUEIDENTIFIER';
    default:
      throw new Error(`unmapped type ${c.data_type} on ${c.table_name}.${c.column_name}`);
  }
}

function formatDefault(d) {
  if (!d) return null;
  // sys.default_constraints wraps the expression in parens (possibly doubled); keep
  // exactly one layer since DEFAULT (...) is what CREATE TABLE expects.
  let inner = d;
  while (inner.startsWith('((') && inner.endsWith('))')) inner = inner.slice(1, -1);
  return inner;
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
out.push(`-- GENERATED FILE — full SQL Server schema dumped 1:1 from the live db_eformation`);
out.push(`-- database (sys.tables/sys.columns/sys.foreign_keys), not hand-maintained. The`);
out.push(`-- previous hand-written version of this file was missing columns/tables that exist`);
out.push(`-- live (courses.category/level/duration/category_id, badges.badge_type, etc.) --`);
out.push(`-- see the "schema drift" note in HANDOFF.md. SQL Server is currently the fallback`);
out.push(`-- DBMS (Postgres is active, see backend/.env DB_CLIENT) but this file is kept in`);
out.push(`-- sync so switching back doesn't hit undocumented-schema surprises.`);
out.push(`--`);
out.push(`-- Some tables the application code references don't exist here (or anywhere) --`);
out.push(`-- ai_usage_logs, awarded_badges, blog_categories/blog_tags/blog_post_tags/`);
out.push(`-- blog_comments, push_subscriptions, scheduled_reports, search_history,`);
out.push(`-- user_devices, user_profiles, webhooks, webhook_deliveries -- those code paths`);
out.push(`-- are already broken against the real database today; this file intentionally`);
out.push(`-- matches live reality rather than inventing tables for already-broken features.`);
out.push(`--`);
out.push(`-- Regenerate: node db/scripts/dump_mssql_schema.js <dir> && node db/scripts/gen_mssql_schema.js <dir>`);
out.push('');
out.push('USE [db_eformation];');
out.push('SET NOCOUNT ON;');
out.push('');

for (const t of tableNames) {
  const tcols = byTable[t].sort((a, b) => a.column_id - b.column_id);
  const pk = pkByTable[t] || [];
  const singleIdentityPk = pk.length === 1 && tcols.find(c => c.column_name === pk[0])?.is_identity;

  out.push(`IF OBJECT_ID(N'[dbo].[${t}]', N'U') IS NULL`);
  out.push('BEGIN');
  out.push(`CREATE TABLE dbo.${t} (`);
  const lines = [];
  for (const c of tcols) {
    let type = formatType(c);
    // Bracket-quote every column name -- a handful (e.g. api_keys.key) are T-SQL
    // reserved words and CREATE TABLE fails on them unquoted.
    let line = `  [${c.column_name}]`.padEnd(25) + ` ${type}`;
    if (singleIdentityPk && c.column_name === pk[0]) {
      line += ' IDENTITY(1,1) PRIMARY KEY';
    } else {
      line += c.is_nullable ? ' NULL' : ' NOT NULL';
      const def = formatDefault(c.default_definition);
      if (def !== null) line += ` DEFAULT ${def}`;
      if (c.check_definition) line += ` CHECK (${c.check_definition})`;
    }
    lines.push(line);
  }
  if (!singleIdentityPk && pk.length > 0) {
    lines.push(`  CONSTRAINT pk_${t} PRIMARY KEY (${pk.map(c => `[${c}]`).join(', ')})`);
  }
  out.push(lines.join(',\n'));
  out.push(');');
  out.push('END;');
  out.push('');
}

out.push('-- Unique constraints');
for (const key of Object.keys(uqByIndex).sort()) {
  const { table, cols: ucols } = uqByIndex[key];
  const idxName = key.split('::')[1];
  out.push(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${idxName}' AND object_id = OBJECT_ID(N'[dbo].[${table}]'))`);
  out.push(`  ALTER TABLE dbo.${table} ADD CONSTRAINT ${idxName} UNIQUE (${ucols.map(c => `[${c}]`).join(', ')});`);
}
out.push('');

out.push('-- Foreign keys');
const fkByName = {};
for (const f of fks) (fkByName[f.fk_name] ||= { table: f.table_name, ref: f.ref_table, cols: [], refCols: [] });
for (const f of fks) {
  fkByName[f.fk_name].cols.push(f.column_name);
  fkByName[f.fk_name].refCols.push(f.ref_column);
}
for (const name of Object.keys(fkByName).sort()) {
  const { table, ref, cols: fcols, refCols } = fkByName[name];
  out.push(`IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'${name}')`);
  out.push(`  ALTER TABLE dbo.${table} ADD CONSTRAINT ${name} FOREIGN KEY (${fcols.map(c => `[${c}]`).join(', ')}) REFERENCES dbo.${ref} (${refCols.map(c => `[${c}]`).join(', ')});`);
}
out.push('');

const outPath = path.join(__dirname, '..', 'bci_lms_schema_sqlserver.sql');
fs.writeFileSync(outPath, out.join('\n') + '\n');
console.log(`Wrote ${outPath}: ${out.length} lines, ${tableNames.length} tables.`);
