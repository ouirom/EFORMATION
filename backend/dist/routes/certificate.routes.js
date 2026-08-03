"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const pdfkit_1 = __importDefault(require("pdfkit"));
const qrcode_1 = __importDefault(require("qrcode"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const config_1 = require("../config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
/**
 * @route GET /api/v1/certificates
 * @desc List certificates
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const userId = req.query.userId;
        const courseId = req.query.courseId;
        let query = `SELECT c.*, u.display_name as user_name, u.email as user_email,
                        co.title as course_title, f.storage_key as pdf_url
                 FROM certificates c
                 JOIN users u ON c.user_id = u.id
                 JOIN courses co ON c.course_id = co.id
                 LEFT JOIN file_assets f ON c.pdf_file_id = f.id
                 WHERE c.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (userId) {
            query += ' AND c.user_id = @userId';
            params.userId = parseInt(userId, 10);
        }
        if (courseId) {
            query += ' AND c.course_id = @courseId';
            params.courseId = parseInt(courseId, 10);
        }
        // Non-admins can only see their own certificates
        if (req.user.role !== 'admin' && req.user.role !== 'director') {
            query += ' AND c.user_id = @currentUserId';
            params.currentUserId = req.user.id;
        }
        query += ' ORDER BY c.issued_at DESC';
        const certificates = await database_service_1.DatabaseService.query(query, params);
        res.json({ success: true, data: certificates });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/certificates/:id
 * @desc Get certificate by ID
 */
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const certificateId = parseInt(req.params.id, 10);
        const certificates = await database_service_1.DatabaseService.query(`SELECT c.*, u.display_name as user_name, u.email as user_email,
              co.title as course_title, f.storage_key as pdf_url
       FROM certificates c
       JOIN users u ON c.user_id = u.id
       JOIN courses co ON c.course_id = co.id
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.id = @certificateId AND c.tenant_id = @tenantId`, { certificateId, tenantId: req.user.tenantId });
        if (certificates.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Certificate');
        }
        res.json({ success: true, data: certificates[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/certificates/verify/:serial
 * @desc Verify certificate by serial number (public)
 */
router.get('/verify/:serial', async (req, res, next) => {
    try {
        const serial = req.params.serial;
        const certificates = await database_service_1.DatabaseService.query(`SELECT c.serial, c.issued_at, u.display_name as user_name,
              co.title as course_title, t.name as tenant_name
       FROM certificates c
       JOIN users u ON c.user_id = u.id
       JOIN courses co ON c.course_id = co.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.serial = @serial`, { serial });
        if (certificates.length === 0) {
            res.json({
                success: true,
                data: {
                    valid: false,
                    message: 'Certificate not found',
                },
            });
            return;
        }
        res.json({
            success: true,
            data: {
                valid: true,
                certificate: certificates[0],
            },
        });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/certificates/generate
 * @desc Generate certificate for a user who completed a course
 */
router.post('/generate', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('userId').isInt(),
    (0, express_validator_1.body)('courseId').isInt(),
], async (req, res, next) => {
    try {
        validate(req);
        const { userId, courseId } = req.body;
        // Check if certificate already exists
        const existing = await database_service_1.DatabaseService.query('SELECT id FROM certificates WHERE user_id = @userId AND course_id = @courseId', { userId, courseId });
        if (existing.length > 0) {
            throw (0, error_middleware_1.BadRequestError)('Certificate already exists for this user and course');
        }
        // Get user and course info
        const users = await database_service_1.DatabaseService.query('SELECT display_name, email FROM users WHERE id = @userId AND tenant_id = @tenantId', { userId, tenantId: req.user.tenantId });
        if (users.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('User');
        }
        const courses = await database_service_1.DatabaseService.query('SELECT title FROM courses WHERE id = @courseId AND tenant_id = @tenantId', { courseId, tenantId: req.user.tenantId });
        if (courses.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Course');
        }
        // Create certificate record (serial will be generated by trigger)
        const result = await database_service_1.DatabaseService.query(`INSERT INTO certificates (tenant_id, user_id, course_id, serial)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @userId, @courseId, '')`, { tenantId: req.user.tenantId, userId, courseId });
        // Get the generated serial
        const cert = await database_service_1.DatabaseService.query('SELECT * FROM certificates WHERE id = @id', { id: result[0].id });
        // Generate PDF certificate
        const pdfPath = await generateCertificatePDF(cert[0].serial, users[0].display_name, courses[0].title, cert[0].issued_at);
        // Store the PDF as file asset
        const fileResult = await database_service_1.DatabaseService.query(`INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @filename, 'application/pdf', @storageKey, @createdBy)`, {
            tenantId: req.user.tenantId,
            filename: `certificate_${cert[0].serial}.pdf`,
            storageKey: pdfPath,
            createdBy: req.user.id,
        });
        // Update certificate with PDF file ID
        await database_service_1.DatabaseService.execute('UPDATE certificates SET pdf_file_id = @fileId WHERE id = @id', { fileId: fileResult[0].id, id: cert[0].id });
        const certificate = await database_service_1.DatabaseService.query(`SELECT c.*, u.display_name as user_name, co.title as course_title
         FROM certificates c
         JOIN users u ON c.user_id = u.id
         JOIN courses co ON c.course_id = co.id
         WHERE c.id = @id`, { id: cert[0].id });
        res.status(201).json({ success: true, data: certificate[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/certificates/:id/download
 * @desc Download certificate PDF
 */
router.get('/:id/download', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const certificateId = parseInt(req.params.id, 10);
        const certificates = await database_service_1.DatabaseService.query(`SELECT c.*, f.storage_key, f.filename
       FROM certificates c
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.id = @certificateId AND c.tenant_id = @tenantId`, { certificateId, tenantId: req.user.tenantId });
        if (certificates.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Certificate');
        }
        if (!certificates[0].storage_key) {
            throw (0, error_middleware_1.BadRequestError)('Certificate PDF not generated');
        }
        const filePath = path_1.default.join(config_1.config.uploadDir, certificates[0].storage_key);
        if (!fs_1.default.existsSync(filePath)) {
            throw (0, error_middleware_1.NotFoundError)('Certificate file');
        }
        res.download(filePath, certificates[0].filename);
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/certificates/:id
 * @desc Delete certificate
 */
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const certificateId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('DELETE FROM certificates WHERE id = @certificateId AND tenant_id = @tenantId', { certificateId, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Certificate deleted' });
    }
    catch (error) {
        next(error);
    }
});
// Helper function to generate PDF certificate
async function generateCertificatePDF(serial, userName, courseTitle, issuedAt) {
    const doc = new pdfkit_1.default({ size: 'A4', layout: 'landscape' });
    const filename = `certificates/${serial}.pdf`;
    const fullPath = path_1.default.join(config_1.config.uploadDir, filename);
    // Ensure directory exists
    const dir = path_1.default.dirname(fullPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    const stream = fs_1.default.createWriteStream(fullPath);
    doc.pipe(stream);
    // Certificate design
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke('#1a365d');
    doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke('#2d3748');
    // Title
    doc.fontSize(48)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('CERTIFICATE', 0, 80, { align: 'center' });
    doc.fontSize(24)
        .font('Helvetica')
        .fillColor('#4a5568')
        .text('OF COMPLETION', 0, 140, { align: 'center' });
    // Recipient name
    doc.fontSize(16)
        .fillColor('#718096')
        .text('This is to certify that', 0, 200, { align: 'center' });
    doc.fontSize(36)
        .font('Helvetica-Bold')
        .fillColor('#2d3748')
        .text(userName, 0, 230, { align: 'center' });
    // Course
    doc.fontSize(16)
        .font('Helvetica')
        .fillColor('#718096')
        .text('has successfully completed the course', 0, 290, { align: 'center' });
    doc.fontSize(28)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(courseTitle, 0, 320, { align: 'center' });
    // Date
    const dateStr = new Date(issuedAt).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    doc.fontSize(14)
        .font('Helvetica')
        .fillColor('#718096')
        .text(`Issued on: ${dateStr}`, 0, 390, { align: 'center' });
    // Serial number
    doc.fontSize(10)
        .fillColor('#a0aec0')
        .text(`Certificate ID: ${serial}`, 0, 420, { align: 'center' });
    // QR Code
    const verifyUrl = `${config_1.config.certificateVerifyUrl}/${serial}`;
    const qrDataUrl = await qrcode_1.default.toDataURL(verifyUrl, { width: 80 });
    const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    doc.image(qrImageBuffer, doc.page.width - 140, doc.page.height - 130, { width: 80 });
    doc.fontSize(8)
        .fillColor('#a0aec0')
        .text('Scan to verify', doc.page.width - 145, doc.page.height - 45);
    doc.end();
    return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve(filename));
        stream.on('error', reject);
    });
}
exports.default = router;
//# sourceMappingURL=certificate.routes.js.map