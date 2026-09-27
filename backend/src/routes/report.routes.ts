import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { CategoryService, CategoryLanguage } from '../services/category.service';
import { getTenantTimezone, shiftDayKey } from '../utils/tenantTime';
import {
  ReportColumn,
  ReportLanguage,
  formatCell,
  periodLabel,
  presentRows,
  reportColumns,
  reportTitle,
  text,
} from '../utils/reportFormatting';
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
    body('language').optional().isIn(['fr', 'en']),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { reportType, format, startDate, endDate, filters, language } = req.body;
      const tenantId = req.user!.tenantId;

      const lang: ReportLanguage = language === 'en' ? 'en' : 'fr';
      const [rawRows, timeZone] = await Promise.all([
        generateReportData(reportType, tenantId, { startDate, endDate, ...filters }, lang),
        getTenantTimezone(tenantId),
      ]);
      const report: PresentedReport = {
        reportType,
        language: lang,
        timeZone,
        title: reportTitle(reportType, lang),
        period: periodLabel(lang, startDate, endDate),
        generatedAt: new Date(),
        columns: reportColumns(rawRows, lang),
        rows: presentRows(rawRows, lang),
      };
      const fileBase = `${reportType}_${new Date().toISOString().slice(0, 10)}`;

      switch (format) {
        case 'json':
          // `data` stays the row array; `meta` carries what the on-screen preview needs.
          res.json({
            success: true,
            data: report.rows,
            meta: {
              title: report.title,
              period: report.period,
              generatedAt: report.generatedAt,
              timeZone,
              language: lang,
              columns: report.columns,
              rowCount: report.rows.length,
            },
          });
          break;
        case 'csv':
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
          res.send(toCSV(report));
          break;
        case 'excel':
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
          res.send(await toExcel(report));
          break;
        case 'pdf':
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
          res.send(await toPDF(report));
          break;
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
  filters: any,
  language: CategoryLanguage = 'fr'
): Promise<any> {
  const { startDate, endDate: lastDay, courseId, userId, organizationId } = filters || {};
  // The end date is inclusive: a timestamp on that day must match, so compare with
  // "< the next day" instead of BETWEEN (which stopped at midnight and dropped the day).
  const endDate = lastDay ? shiftDayKey(String(lastDay).slice(0, 10), 1) : undefined;
  const dateFilter = (column: string) =>
    [startDate ? `AND ${column} >= @startDate` : '', endDate ? `AND ${column} < @endDate` : ''].join(' ');

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
         WHERE u.tenant_id = @tenantId AND u.deleted_at IS NULL ${dateFilter('u.created_at')}
         GROUP BY u.id, u.display_name, u.email, u.role, e.name
         ORDER BY CASE WHEN AVG(en.progress_percent) IS NULL THEN 1 ELSE 0 END, avg_progress DESC`,
        { tenantId, startDate, endDate }
      );

    case 'course_completion': {
      const [rows, categoryLabels] = await Promise.all([DatabaseService.query<any>(
        `SELECT c.id, c.title, c.category,
                COUNT(e.id) as total_enrollments,
                SUM(CASE WHEN e.progress_percent >= 100 THEN 1 ELSE 0 END) as completions,
                AVG(e.progress_percent) as avg_progress,
                AVG(${db.diffDays('e.enrolled_at', 'e.completed_at')}) as avg_days_to_complete
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.tenant_id = @tenantId ${courseId ? 'AND c.id = @courseId' : ''} ${dateFilter('c.created_at')}
         GROUP BY c.id, c.title, c.category
         ORDER BY completions DESC`,
        { tenantId, courseId, startDate, endDate }
      ), CategoryService.labels(tenantId, language)]);
      // Exports show the category label, not the stored code ("hr" -> "Ressources humaines").
      return rows.map((r: any) => ({ ...r, category: r.category ? categoryLabels.get(r.category) ?? r.category : null }));
    }

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
         WHERE q.tenant_id = @tenantId ${dateFilter('q.created_at')}
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
         WHERE c.tenant_id = @tenantId ${dateFilter('e.enrolled_at')}
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
         WHERE b.tenant_id = @tenantId ${dateFilter('ab.awarded_at')}
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
         WHERE c.tenant_id = @tenantId ${dateFilter('c.issued_at')}
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
             WHERE al.tenant_id = @tenantId ${dateFilter('al.created_at')}
             ORDER BY al.created_at DESC
             LIMIT 1000`
          : `SELECT TOP 1000 al.action, al.entity, al.entity_id,
                    u.display_name as user_name, al.created_at
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.tenant_id = @tenantId ${dateFilter('al.created_at')}
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

interface PresentedReport {
  reportType: string;
  language: ReportLanguage;
  timeZone: string;
  title: string;
  period: string;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: any[];
}

function generatedLine(report: PresentedReport): string {
  return `${text('generatedOn', report.language)} ${formatCell(report.generatedAt, 'datetime', report.language, report.timeZone)}`;
}

/** RFC 4180 CSV with a UTF-8 BOM, so Excel opens accented text correctly. */
function toCSV(report: PresentedReport): string {
  const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [
    report.columns.map((c) => escape(c.label)).join(','),
    ...report.rows.map((row) =>
      report.columns.map((c) => escape(formatCell(row[c.key], c.kind, report.language, report.timeZone))).join(',')
    ),
  ];
  return '﻿' + lines.join('\r\n');
}

async function toExcel(report: PresentedReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // Sheet names are limited to 31 characters and a few forbidden symbols.
  const worksheet = workbook.addWorksheet(report.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));

  worksheet.addRow([report.title]).font = { bold: true, size: 14 };
  worksheet.addRow([`${text('period', report.language)} : ${report.period} — ${generatedLine(report)}`]).font = { italic: true, color: { argb: 'FF666666' } };
  worksheet.addRow([]);

  if (report.rows.length === 0) {
    worksheet.addRow([text('noData', report.language)]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const header = worksheet.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };

  for (const row of report.rows) {
    worksheet.addRow(report.columns.map((c) => {
      const value = row[c.key];
      if (value === null || value === undefined) return null;
      if (c.kind === 'date' || c.kind === 'datetime') {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date;
      }
      return value;
    }));
  }

  report.columns.forEach((c, index) => {
    const column = worksheet.getColumn(index + 1);
    if (c.kind === 'percent') column.numFmt = report.language === 'fr' ? '0.0" %"' : '0.0"%"';
    // Both languages use day-first dates (fr-FR and en-GB).
    if (c.kind === 'date') column.numFmt = 'dd/mm/yyyy';
    if (c.kind === 'datetime') column.numFmt = 'dd/mm/yyyy hh:mm';
    const longest = Math.max(
      c.label.length,
      ...report.rows.slice(0, 200).map((r) => formatCell(r[c.key], c.kind, report.language, report.timeZone).length)
    );
    column.width = Math.min(Math.max(longest + 2, 10), 50);
  });
  worksheet.views = [{ state: 'frozen', ySplit: 4 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const PDF_MAX_ROWS = 500;

/** Table layout with every column, landscape when there are many, repeated header on each page. */
async function toPDF(report: PresentedReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const landscape = report.columns.length > 5;
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: landscape ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const tableWidth = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    doc.fontSize(18).font('Helvetica-Bold').text(report.title, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#555555')
      .text(`${text('period', report.language)} : ${report.period}  ·  ${generatedLine(report)}  ·  ${report.rows.length} ${text('rows', report.language)}`, { align: 'center' });
    doc.fillColor('black').moveDown(1.2);

    if (report.rows.length === 0) {
      doc.fontSize(11).text(text('noData', report.language), { align: 'center' });
      doc.end();
      return;
    }

    // Column widths proportional to content length (capped), numbers kept narrow.
    const weights = report.columns.map((c) => {
      const sample = report.rows.slice(0, 100).map((r) => formatCell(r[c.key], c.kind, report.language, report.timeZone).length);
      return Math.min(Math.max(c.label.length, ...sample, 4), 40);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * tableWidth);
    const rowHeight = 16;
    const padding = 3;

    const drawRow = (cells: string[], y: number, bold: boolean, shaded: boolean) => {
      if (shaded) doc.rect(left, y, tableWidth, rowHeight).fill(bold ? '#1A365D' : '#F3F5F9');
      doc.fillColor(bold ? 'white' : 'black').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = left;
      cells.forEach((cell, index) => {
        const alignRight = ['number', 'percent'].includes(report.columns[index].kind);
        doc.text(cell, x + padding, y + 4, {
          width: widths[index] - padding * 2,
          height: rowHeight - 4,
          lineBreak: false,
          ellipsis: true,
          align: alignRight ? 'right' : 'left',
        });
        x += widths[index];
      });
      doc.fillColor('black');
    };

    let y = doc.y;
    const drawHeader = () => {
      drawRow(report.columns.map((c) => c.label), y, true, true);
      y += rowHeight;
    };
    drawHeader();

    report.rows.slice(0, PDF_MAX_ROWS).forEach((row, index) => {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      drawRow(report.columns.map((c) => formatCell(row[c.key], c.kind, report.language, report.timeZone)), y, false, index % 2 === 1);
      y += rowHeight;
    });

    if (report.rows.length > PDF_MAX_ROWS) {
      doc.font('Helvetica-Oblique').fontSize(9).text(
        `${report.rows.length - PDF_MAX_ROWS} ${text('truncated', report.language)}`,
        left, Math.min(y + 8, bottom - 12), { width: tableWidth }
      );
    }

    doc.end();
  });
}

export default router;
