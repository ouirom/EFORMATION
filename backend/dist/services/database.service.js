"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = exports.DatabaseService = void 0;
const msnodesqlv8_1 = __importDefault(require("mssql/msnodesqlv8"));
exports.sql = msnodesqlv8_1.default;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class DatabaseService {
    static pool = null;
    static async initialize() {
        if (this.pool) {
            return this.pool;
        }
        try {
            // Connection string for Windows Authentication using ODBC Driver
            const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${config_1.config.database.server};Database=${config_1.config.database.database};Trusted_Connection=Yes;`;
            logger_1.logger.info(`Connecting to SQL Server: ${config_1.config.database.server}/${config_1.config.database.database}`);
            this.pool = await new msnodesqlv8_1.default.ConnectionPool({
                connectionString,
                pool: {
                    max: 10,
                    min: 0,
                    idleTimeoutMillis: 30000,
                },
            }).connect();
            logger_1.logger.info('Connected to SQL Server database using Windows Authentication');
            return this.pool;
        }
        catch (error) {
            console.error('Database connection error details:', error);
            logger_1.logger.error('Database connection error:', {
                message: error.message,
                code: error.code,
                server: config_1.config.database.server,
                database: config_1.config.database.database,
            });
            throw error;
        }
    }
    static async getPool() {
        if (!this.pool) {
            return this.initialize();
        }
        return this.pool;
    }
    static async query(queryString, params) {
        const pool = await this.getPool();
        const request = pool.request();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value === null) {
                    request.input(key, msnodesqlv8_1.default.NVarChar, null);
                }
                else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        request.input(key, msnodesqlv8_1.default.BigInt, value);
                    }
                    else {
                        request.input(key, msnodesqlv8_1.default.Decimal(18, 4), value);
                    }
                }
                else if (typeof value === 'boolean') {
                    request.input(key, msnodesqlv8_1.default.Bit, value);
                }
                else if (value instanceof Date) {
                    request.input(key, msnodesqlv8_1.default.DateTime2, value);
                }
                else if (typeof value === 'object') {
                    request.input(key, msnodesqlv8_1.default.NVarChar(msnodesqlv8_1.default.MAX), JSON.stringify(value));
                }
                else {
                    request.input(key, msnodesqlv8_1.default.NVarChar, value);
                }
            });
        }
        const result = await request.query(queryString);
        return result.recordset;
    }
    static async execute(queryString, params) {
        const pool = await this.getPool();
        const request = pool.request();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value === null) {
                    request.input(key, msnodesqlv8_1.default.NVarChar, null);
                }
                else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        request.input(key, msnodesqlv8_1.default.BigInt, value);
                    }
                    else {
                        request.input(key, msnodesqlv8_1.default.Decimal(18, 4), value);
                    }
                }
                else if (typeof value === 'boolean') {
                    request.input(key, msnodesqlv8_1.default.Bit, value);
                }
                else if (value instanceof Date) {
                    request.input(key, msnodesqlv8_1.default.DateTime2, value);
                }
                else if (typeof value === 'object') {
                    request.input(key, msnodesqlv8_1.default.NVarChar(msnodesqlv8_1.default.MAX), JSON.stringify(value));
                }
                else {
                    request.input(key, msnodesqlv8_1.default.NVarChar, value);
                }
            });
        }
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
    static async transaction(callback) {
        const pool = await this.getPool();
        const transaction = new msnodesqlv8_1.default.Transaction(pool);
        try {
            await transaction.begin();
            const result = await callback(transaction);
            await transaction.commit();
            return result;
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
    static async close() {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
            logger_1.logger.info('Database connection closed');
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.service.js.map