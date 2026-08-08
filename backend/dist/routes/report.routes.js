"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const pdfkit_1 = __importDefault(require("pdfkit"));
const exceljs_1 = __importDefault(require("exceljs"));
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
/**
 * @route GET /api/v1/reports/types
 * @desc Get available report types
 */
router.get('/types', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), async (req, res, next) => {
    try {
        const reportTypes = [
            { id: 'user_progress', name: 'User Progress Report', description: 'Detailed progress for all users' },
            { id: 'course_completion', name: 'Course Completion Report', description: 'Course completion rates and statistics' },
            { id: 'quiz_performance', name: 'Quiz Performance Report', description: 'Quiz scores and pass rates' },
            { id: 'enrollment_summary', name: 'Enrollment Summary', description: 'Enrollment trends and statistics' },
            { id: 'badge_awards', name: 'Badge Awards Report', description: 'Badge distribution and top earners' },
            { id: 'certificate_issuance', name: 'Certificate Report', description: 'Certificates issued' },
            { id: 'activity_log', name: 'Activity Log', description: 'User activity audit trail' },
            { id: 'organization_overview', name: 'Organization Overview', description: 'Stats by enterprise/direction/service' },
        ];
        res.json({ success: true, data: reportTypes });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/reports/generate
 * @desc Generate a report
 */
router.post('/generate', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director', 'manager'), [
    (0, express_validator_1.body)('reportType').isIn(['user_progress', 'course_completion', 'quiz_performance', 'enrollment_summary', 'badge_awards', 'certificate_issuance', 'activity_log', 'organization_overview']),
    (0, express_validator_1.body)('format').isIn(['json', 'csv', 'excel', 'pdf']),
    (0, express_validator_1.body)('startDate').optional().isISO8601(),
    (0, express_validator_1.body)('endDate').optional().isISO8601(),
    (0, express_validator_1.body)('filters').optional().isObject(),
], async (req, res, next) => {
    try {
        validate(req);
        const { reportType, format, startDate, endDate, filters } = req.body;
        const tenantId = req.user.tenantId;
        // Generate report data
        const reportData = await generateReportData(reportType, tenantId, { startDate, endDate, ...filters });
        // Return in requested format
        switch (format) {
            case 'json':
                res.json({ success: true, data: reportData });
                break;
            case 'csv': {
                const csv = convertToCSV(reportData);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${Date.now()}.csv"`);
                res.send(csv);
                break;
            }
            case 'excel': {
                const excelBuffer = await generateExcel(reportType, reportData);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${Date.now()}.xlsx"`);
                res.send(excelBuffer);
                break;
            }
            case 'pdf': {
                const pdfBuffer = await generatePDF(reportType, reportData);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${Date.now()}.pdf"`);
                res.send(pdfBuffer);
                break;
            }
        }
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/reports/scheduled
 * @desc Get scheduled reports
 */
router.get('/scheduled', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), async (req, res, next) => {
    try {
        const reports = await database_service_1.DatabaseService.query(`SELECT * FROM scheduled_reports WHERE tenant_id = @tenantId AND is_active = 1 ORDER BY created_at DESC`, { tenantId: req.user.tenantId });
        res.json({ success: true, data: reports });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/reports/schedule
 * @desc Schedule a recurring report
 */
router.post('/schedule', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin', 'director'), [
    (0, express_validator_1.body)('reportType').notEmpty(),
    (0, express_validator_1.body)('frequency').isIn(['daily', 'weekly', 'monthly']),
    (0, express_validator_1.body)('format').isIn(['csv', 'excel', 'pdf']),
    (0, express_validator_1.body)('recipients').isArray({ min: 1 }),
], async (req, res, next) => {
    try {
        validate(req);
        const { reportType, frequency, format, recipients, filters } = req.body;
        const result = await database_service_1.DatabaseService.query(`INSERT INTO scheduled_reports (tenant_id, report_type, frequency, format, recipients, filters, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @reportType, @frequency, @format, @recipients, @filters, @createdBy)`, {
            tenantId: req.user.tenantId,
            reportType,
            frequency,
            format,
            recipients: JSON.stringify(recipients),
            filters: filters ? JSON.stringify(filters) : null,
            createdBy: req.user.id,
        });
        const report = await database_service_1.DatabaseService.query('SELECT * FROM scheduled_reports WHERE id = @id', { id: result[0].id });
        res.status(201).json({ success: true, data: report[0] });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/reports/scheduled/:id
 * @desc Delete a scheduled report
 */
router.delete('/scheduled/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const reportId = parseInt(req.params.id, 10);
        await database_service_1.DatabaseService.execute('UPDATE scheduled_reports SET is_active = 0 WHERE id = @reportId AND tenant_id = @tenantId', { reportId, tenantId: req.user.tenantId });
        res.json({ success: true, message: 'Scheduled report deleted' });
    }
    catch (error) {
        next(error);
    }
});
// Helper function to generate report data
async function generateReportData(reportType, tenantId, filters) {
    const { startDate, endDate, courseId, userId, organizationId } = filters || {};
    const dateFilter = startDate && endDate
        ? 'AND created_at BETWEEN @startDate AND @endDate'
        : startDate
            ? 'AND created_at >= @startDate'
            : '';
    switch (reportType) {
        case 'user_progress':
            return database_service_1.DatabaseService.query(`SELECT u.id, u.display_name, u.email, u.role,
                e.name as enterprise,
                COUNT(DISTINCT en.course_id) as enrolled_courses,
                AVG(en.progress_percent) as avg_progress,
                SUM(CASE WHEN en.progress_percent >= 100 THEN 1 ELSE 0 END) as completed_courses
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN enrollments en ON u.id = en.user_id
         WHERE u.tenant_id = @tenantId ${dateFilter}
         GROUP BY u.id, u.display_name, u.email, u.role, e.name
         ORDER BY avg_progress DESC`, { tenantId, startDate, endDate });
        case 'course_completion':
            return database_service_1.DatabaseService.query(`SELECT c.id, c.title, c.category,
                COUNT(e.id) as total_enrollments,
                SUM(CASE WHEN e.progress_percent >= 100 THEN 1 ELSE 0 END) as completions,
                AVG(e.progress_percent) as avg_progress,
                AVG(DATEDIFF(day, e.started_at, e.completed_at)) as avg_days_to_complete
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.tenant_id = @tenantId ${courseId ? 'AND c.id = @courseId' : ''} ${dateFilter}
         GROUP BY c.id, c.title, c.category
         ORDER BY completions DESC`, { tenantId, courseId, startDate, endDate });
        case 'quiz_performance':
            return database_service_1.DatabaseService.query(`SELECT q.id, q.title, c.title as course_title,
                COUNT(qa.id) as total_attempts,
                AVG(qa.score) as avg_score,
                MIN(qa.score) as min_score,
                MAX(qa.score) as max_score,
                SUM(CASE WHEN qa.passed = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(qa.id), 0) as pass_rate
         FROM quizzes q
         LEFT JOIN courses c ON q.course_id = c.id
         LEFT JOIN attempts qa ON q.id = qa.quiz_id
         WHERE q.tenant_id = @tenantId ${dateFilter}
         GROUP BY q.id, q.title, c.title
         ORDER BY total_attempts DESC`, { tenantId, startDate, endDate });
        case 'enrollment_summary':
            return database_service_1.DatabaseService.query(`SELECT CAST(e.started_at AS DATE) as date,
                COUNT(*) as enrollments,
                COUNT(DISTINCT e.user_id) as unique_users,
                COUNT(DISTINCT e.course_id) as courses
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         WHERE c.tenant_id = @tenantId ${dateFilter.replace('created_at', 'e.started_at')}
         GROUP BY CAST(e.started_at AS DATE)
         ORDER BY date`, { tenantId, startDate, endDate });
        case 'badge_awards':
            return database_service_1.DatabaseService.query(`SELECT b.name as badge_name, b.type,
                COUNT(ab.id) as times_awarded,
                COUNT(DISTINCT ab.user_id) as unique_recipients
         FROM badges b
         LEFT JOIN user_badges ab ON b.id = ab.badge_id
         WHERE b.tenant_id = @tenantId ${dateFilter.replace('created_at', 'ab.awarded_at')}
         GROUP BY b.id, b.name, b.type
         ORDER BY times_awarded DESC`, { tenantId, startDate, endDate });
        case 'certificate_issuance':
            return database_service_1.DatabaseService.query(`SELECT c.serial, u.display_name as user_name, u.email,
                co.title as course_title, c.issued_at
         FROM certificates c
         JOIN users u ON c.user_id = u.id
         JOIN courses co ON c.course_id = co.id
         WHERE c.tenant_id = @tenantId ${dateFilter.replace('created_at', 'c.issued_at')}
         ORDER BY c.issued_at DESC`, { tenantId, startDate, endDate });
        case 'activity_log':
            return database_service_1.DatabaseService.query(`SELECT TOP 1000 al.action, al.resource_type, al.resource_id,
                u.display_name as user_name, al.ip_address, al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.tenant_id = @tenantId ${dateFilter.replace('created_at', 'al.created_at')}
         ORDER BY al.created_at DESC`, { tenantId, startDate, endDate });
        case 'organization_overview':
            return database_service_1.DatabaseService.query(`SELECT e.name as enterprise, d.name as direction, s.name as service,
                COUNT(DISTINCT u.id) as users,
                COUNT(DISTINCT en.id) as enrollments,
                AVG(en.progress_percent) as avg_progress
         FROM enterprises e
         LEFT JOIN directions d ON e.id = d.enterprise_id
         LEFT JOIN services s ON d.id = s.direction_id
         LEFT JOIN users u ON u.enterprise_id = e.id OR u.direction_id = d.id OR u.service_id = s.id
         LEFT JOIN enrollments en ON u.id = en.user_id
         WHERE e.tenant_id = @tenantId
         GROUP BY e.id, e.name, d.id, d.name, s.id, s.name
         ORDER BY e.name, d.name, s.name`, { tenantId });
        default:
            return [];
    }
}
// Convert data to CSV
function convertToCSV(data) {
    if (data.length === 0)
        return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined)
            return '';
        if (typeof value === 'string' && value.includes(','))
            return `"${value}"`;
        return value;
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
}
// Generate Excel file
async function generateExcel(reportType, data) {
    const workbook = new exceljs_1.default.Workbook();
    const worksheet = workbook.addWorksheet(reportType);
    if (data.length > 0) {
        // Add headers
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);
        // Style headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1A365D' },
        };
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        // Add data rows
        data.forEach(row => {
            worksheet.addRow(headers.map(h => row[h]));
        });
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = 15;
        });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
// Generate PDF report
async function generatePDF(reportType, data) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new pdfkit_1.default({ margin: 50 });
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // Title
        doc.fontSize(20).font('Helvetica-Bold').text(formatReportTitle(reportType), { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);
        if (data.length === 0) {
            doc.text('No data available for this report.');
        }
        else {
            const headers = Object.keys(data[0]);
            const colWidth = (doc.page.width - 100) / Math.min(headers.length, 5);
            // Table headers
            doc.font('Helvetica-Bold').fontSize(10);
            let x = 50;
            headers.slice(0, 5).forEach(header => {
                doc.text(formatHeader(header), x, doc.y, { width: colWidth, continued: headers.indexOf(header) < 4 });
                x += colWidth;
            });
            doc.moveDown();
            // Separator
            doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
            doc.moveDown(0.5);
            // Data rows
            doc.font('Helvetica').fontSize(9);
            data.slice(0, 50).forEach(row => {
                x = 50;
                headers.slice(0, 5).forEach((header, index) => {
                    const value = row[header];
                    const displayValue = (value === null || value === undefined ? '-' :
                        typeof value === 'number' ? Math.round(value * 100) / 100 : String(value).substring(0, 20)).toString();
                    doc.text(displayValue, x, doc.y, { width: colWidth, continued: index < 4 });
                    x += colWidth;
                });
                doc.moveDown(0.5);
                if (doc.y > doc.page.height - 100) {
                    doc.addPage();
                }
            });
            if (data.length > 50) {
                doc.moveDown();
                doc.text(`... and ${data.length - 50} more rows`);
            }
        }
        doc.end();
    });
}
function formatReportTitle(type) {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Report';
}
function formatHeader(header) {
    return header.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
exports.default = router;
//# sourceMappingURL=report.routes.js.map