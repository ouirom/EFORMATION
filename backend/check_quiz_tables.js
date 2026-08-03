const sql = require('mssql/msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=db_eformation;Trusted_Connection=Yes;';

async function checkQuizzes() {
  try {
    const pool = await new sql.ConnectionPool({ connectionString }).connect();
    
    // Check if table exists
    const tables = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'quizzes'
    `);
    console.log('Table quizzes exists:', tables.recordset.length > 0);
    
    if (tables.recordset.length === 0) {
      console.log('Creating quizzes table...');
      await pool.request().query(`
        CREATE TABLE quizzes (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          tenant_id BIGINT NOT NULL,
          lesson_id BIGINT NOT NULL,
          title NVARCHAR(255) NOT NULL,
          passing_score INT DEFAULT 70,
          randomized BIT DEFAULT 0,
          created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT fk_quizzes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          CONSTRAINT fk_quizzes_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id)
        )
      `);
      console.log('Table quizzes created!');
    }
    
    // Check questions table
    const questionsTable = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'questions'
    `);
    console.log('Table questions exists:', questionsTable.recordset.length > 0);
    
    if (questionsTable.recordset.length === 0) {
      console.log('Creating questions table...');
      await pool.request().query(`
        CREATE TABLE questions (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          tenant_id BIGINT NOT NULL,
          quiz_id BIGINT NOT NULL,
          type NVARCHAR(20) NOT NULL CHECK (type IN ('mcq','true_false','short_answer')),
          prompt NVARCHAR(MAX) NOT NULL,
          position INT NOT NULL,
          points INT DEFAULT 1,
          created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT fk_questions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        )
      `);
      console.log('Table questions created!');
    }
    
    // Check choices table
    const choicesTable = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'choices'
    `);
    console.log('Table choices exists:', choicesTable.recordset.length > 0);
    
    if (choicesTable.recordset.length === 0) {
      console.log('Creating choices table...');
      await pool.request().query(`
        CREATE TABLE choices (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          question_id BIGINT NOT NULL,
          label NVARCHAR(500) NOT NULL,
          is_correct BIT DEFAULT 0,
          position INT NOT NULL,
          created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT fk_choices_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        )
      `);
      console.log('Table choices created!');
    }
    
    await pool.close();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkQuizzes();
