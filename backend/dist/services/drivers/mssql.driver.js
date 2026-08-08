"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MssqlDriver = void 0;
const mssql_1 = __importDefault(require("mssql"));
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
function bindParams(request, params) {
    if (!params)
        return;
    Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
            request.input(key, mssql_1.default.NVarChar, null);
        }
        else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                request.input(key, mssql_1.default.BigInt, value);
            }
            else {
                request.input(key, mssql_1.default.Decimal(18, 4), value);
            }
        }
        else if (typeof value === 'boolean') {
            request.input(key, mssql_1.default.Bit, value);
        }
        else if (value instanceof Date) {
            request.input(key, mssql_1.default.DateTime2, value);
        }
        else if (typeof value === 'object') {
            request.input(key, mssql_1.default.NVarChar(mssql_1.default.MAX), JSON.stringify(value));
        }
        else {
            request.input(key, mssql_1.default.NVarChar, value);
        }
    });
}
class MssqlDriver {
    pool = null;
    async getPool() {
        if (this.pool)
            return this.pool;
        logger_1.logger.info(`Connecting to SQL Server: ${config_1.config.database.server}/${config_1.config.database.database}`);
        this.pool = await new mssql_1.default.ConnectionPool({
            server: config_1.config.database.server,
            database: config_1.config.database.database,
            user: config_1.config.database.user,
            password: config_1.config.database.password,
            options: config_1.config.database.options,
            pool: config_1.config.database.pool,
        }).connect();
        logger_1.logger.info('Connected to SQL Server database');
        return this.pool;
    }
    async query(queryString, params) {
        const pool = await this.getPool();
        const request = pool.request();
        bindParams(request, params);
        const result = await request.query(queryString);
        return result.recordset;
    }
    async execute(queryString, params) {
        const pool = await this.getPool();
        const request = pool.request();
        bindParams(request, params);
        const result = await request.query(queryString);
        let insertedId;
        if (result.recordset && result.recordset[0]?.id) {
            insertedId = result.recordset[0].id;
        }
        return {
            rowsAffected: result.rowsAffected.reduce((a, b) => a + b, 0),
            insertedId,
        };
    }
    async close() {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
            logger_1.logger.info('Database connection closed');
        }
    }
}
exports.MssqlDriver = MssqlDriver;
//# sourceMappingURL=mssql.driver.js.map