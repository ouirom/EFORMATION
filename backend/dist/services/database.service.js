"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const config_1 = require("../config");
const mssql_driver_1 = require("./drivers/mssql.driver");
const postgres_driver_1 = require("./drivers/postgres.driver");
class DatabaseService {
    static driver = null;
    static getDriver() {
        if (!this.driver) {
            this.driver = config_1.config.database.client === 'postgres' ? new postgres_driver_1.PostgresDriver() : new mssql_driver_1.MssqlDriver();
        }
        return this.driver;
    }
    static async initialize() {
        // Trigger a connection now so startup fails fast on bad DB config.
        await this.getDriver().query('SELECT 1 as ok');
    }
    static async query(queryString, params) {
        return this.getDriver().query(queryString, params);
    }
    static async execute(queryString, params) {
        return this.getDriver().execute(queryString, params);
    }
    static async close() {
        if (this.driver) {
            await this.driver.close();
            this.driver = null;
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.service.js.map