"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
const pg_1 = require("pg");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const sql_dialect_1 = require("../../utils/sql-dialect");
// Match the mssql driver's value shapes so route code behaves the same on both engines:
// BIGINT (oid 20) as a JS number instead of pg's default string, and JSON/JSONB (oid
// 114/3802) as raw text instead of pg's default auto-parsed object, since the codebase
// was written against mssql's NVARCHAR(MAX) JSON columns and calls JSON.parse() itself.
pg_1.types.setTypeParser(20, (value) => parseInt(value, 10));
pg_1.types.setTypeParser(114, (value) => value);
pg_1.types.setTypeParser(3802, (value) => value);
class PostgresDriver {
    pool = null;
    getPool() {
        if (this.pool)
            return this.pool;
        logger_1.logger.info(`Connecting to PostgreSQL: ${config_1.config.database.server}/${config_1.config.database.database}`);
        this.pool = new pg_1.Pool({
            host: config_1.config.database.server,
            port: config_1.config.database.port,
            database: config_1.config.database.database,
            user: config_1.config.database.user,
            password: config_1.config.database.password,
            ssl: config_1.config.database.ssl ? { rejectUnauthorized: false } : undefined,
            max: config_1.config.database.pool.max,
            idleTimeoutMillis: config_1.config.database.pool.idleTimeoutMillis,
        });
        this.pool.on('connect', () => logger_1.logger.info('Connected to PostgreSQL database'));
        this.pool.on('error', (error) => logger_1.logger.error('PostgreSQL pool error:', { message: error.message }));
        return this.pool;
    }
    async query(queryString, params) {
        const pool = this.getPool();
        const { text, values } = (0, sql_dialect_1.translateForPostgres)(queryString, params);
        const result = await pool.query(text, values);
        return result.rows;
    }
    async execute(queryString, params) {
        const pool = this.getPool();
        const { text, values } = (0, sql_dialect_1.translateForPostgres)(queryString, params);
        const result = await pool.query(text, values);
        let insertedId;
        if (result.rows && result.rows[0]?.id) {
            insertedId = result.rows[0].id;
        }
        return {
            rowsAffected: result.rowCount ?? 0,
            insertedId,
        };
    }
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            logger_1.logger.info('Database connection closed');
        }
    }
}
exports.PostgresDriver = PostgresDriver;
//# sourceMappingURL=postgres.driver.js.map