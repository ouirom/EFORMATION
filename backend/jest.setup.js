// Tests assert against literal mssql SQL text (SYSUTCDATETIME(), OUTPUT INSERTED.id,
// is_default = 0, etc.) since they mock DatabaseService and were written against the
// mssql code path. Pin DB_CLIENT here, before config/index.ts's dotenv.config() runs,
// so the test suite's behavior doesn't silently follow whatever DB_CLIENT the
// developer's real backend/.env happens to be set to (e.g. after switching a local
// dev environment to Postgres).
process.env.DB_CLIENT = 'mssql';
