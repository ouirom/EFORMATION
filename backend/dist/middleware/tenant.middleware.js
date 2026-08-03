"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantMiddleware = void 0;
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("./error.middleware");
const tenantHandler = async (req, res, next) => {
    try {
        // Get tenant from header or subdomain
        const tenantHeader = req.headers['x-tenant-id'];
        const tenantSlug = req.headers['x-tenant-slug'];
        const host = req.headers.host || '';
        let tenantId;
        let resolvedSlug;
        if (tenantHeader) {
            tenantId = parseInt(tenantHeader, 10);
            if (isNaN(tenantId)) {
                throw (0, error_middleware_1.BadRequestError)('Invalid tenant ID');
            }
        }
        else if (tenantSlug) {
            // Look up tenant by slug
            const tenants = await database_service_1.DatabaseService.query('SELECT id, slug FROM tenants WHERE slug = @slug', { slug: tenantSlug });
            if (tenants.length > 0) {
                tenantId = tenants[0].id;
                resolvedSlug = tenants[0].slug;
            }
        }
        else {
            // Try to extract from subdomain (e.g., tenant1.eformation.com)
            const parts = host.split('.');
            if (parts.length > 2) {
                const subdomain = parts[0];
                if (subdomain !== 'www' && subdomain !== 'api') {
                    const tenants = await database_service_1.DatabaseService.query('SELECT id, slug FROM tenants WHERE slug = @slug', { slug: subdomain });
                    if (tenants.length > 0) {
                        tenantId = tenants[0].id;
                        resolvedSlug = tenants[0].slug;
                    }
                }
            }
        }
        // Default to tenant ID 1 for development
        if (!tenantId && process.env.NODE_ENV === 'development') {
            const defaultTenant = await database_service_1.DatabaseService.query('SELECT TOP 1 id, slug FROM tenants ORDER BY id');
            if (defaultTenant.length > 0) {
                tenantId = defaultTenant[0].id;
                resolvedSlug = defaultTenant[0].slug;
            }
        }
        req.tenantId = tenantId;
        req.tenantSlug = resolvedSlug;
        next();
    }
    catch (error) {
        next(error);
    }
};
const tenantMiddleware = (req, res, next) => {
    return tenantHandler(req, res, next);
};
exports.tenantMiddleware = tenantMiddleware;
//# sourceMappingURL=tenant.middleware.js.map