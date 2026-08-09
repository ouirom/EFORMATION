// Introspects the live SQL Server database (columns/PKs/FKs/unique constraints) and writes
// four JSON dumps that gen_pg_schema.js reads. Run this first, from backend/ (needs its
// node_modules for the mssql driver): node ../db/scripts/dump_mssql_schema.js [outDir]
//
// Why introspect the live DB instead of translating db/bci_lms_schema_sqlserver.sql +
// db/migrations/*.sql: those files were found to be out of sync with the real running
// schema (missing tables/columns the application code depends on, e.g. courses.category
// existed live but not in any committed .sql file) — the live database is the only
// reliable source of truth.
const sql = require('mssql/msnodesqlv8');
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || path.join(__dirname, '.tmp');
fs.mkdirSync(outDir, { recursive: true });

const connectionString =
  'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=db_eformation;Trusted_Connection=Yes;';

sql.connect({ connectionString }).then(async (pool) => {
  const cols = await pool.request().query(`
    SELECT
      t.name AS table_name, c.column_id, c.name AS column_name, ty.name AS data_type,
      c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
      dc.definition AS default_definition, cc.definition AS check_definition
    FROM sys.tables t
    JOIN sys.columns c ON c.object_id = t.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
    LEFT JOIN sys.check_constraints cc ON cc.parent_object_id = t.object_id AND cc.parent_column_id = c.column_id
    ORDER BY t.name, c.column_id
  `);
  const pks = await pool.request().query(`
    SELECT t.name AS table_name, c.name AS column_name, ic.key_ordinal
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    JOIN sys.tables t ON t.object_id = i.object_id
    WHERE i.is_primary_key = 1
    ORDER BY t.name, ic.key_ordinal
  `);
  const fks = await pool.request().query(`
    SELECT fk.name AS fk_name, tp.name AS table_name, cp.name AS column_name,
           tr.name AS ref_table, cr.name AS ref_column
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id
    JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
    JOIN sys.tables tr ON tr.object_id = fkc.referenced_object_id
    JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
    ORDER BY tp.name, fk.name
  `);
  const uqs = await pool.request().query(`
    SELECT t.name AS table_name, i.name AS index_name, c.name AS column_name, ic.key_ordinal
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    JOIN sys.tables t ON t.object_id = i.object_id
    WHERE i.is_unique = 1 AND i.is_primary_key = 0
    ORDER BY t.name, i.name, ic.key_ordinal
  `);

  fs.writeFileSync(path.join(outDir, 'mssql_columns.json'), JSON.stringify(cols.recordset));
  fs.writeFileSync(path.join(outDir, 'mssql_pks.json'), JSON.stringify(pks.recordset));
  fs.writeFileSync(path.join(outDir, 'mssql_fks.json'), JSON.stringify(fks.recordset));
  fs.writeFileSync(path.join(outDir, 'mssql_uqs.json'), JSON.stringify(uqs.recordset));
  console.log(`Wrote schema dump to ${outDir}: ${cols.recordset.length} columns, ${pks.recordset.length} PK entries, ${fks.recordset.length} FKs, ${uqs.recordset.length} unique-index entries across ${new Set(cols.recordset.map(c => c.table_name)).size} tables.`);
  process.exit(0);
}).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
