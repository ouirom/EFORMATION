const sql = require('mssql/msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=db_eformation;Trusted_Connection=Yes;';

async function checkChoicesTable() {
  try {
    const pool = await new sql.ConnectionPool({ connectionString }).connect();
    
    const r = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'choices'");
    console.log('Choices columns:', r.recordset.map(c => c.COLUMN_NAME));
    
    // Check if tenant_id exists
    const hasTenantId = r.recordset.some(c => c.COLUMN_NAME === 'tenant_id');
    if (!hasTenantId) {
      console.log('Adding tenant_id column...');
      await pool.request().query('ALTER TABLE choices ADD tenant_id BIGINT NULL');
      console.log('tenant_id column added');
    }
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkChoicesTable();
