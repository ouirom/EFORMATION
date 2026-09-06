import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError } from '../middleware/error.middleware';
import { db, IS_PG } from '../database/db-helpers';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

/**
 * @route GET /api/v1/reports/types
 * @desc Get available report types
 */
router.get('/types', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
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
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/reports/generate
 * @desc Generate a report
 */
router.post(
  '/generate',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('reportType').isIn(['user_progress', 'course_completion', 'quiz_performance', 'enrollment_summary', 'badge_awards', 'certificate_issuance', 'activity_log', 'organization_overview']),
    body('format').isIn(['json', 'csv', 'excel', 'pdf']),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('filters').optional().isObject(),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { reportType, format, startDate, endDate, filters } = req.body;
      const tenantId = req.user!.tenantId;

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
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/reports/scheduled
 * @desc Get scheduled reports
 */
router.get('/scheduled', authenticate, authorize('admin', 'director'), async (req: AuthRequest, res, next) => {
  try {
    const reports = await DatabaseService.query<any>(
      `SELECT * FROM scheduled_reports WHERE tenant_id = @tenantId AND is_active = ${db.bool(true)} ORDER BY created_at DESC`,
      { tenantId: req.user!.tenantId }
    );
    res.json({ success: true, data: reports });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/reports/schedule
 * @desc Schedule a recurring report
 */
router.post(
  '/schedule',
  authenticate,
  authorize('admin', 'director'),
  [
    body('reportType').notEmpty(),
    body('frequency').isIn(['daily', 'weekly', 'monthly']),
    body('format').isIn(['csv', 'excel', 'pdf']),
    body('recipients').isArray({ min: 1 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { reportType, frequency, format, recipients, filters } = req.body;

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO scheduled_reports (tenant_id, report_type, frequency, format, recipients, filters, created_by)
             VALUES (@tenantId, @reportType, @frequency, @format, @recipients, @filters, @createdBy)
             RETURNING id`
          : `INSERT INTO scheduled_reports (tenant_id, report_type, frequency, format, recipients, filters, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @reportType, @frequency, @format, @recipients, @filters, @createdBy)`,
        {
          tenantId: req.user!.tenantId,
          reportType,
          frequency,
          format,
          recipients: JSON.stringify(recipients),
          filters: filters ? JSON.stringify(filters) : null,
          createdBy: req.user!.id,
        }
      );

      const report = await DatabaseService.query<any>(
        'SELECT * FROM scheduled_reports WHERE id = @id',
        { id: result[0].id }
      );

      res.status(201).json({ success: true, data: report[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/reports/scheduled/:id
 * @desc Delete a scheduled report
 */
router.delete('/scheduled/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const reportId = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      `UPDATE scheduled_reports SET is_active = ${db.bool(false)} WHERE id = @reportId AND tenant_id = @tenantId`,
      { reportId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Scheduled report deleted' });
  } catch (error) {
    next(error);
  }
});

// Helper function to generate report data
async function generateReportData(
  reportType: string,
  tenantId: number,
  filters: any
): Promise<any> {
  const { startDate, endDate, courseId, userId, organizationId } = filters || {};
  
  const dateFilter = startDate && endDate
    ? 'AND created_at BETWEEN @startDate AND @endDate'
    : startDate
    ? 'AND created_at >= @startDate'
    : '';

  switch (reportType) {
    case 'user_progress':
      return DatabaseService.query<any>(
        `SELECT u.id, u.display_name, u.email, u.role,
                e.name as enterprise,
                COUNT(DISTINCT en.course_id) as enrolled_courses,
                AVG(en.progress_percent) as avg_progress,
                SUM(CASE WHEN en.progress_percent >= 100 THEN 1 ELSE 0 END) as completed_courses
         FROM users u
         LEFT JOIN enterprises e ON u.enterprise_id = e.id
         LEFT JOIN enrollments en ON u.id = en.user_id
         WHERE u.tenant_id = @tenantId ${dateFilter.replace('created_at', 'u.created_at')}
         GROUP BY u.id, u.display_name, u.email, u.role, e.name
         ORDER BY avg_progress DESC`,
        { tenantId, startDate, endDate }
      );

    case 'course_completion':
      return DatabaseService.query<any>(
        `SELECT c.id, c.title, c.category,
                COUNT(e.id) as total_enrollments,
                SUM(CASE WHEN e.progress_percent >= 100 THEN 1 ELSE 0 END) as completions,
                AVG(e.progress_percent) as avg_progress,
                AVG(${db.diffDays('e.enrolled_at', 'e.completed_at')}) as avg_days_to_complete
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.tenant_id = @tenantId ${courseId ? 'AND c.id = @courseId' : ''} ${dateFilter}
         GROUP BY c.id, c.title, c.category
         ORDER BY completions DESC`,
        { tenantId, courseId, startDate, endDate }
      );

    case 'quiz_performance':
      return DatabaseService.query<any>(
        `SELECT q.id, q.title, c.title as course_title,
                COUNT(qa.id) as total_attempts,
                AVG(qa.score) as avg_score,
                MIN(qa.score) as min_score,
                MAX(qa.score) as max_score,
                SUM(CASE WHEN qa.passed = ${db.bool(true)} THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(qa.id), 0) as pass_rate
         FROM quizzes q
         LEFT JOIN lessons l ON q.lesson_id = l.id
         LEFT JOIN modules m ON l.module_id = m.id
         LEFT JOIN courses c ON m.course_id = c.id
         LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id
         WHERE q.tenant_id = @tenantId ${dateFilter.replace('created_at', 'q.created_at')}
         GROUP BY q.id, q.title, c.title
         ORDER BY total_attempts DESC`,
        { tenantId, startDate, endDate }
      );

    case 'enrollment_summary':
      return DatabaseService.query<any>(
        `SELECT CAST(e.enrolled_at AS DATE) as date,
                COUNT(*) as enrollments,
                COUNT(DISTINCT e.user_id) as unique_users,
                COUNT(DISTINCT e.course_id) as courses
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         WHERE c.tenant_id = @tenantId ${dateFilter.replace('created_at', 'e.enrolled_at')}
         GROUP BY CAST(e.enrolled_at AS DATE)
         ORDER BY date`,
        { tenantId, startDate, endDate }
      );

    case 'badge_awards':
      return DatabaseService.query<any>(
        `SELECT b.name as badge_name, b.badge_type,
                COUNT(ab.id) as times_awarded,
                COUNT(DISTINCT ab.user_id) as unique_recipients
         FROM badges b
         LEFT JOIN user_badges ab ON b.id = ab.badge_id
         WHERE b.tenant_id = @tenantId ${dateFilter.replace('created_at', 'ab.awarded_at')}
         GROUP BY b.id, b.name, b.badge_type
         ORDER BY times_awarded DESC`,
        { tenantId, startDate, endDate }
      );

    case 'certificate_issuance':
      return DatabaseService.query<any>(
        `SELECT c.serial, u.display_name as user_name, u.email,
                co.title as course_title, c.issued_at
         FROM certificates c
         JOIN users u ON c.user_id = u.id
         JOIN courses co ON c.course_id = co.id
         WHERE c.tenant_id = @tenantId ${dateFilter.replace('created_at', 'c.issued_at')}
         ORDER BY c.issued_at DESC`,
        { tenantId, startDate, endDate }
      );

    case 'activity_log':
      return DatabaseService.query<any>(
        IS_PG
          ? `SELECT al.action, al.entity, al.entity_id,
                    u.display_name as user_name, al.created_at
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.tenant_id = @tenantId ${dateFilter.replace('created_at', 'al.created_at')}
             ORDER BY al.created_at DESC
             LIMIT 1000`
          : `SELECT TOP 1000 al.action, al.entity, al.entity_id,
                    u.display_name as user_name, al.created_at
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.tenant_id = @tenantId ${dateFilter.replace('created_at', 'al.created_at')}
             ORDER BY al.created_at DESC`,
        { tenantId, startDate, endDate }
      );

    case 'organization_overview':
      return DatabaseService.query<any>(
        `SELECT e.name as enterprise, d.name as direction, s.name as service,
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
         ORDER BY e.name, d.name, s.name`,
        { tenantId }
      );

    default:
      return [];
  }
}

// Convert data to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
      return value;
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

// Generate Excel file
async function generateExcel(reportType: string, data: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
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
async function generatePDF(reportType: string, data: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });

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
    } else {
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
          const value = row[header as keyof typeof row];
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

function formatReportTitle(type: string): string {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Report';
}

function formatHeader(header: string): string {
  return header.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default router;
