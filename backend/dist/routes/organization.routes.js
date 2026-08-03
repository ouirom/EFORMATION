"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// ==================== TENANTS ====================
router.get('/tenants', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const tenants = await database_service_1.DatabaseService.query('SELECT * FROM tenants ORDER BY name');
        res.json({ success: true, data: tenants });
    }
    catch (error) {
        next(error);
    }
});
// ==================== ENTERPRISES ====================
router.get('/enterprises', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterprises = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name', { tenantId: req.user.tenantId });
        res.json({ success: true, data: enterprises });
    }
    catch (error) {
        next(error);
    }
});
router.post('/enterprises', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [(0, express_validator_1.body)('name').notEmpty().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO enterprises (tenant_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @name, @code)`, { tenantId: req.user.tenantId, name: req.body.name, code: req.body.code || null });
        const enterprise = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: enterprise[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/enterprises/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE enterprises SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const enterprise = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (enterprise.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Enterprise');
        res.json({ success: true, data: enterprise[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/enterprises/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM enterprises WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Enterprise deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== DIRECTIONS ====================
router.get('/directions', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterpriseId = req.query.enterpriseId;
        let query = 'SELECT d.*, e.name as enterprise_name FROM directions d JOIN enterprises e ON d.enterprise_id = e.id WHERE d.tenant_id = @tenantId';
        const params = { tenantId: req.user.tenantId };
        if (enterpriseId) {
            query += ' AND d.enterprise_id = @enterpriseId';
            params.enterpriseId = parseInt(enterpriseId, 10);
        }
        query += ' ORDER BY d.name';
        const directions = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: directions });
    }
    catch (error) {
        next(error);
    }
});
router.post('/directions', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [
    (0, express_validator_1.body)('enterpriseId').isInt(),
    (0, express_validator_1.body)('name').notEmpty().trim(),
    (0, express_validator_1.body)('code').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO directions (tenant_id, enterprise_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @enterpriseId, @name, @code)`, {
            tenantId: req.user.tenantId,
            enterpriseId: req.body.enterpriseId,
            name: req.body.name,
            code: req.body.code || null,
        });
        const direction = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: direction[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/directions/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE directions SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const direction = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (direction.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Direction');
        res.json({ success: true, data: direction[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/directions/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM directions WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Direction deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== SERVICES ====================
router.get('/services', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const directionId = req.query.directionId;
        let query = `SELECT s.*, d.name as direction_name, e.name as enterprise_name 
                 FROM services s 
                 JOIN directions d ON s.direction_id = d.id 
                 JOIN enterprises e ON d.enterprise_id = e.id
                 WHERE s.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (directionId) {
            query += ' AND s.direction_id = @directionId';
            params.directionId = parseInt(directionId, 10);
        }
        query += ' ORDER BY s.name';
        const services = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: services });
    }
    catch (error) {
        next(error);
    }
});
router.post('/services', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('directionId').isInt(),
    (0, express_validator_1.body)('name').notEmpty().trim(),
    (0, express_validator_1.body)('code').optional().trim(),
], async (req, res, next) => {
    try {
        validate(req);
        const result = await database_service_1.DatabaseService.query(`INSERT INTO services (tenant_id, direction_id, name, code)
         OUTPUT INSERTED.id VALUES (@tenantId, @directionId, @name, @code)`, {
            tenantId: req.user.tenantId,
            directionId: req.body.directionId,
            name: req.body.name,
            code: req.body.code || null,
        });
        const service = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: service[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/services/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [(0, express_validator_1.body)('name').optional().trim(), (0, express_validator_1.body)('code').optional().trim()], async (req, res, next) => {
    try {
        validate(req);
        const id = parseInt(req.params.id, 10);
        const updateFields = [];
        const params = { id, tenantId: req.user.tenantId };
        if (req.body.name) {
            updateFields.push('name = @name');
            params.name = req.body.name;
        }
        if (req.body.code !== undefined) {
            updateFields.push('code = @code');
            params.code = req.body.code;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE services SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`, params);
        }
        const service = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        if (service.length === 0)
            throw (0, error_middleware_1.NotFoundError)('Service');
        res.json({ success: true, data: service[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/services/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM services WHERE id = @id AND tenant_id = @tenantId', { id, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Service deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== ORGANIZATION TREE ====================
router.get('/tree', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const enterprises = await database_service_1.DatabaseService.query('SELECT * FROM enterprises WHERE tenant_id = @tenantId ORDER BY name', { tenantId: req.user.tenantId });
        const tree = await Promise.all(enterprises.map(async (enterprise) => {
            const directions = await database_service_1.DatabaseService.query('SELECT * FROM directions WHERE enterprise_id = @enterpriseId ORDER BY name', { enterpriseId: enterprise.id });
            const directionsWithServices = await Promise.all(directions.map(async (direction) => {
                const services = await database_service_1.DatabaseService.query('SELECT * FROM services WHERE direction_id = @directionId ORDER BY name', { directionId: direction.id });
                return { ...direction, services };
            }));
            return { ...enterprise, directions: directionsWithServices };
        }));
        res.json({ success: true, data: tree });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=organization.routes.js.map