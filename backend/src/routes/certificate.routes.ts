import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
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
 * @route GET /api/v1/certificates
 * @desc List certificates
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.query.userId as string;
    const courseId = req.query.courseId as string;

    let query = `SELECT c.*, u.display_name as user_name, u.email as user_email,
                        co.title as course_title, f.storage_key as pdf_url
                 FROM certificates c
                 JOIN users u ON c.user_id = u.id
                 JOIN courses co ON c.course_id = co.id
                 LEFT JOIN file_assets f ON c.pdf_file_id = f.id
                 WHERE c.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    if (userId) {
      query += ' AND c.user_id = @userId';
      params.userId = parseInt(userId, 10);
    }
    if (courseId) {
      query += ' AND c.course_id = @courseId';
      params.courseId = parseInt(courseId, 10);
    }

    // Non-admins can only see their own certificates
    if (req.user!.role !== 'admin' && req.user!.role !== 'director') {
      query += ' AND c.user_id = @currentUserId';
      params.currentUserId = req.user!.id;
    }

    query += ' ORDER BY c.issued_at DESC';

    const certificates = await DatabaseService.query<any>(query, params);
    res.json({ success: true, data: certificates });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/certificates/my
 * @desc Certificates owned by the current user (learner-facing certificates page)
 */
router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const certificates = await DatabaseService.query<any>(
      `SELECT c.id, c.course_id, co.title as course_title, c.serial, c.issued_at, c.expires_at
       FROM certificates c
       JOIN courses co ON c.course_id = co.id
       WHERE c.tenant_id = @tenantId AND c.user_id = @userId
       ORDER BY c.issued_at DESC`,
      { tenantId: req.user!.tenantId, userId: req.user!.id }
    );

    const now = Date.now();
    res.json({
      success: true,
      data: certificates.map((c: any) => ({
        id: c.id,
        courseId: c.course_id,
        courseTitle: c.course_title,
        serialNumber: c.serial,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        status: c.expires_at && new Date(c.expires_at).getTime() < now ? 'expired' : 'valid',
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/certificates/expiring-soon
 * @desc List certificates expiring within the next N days (default 30)
 */
router.get('/expiring-soon', authenticate, authorize('admin', 'director', 'manager'), async (req: AuthRequest, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days as string, 10) || 30, 365);

    const certificates = await DatabaseService.query<any>(
      `SELECT c.id, c.serial, c.expires_at, u.id as user_id, u.display_name as user_name, u.email as user_email,
              co.title as course_title
       FROM certificates c
       JOIN users u ON c.user_id = u.id
       JOIN courses co ON c.course_id = co.id
       WHERE c.tenant_id = @tenantId
         AND c.expires_at IS NOT NULL
         AND c.expires_at BETWEEN SYSUTCDATETIME() AND DATEADD(day, @days, SYSUTCDATETIME())
       ORDER BY c.expires_at ASC`,
      { tenantId: req.user!.tenantId, days }
    );

    res.json({ success: true, data: certificates });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/certificates/:id
 * @desc Get certificate by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const certificateId = parseInt(req.params.id, 10);

    const certificates = await DatabaseService.query<any>(
      `SELECT c.*, u.display_name as user_name, u.email as user_email,
              co.title as course_title, f.storage_key as pdf_url
       FROM certificates c
       JOIN users u ON c.user_id = u.id
       JOIN courses co ON c.course_id = co.id
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.id = @certificateId AND c.tenant_id = @tenantId`,
      { certificateId, tenantId: req.user!.tenantId }
    );

    if (certificates.length === 0) {
      throw NotFoundError('Certificate');
    }

    res.json({ success: true, data: certificates[0] });
  } catch (error) {
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

    const certificates = await DatabaseService.query<any>(
      `SELECT c.serial, c.issued_at, u.display_name as user_name,
              co.title as course_title, t.name as tenant_name
       FROM certificates c
       JOIN users u ON c.user_id = u.id
       JOIN courses co ON c.course_id = co.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.serial = @serial`,
      { serial }
    );

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
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/certificates/generate
 * @desc Generate certificate for a user who completed a course
 */
router.post(
  '/generate',
  authenticate,
  authorize('admin', 'director', 'manager'),
  [
    body('userId').isInt(),
    body('courseId').isInt(),
    body('validityMonths').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req: AuthRequest, res, next) => {
    try {
      validate(req);
      const { userId, courseId, validityMonths } = req.body;

      // Check if certificate already exists
      const existing = await DatabaseService.query<any>(
        'SELECT id FROM certificates WHERE user_id = @userId AND course_id = @courseId',
        { userId, courseId }
      );

      if (existing.length > 0) {
        throw BadRequestError('Certificate already exists for this user and course');
      }

      // Get user and course info
      const users = await DatabaseService.query<any>(
        'SELECT display_name, email FROM users WHERE id = @userId AND tenant_id = @tenantId',
        { userId, tenantId: req.user!.tenantId }
      );

      if (users.length === 0) {
        throw NotFoundError('User');
      }

      const courses = await DatabaseService.query<any>(
        'SELECT title FROM courses WHERE id = @courseId AND tenant_id = @tenantId',
        { courseId, tenantId: req.user!.tenantId }
      );

      if (courses.length === 0) {
        throw NotFoundError('Course');
      }

      // Create certificate record (serial will be generated by trigger)
      const result = await DatabaseService.query<{ id: number }>(
        `INSERT INTO certificates (tenant_id, user_id, course_id, serial, validity_months, expires_at)
         OUTPUT INSERTED.id
         VALUES (
           @tenantId, @userId, @courseId, '', @validityMonths,
           CASE WHEN @validityMonths IS NOT NULL THEN DATEADD(month, @validityMonths, SYSUTCDATETIME()) ELSE NULL END
         )`,
        {
          tenantId: req.user!.tenantId,
          userId,
          courseId,
          validityMonths: validityMonths || null,
        }
      );

      // Get the generated serial
      const cert = await DatabaseService.query<any>(
        'SELECT * FROM certificates WHERE id = @id',
        { id: result[0].id }
      );

      // Generate PDF certificate
      const pdfPath = await generateCertificatePDF(
        cert[0].serial,
        users[0].display_name,
        courses[0].title,
        cert[0].issued_at
      );

      // Store the PDF as file asset
      const fileResult = await DatabaseService.query<{ id: number }>(
        `INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @filename, 'application/pdf', @storageKey, @createdBy)`,
        {
          tenantId: req.user!.tenantId,
          filename: `certificate_${cert[0].serial}.pdf`,
          storageKey: pdfPath,
          createdBy: req.user!.id,
        }
      );

      // Update certificate with PDF file ID
      await DatabaseService.execute(
        'UPDATE certificates SET pdf_file_id = @fileId WHERE id = @id',
        { fileId: fileResult[0].id, id: cert[0].id }
      );

      const certificate = await DatabaseService.query<any>(
        `SELECT c.*, u.display_name as user_name, co.title as course_title
         FROM certificates c
         JOIN users u ON c.user_id = u.id
         JOIN courses co ON c.course_id = co.id
         WHERE c.id = @id`,
        { id: cert[0].id }
      );

      res.status(201).json({ success: true, data: certificate[0] });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/certificates/:id/download
 * @desc Download certificate PDF
 */
router.get('/:id/download', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const certificateId = parseInt(req.params.id, 10);

    const certificates = await DatabaseService.query<any>(
      `SELECT c.*, f.storage_key, f.filename
       FROM certificates c
       LEFT JOIN file_assets f ON c.pdf_file_id = f.id
       WHERE c.id = @certificateId AND c.tenant_id = @tenantId`,
      { certificateId, tenantId: req.user!.tenantId }
    );

    if (certificates.length === 0) {
      throw NotFoundError('Certificate');
    }

    if (!certificates[0].storage_key) {
      throw BadRequestError('Certificate PDF not generated');
    }

    const filePath = path.join(config.uploadDir, certificates[0].storage_key);
    
    if (!fs.existsSync(filePath)) {
      throw NotFoundError('Certificate file');
    }

    res.download(filePath, certificates[0].filename);
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/certificates/:id
 * @desc Delete certificate
 */
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    const certificateId = parseInt(req.params.id, 10);
    await DatabaseService.execute(
      'DELETE FROM certificates WHERE id = @certificateId AND tenant_id = @tenantId',
      { certificateId, tenantId: req.user!.tenantId }
    );
    res.json({ success: true, message: 'Certificate deleted' });
  } catch (error) {
    next(error);
  }
});

// Helper function to generate PDF certificate
async function generateCertificatePDF(
  serial: string,
  userName: string,
  courseTitle: string,
  issuedAt: Date
): Promise<string> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape' });
  
  const filename = `certificates/${serial}.pdf`;
  const fullPath = path.join(config.uploadDir, filename);
  
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = fs.createWriteStream(fullPath);
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
  const verifyUrl = `${config.certificateVerifyUrl}/${serial}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 80 });
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

export default router;
