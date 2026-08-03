const sql = require('mssql/msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=db_eformation;Trusted_Connection=Yes;';

async function addColumn() {
  try {
    const pool = await new sql.ConnectionPool({
      connectionString,
    }).connect();
    
    // Check if column exists
    const check = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'lessons' AND COLUMN_NAME = 'type'
    `);
    
    if (check.recordset.length === 0) {
      await pool.request().query(`ALTER TABLE lessons ADD type NVARCHAR(50) NULL`);
      console.log('Column "type" added to lessons table');
    } else {
      console.log('Column "type" already exists');
    }
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addColumn();
