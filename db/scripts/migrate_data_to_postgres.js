// One-time data migration: copies every row from the live SQL Server database
// into the already-schema'd Postgres database (apply bci_lms_schema_postgres.sql
// first). Run from backend/: node ../db/scripts/migrate_data_to_postgres.js
//
// Order-independent: disables FK checking for the session (session_replication_role
// = replica, superuser-only) so tables can load in any order, then restores it and
// resets every BIGSERIAL sequence to MAX(id)+1 so future app inserts don't collide
// with migrated rows.
const sql = require('mssql/msnodesqlv8');
const { Client } = require('pg');

const PG_CONN = {
  host: 'localhost',
  port: 5432,
  database: 'db_eformation',
  user: 'postgres',
  password: process.env.PG_MIGRATE_PASSWORD,
};

async function main() {
  if (!PG_CONN.password) {
    console.error('Set PG_MIGRATE_PASSWORD in the environment before running this script.');
    process.exit(1);
  }

  const mssqlPool = await sql.connect({
    connectionString:
      'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=db_eformation;Trusted_Connection=Yes;',
  });
  const pg = new Client(PG_CONN);
  await pg.connect();

  const tablesResult = await mssqlPool.request().query('SELECT name FROM sys.tables ORDER BY name');
  const tables = tablesResult.recordset.map((r) => r.name);

  await pg.query('SET session_replication_role = replica;');

  let totalRows = 0;
  for (const table of tables) {
    const data = await mssqlPool.request().query(`SELECT * FROM [${table}]`);
    const rows = data.recordset;
    if (rows.length === 0) {
      console.log(`${table}: 0 rows, skipped`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(', ');

    for (const row of rows) {
      const values = columns.map((c) => {
        let v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v; // bit columns arrive as JS boolean already
        // JSONB columns: pass the source NVARCHAR(MAX) JSON text straight through as a
        // string — Postgres casts text -> jsonb automatically on INSERT. Do NOT
        // JSON.parse() first: binding a parsed JS array/object as a pg parameter makes
        // node-pg serialize it via its own (non-JSON) array/object formatting, which
        // Postgres then rejects as invalid JSON.
        return v;
      });
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await pg.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values);
      } catch (e) {
        console.error(`FAILED on ${table} row ${JSON.stringify(row).slice(0, 200)}: ${e.message}`);
        throw e;
      }
    }
    totalRows += rows.length;
    console.log(`${table}: ${rows.length} rows migrated`);
  }

  await pg.query('SET session_replication_role = origin;');

  // Reset every BIGSERIAL sequence to MAX(id)+1 so the app's next insert doesn't collide.
  const seqResult = await pg.query(`
    SELECT c.relname AS table_name, a.attname AS column_name, s.relname AS seq_name
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
    JOIN pg_class c ON c.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S'
  `);
  for (const row of seqResult.rows) {
    await pg.query(
      `SELECT setval('"${row.seq_name}"', COALESCE((SELECT MAX("${row.column_name}") FROM "${row.table_name}"), 0) + 1, false)`
    );
  }
  console.log(`Reset ${seqResult.rows.length} sequences.`);

  console.log(`Done. ${totalRows} total rows migrated across ${tables.length} tables.`);
  await pg.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
