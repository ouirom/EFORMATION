"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
const pg_1 = require("pg");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const sql_dialect_1 = require("../../utils/sql-dialect");
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