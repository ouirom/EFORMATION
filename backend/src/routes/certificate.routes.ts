import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError } from '../middleware/error.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { config } from '../config';
import { db, IS_PG } from '../database/db-helpers';
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
router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.query.userId as string;
  const courseId = req.query.courseId as string;

  let query = `SELECT c.id, c.user_id, c.course_id, c.template_id, c.serial, c.issued_at, c.expires_at, c.revoked_at,
                      u.display_name as user_name, co.title as course_name
               FROM certificates c
               JOIN users u ON c.user_id = u.id
               JOIN courses co ON c.course_id = co.id
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
  res.json({
    success: true,
    data: certificates.map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      courseId: c.course_id,
      templateId: c.template_id,
      certificateNumber: c.serial,
      issuedAt: c.issued_at,
      expiresAt: c.expires_at,
      verificationUrl: `${config.certificateVerifyUrl}/${c.serial}`,
      status: c.revoked_at ? 'revoked' : 'issued',
      userName: c.user_name,
      courseName: c.course_name,
    })),
  });
}));

/**
 * @route GET /api/v1/certificates/my
 * @desc Certificates owned by the current user (learner-facing certificates page)
 */
router.get('/my', authenticate, asyncHandler(async (req: AuthRequest, res) => {
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
}));

/**
 * @route GET /api/v1/certificates/expiring-soon
 * @desc List certificates expiring within the next N days (default 30)
 */
router.get('/expiring-soon', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(parseInt(req.query.days as string, 10) || 30, 365);

  const certificates = await DatabaseService.query<any>(
    `SELECT c.id, c.serial, c.expires_at, u.id as user_id, u.display_name as user_name, u.email as user_email,
            co.title as course_title
     FROM certificates c
     JOIN users u ON c.user_id = u.id
     JOIN courses co ON c.course_id = co.id
     WHERE c.tenant_id = @tenantId
       AND c.expires_at IS NOT NULL
       AND c.expires_at BETWEEN ${db.now()} AND ${db.dateAdd('day', '@days', db.now())}
     ORDER BY c.expires_at ASC`,
    { tenantId: req.user!.tenantId, days }
  );

  res.json({ success: true, data: certificates });
}));

// ==================== CERTIFICATE TEMPLATES ====================

/**
 * @route GET /api/v1/certificates/templates
 * @desc List certificate templates for the current tenant
 */
router.get('/templates', authenticate, authorize('admin', 'director', 'manager'), asyncHandler(async (req: AuthRequest, res) => {
  const templates = await DatabaseService.query<any>(
    `SELECT id, name, description, template_html, is_default
     FROM certificate_templates WHERE tenant_id = @tenantId ORDER BY name`,
    { tenantId: req.user!.tenantId }
  );

  res.json({
    success: true,
    data: templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      templateHtml: t.template_html,
      isDefault: t.is_default,
    })),
  });
}));

/**
 * @route POST /api/v1/certificates/templates
 * @desc Create a certificate template
 */
router.post(
  '/templates',
  authenticate,
  authorize('admin', 'director'),
  [body('name').notEmpty().trim(), body('description').optional({ nullable: true }).trim(), body('templateHtml').optional({ nullable: true })],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const { name, description, templateHtml, isDefault } = req.body;
    const tenantId = req.user!.tenantId;

    // Only one default template per tenant
    if (isDefault) {
      await DatabaseService.execute(
        `UPDATE certificate_templates SET is_default = ${db.bool(false)} WHERE tenant_id = @tenantId`,
        { tenantId }
      );
    }

    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO certificate_templates (tenant_id, name, description, template_html, is_default)
           VALUES (@tenantId, @name, @description, @templateHtml, @isDefault)
           RETURNING id`
        : `INSERT INTO certificate_templates (tenant_id, name, description, template_html, is_default)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @name, @description, @templateHtml, @isDefault)`,
      { tenantId, name, description: description || null, templateHtml: templateHtml || null, isDefault: !!isDefault }
    );

    res.status(201).json({
      success: true,
      data: { id: result[0].id, name, description, templateHtml, isDefault: !!isDefault },
    });
  })
);

/**
 * @route PUT /api/v1/certificates/templates/:id
 * @desc Update a certificate template
 */
router.put(
  '/templates/:id',
  authenticate,
  authorize('admin', 'director'),
  [body('name').optional().trim(), body('description').optional({ nullable: true }).trim(), body('templateHtml').optional({ nullable: true })],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const templateId = parseInt(req.params.id, 10);
    const tenantId = req.user!.tenantId;
    const { name, description, templateHtml, isDefault } = req.body;

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM certificate_templates WHERE id = @id AND tenant_id = @tenantId',
      { id: templateId, tenantId }
    );
    if (existing.length === 0) {
      throw NotFoundError('Certificate template');
    }

    if (isDefault) {
      await DatabaseService.execute(
        `UPDATE certificate_templates SET is_default = ${db.bool(false)} WHERE tenant_id = @tenantId`,
        { tenantId }
      );
    }

    const updateFields: string[] = [];
    const params: Record<string, any> = { id: templateId, tenantId };
    if (name !== undefined) { updateFields.push('name = @name'); params.name = name; }
    if (description !== undefined) { updateFields.push('description = @description'); params.description = description; }
    if (templateHtml !== undefined) { updateFields.push('template_html = @templateHtml'); params.templateHtml = templateHtml; }
    if (isDefault !== undefined) { updateFields.push('is_default = @isDefault'); params.isDefault = !!isDefault; }

    if (updateFields.length > 0) {
      await DatabaseService.execute(
        `UPDATE certificate_templates SET ${updateFields.join(', ')}, updated_at = ${db.now()}
         WHERE id = @id AND tenant_id = @tenantId`,
        params
      );
    }

    const updated = await DatabaseService.query<any>(
      'SELECT id, name, description, template_html, is_default FROM certificate_templates WHERE id = @id',
      { id: templateId }
    );

    res.json({
      success: true,
      data: {
        id: updated[0].id,
        name: updated[0].name,
        description: updated[0].description,
        templateHtml: updated[0].template_html,
        isDefault: updated[0].is_default,
      },
    });
  })
);

/**
 * @route DELETE /api/v1/certificates/templates/:id
 * @desc Delete a certificate template (the default template cannot be deleted)
 */
router.delete('/templates/:id', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const templateId = parseInt(req.params.id, 10);
  const tenantId = req.user!.tenantId;

  const existing = await DatabaseService.query<{ id: number; is_default: boolean }>(
    'SELECT id, is_default FROM certificate_templates WHERE id = @id AND tenant_id = @tenantId',
    { id: templateId, tenantId }
  );
  if (existing.length === 0) {
    throw NotFoundError('Certificate template');
  }
  if (existing[0].is_default) {
    throw BadRequestError('The default template cannot be deleted');
  }

  await DatabaseService.execute(
    'DELETE FROM certificate_templates WHERE id = @id AND tenant_id = @tenantId',
    { id: templateId, tenantId }
  );

  res.json({ success: true, message: 'Template deleted' });
}));

// ==================== WATERMARKS ====================

/**
 * @route GET /api/v1/certificates/watermarks
 * @desc List watermark images for the tenant
 */
router.get('/watermarks', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const watermarks = await DatabaseService.query<any>(
    `SELECT cw.id, cw.name, cw.is_default, cw.created_at, fa.storage_key, fa.mime_type
     FROM certificate_watermarks cw
     JOIN file_assets fa ON cw.file_id = fa.id
     WHERE cw.tenant_id = @tenantId
     ORDER BY cw.created_at DESC`,
    { tenantId: req.user!.tenantId }
  );

  res.json({
    success: true,
    data: watermarks.map((w: any) => ({
      id: w.id,
      name: w.name,
      isDefault: w.is_default,
      storageKey: w.storage_key,
      mimeType: w.mime_type,
      createdAt: w.created_at,
    })),
  });
}));

/**
 * @route POST /api/v1/certificates/watermarks
 * @desc Register an already-uploaded image (via POST /files/upload) as a watermark
 */
router.post(
  '/watermarks',
  authenticate,
  authorize('admin', 'director'),
  [body('fileId').isInt(), body('name').optional({ nullable: true }).trim(), body('isDefault').optional().isBoolean()],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const tenantId = req.user!.tenantId;

    const file = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId',
      { fileId: req.body.fileId, tenantId }
    );
    if (file.length === 0) throw NotFoundError('File');

    if (req.body.isDefault) {
      await DatabaseService.execute(
        `UPDATE certificate_watermarks SET is_default = ${db.bool(false)} WHERE tenant_id = @tenantId`,
        { tenantId }
      );
    }

    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO certificate_watermarks (tenant_id, file_id, name, is_default, created_by)
           VALUES (@tenantId, @fileId, @name, @isDefault, @createdBy)
           RETURNING id`
        : `INSERT INTO certificate_watermarks (tenant_id, file_id, name, is_default, created_by)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @fileId, @name, @isDefault, @createdBy)`,
      {
        tenantId,
        fileId: req.body.fileId,
        name: req.body.name || null,
        isDefault: !!req.body.isDefault,
        createdBy: req.user!.id,
      }
    );

    const watermark = await DatabaseService.query<any>(
      `SELECT cw.id, cw.name, cw.is_default, cw.created_at, fa.storage_key, fa.mime_type
       FROM certificate_watermarks cw
       JOIN file_assets fa ON cw.file_id = fa.id
       WHERE cw.id = @id`,
      { id: result[0].id }
    );

    res.status(201).json({
      success: true,
      data: {
        id: watermark[0].id,
        name: watermark[0].name,
        isDefault: watermark[0].is_default,
        storageKey: watermark[0].storage_key,
        mimeType: watermark[0].mime_type,
        createdAt: watermark[0].created_at,
      },
    });
  })
);

/**
 * @route PUT /api/v1/certificates/watermarks/:id
 * @desc Rename a watermark and/or set it as the default
 */
router.put(
  '/watermarks/:id',
  authenticate,
  authorize('admin', 'director'),
  [body('name').optional({ nullable: true }).trim(), body('isDefault').optional().isBoolean()],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const watermarkId = parseInt(req.params.id, 10);
    const tenantId = req.user!.tenantId;

    const existing = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId',
      { id: watermarkId, tenantId }
    );
    if (existing.length === 0) throw NotFoundError('Watermark');

    if (req.body.isDefault) {
      await DatabaseService.execute(
        `UPDATE certificate_watermarks SET is_default = ${db.bool(false)} WHERE tenant_id = @tenantId`,
        { tenantId }
      );
    }

    const updateFields: string[] = [];
    const params: Record<string, any> = { id: watermarkId, tenantId };
    if (req.body.name !== undefined) { updateFields.push('name = @name'); params.name = req.body.name; }
    if (req.body.isDefault !== undefined) { updateFields.push('is_default = @isDefault'); params.isDefault = !!req.body.isDefault; }

    if (updateFields.length > 0) {
      await DatabaseService.execute(
        `UPDATE certificate_watermarks SET ${updateFields.join(', ')} WHERE id = @id AND tenant_id = @tenantId`,
        params
      );
    }

    const watermark = await DatabaseService.query<any>(
      `SELECT cw.id, cw.name, cw.is_default, cw.created_at, fa.storage_key, fa.mime_type
       FROM certificate_watermarks cw
       JOIN file_assets fa ON cw.file_id = fa.id
       WHERE cw.id = @id`,
      { id: watermarkId }
    );

    res.json({
      success: true,
      data: {
        id: watermark[0].id,
        name: watermark[0].name,
        isDefault: watermark[0].is_default,
        storageKey: watermark[0].storage_key,
        mimeType: watermark[0].mime_type,
        createdAt: watermark[0].created_at,
      },
    });
  })
);

/**
 * @route DELETE /api/v1/certificates/watermarks/:id
 * @desc Delete a watermark (the default watermark cannot be deleted). Only removes
 *       the certificate_watermarks row -- the underlying file_assets row/file on
 *       disk is left in place, same "light" delete already used elsewhere.
 */
router.delete('/watermarks/:id', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const watermarkId = parseInt(req.params.id, 10);
  const tenantId = req.user!.tenantId;

  const existing = await DatabaseService.query<{ id: number; is_default: boolean }>(
    'SELECT id, is_default FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId',
    { id: watermarkId, tenantId }
  );
  if (existing.length === 0) {
    throw NotFoundError('Watermark');
  }
  if (existing[0].is_default) {
    throw BadRequestError('The default watermark cannot be deleted');
  }

  await DatabaseService.execute(
    'DELETE FROM certificate_watermarks WHERE id = @id AND tenant_id = @tenantId',
    { id: watermarkId, tenantId }
  );

  res.json({ success: true, message: 'Watermark deleted' });
}));

/**
 * @route PUT /api/v1/certificates/:id/revoke
 * @desc Revoke an issued certificate
 */
router.put('/:id/revoke', authenticate, authorize('admin', 'director'), asyncHandler(async (req: AuthRequest, res) => {
  const certificateId = parseInt(req.params.id, 10);
  const tenantId = req.user!.tenantId;

  const existing = await DatabaseService.query<{ id: number }>(
    'SELECT id FROM certificates WHERE id = @id AND tenant_id = @tenantId',
    { id: certificateId, tenantId }
  );
  if (existing.length === 0) {
    throw NotFoundError('Certificate');
  }

  await DatabaseService.execute(
    `UPDATE certificates SET revoked_at = ${db.now()}, revoked_by = @revokedBy
     WHERE id = @id AND tenant_id = @tenantId AND revoked_at IS NULL`,
    { id: certificateId, tenantId, revokedBy: req.user!.id }
  );

  res.json({ success: true, message: 'Certificate revoked' });
}));

/**
 * @route GET /api/v1/certificates/:id
 * @desc Get certificate by ID
 */
router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res) => {
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
}));

/**
 * @route GET /api/v1/certificates/verify/:serial
 * @desc Verify certificate by serial number (public)
 */
router.get('/verify/:serial', asyncHandler(async (req, res) => {
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
}));

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
    body('templateId').optional({ nullable: true }).isInt(),
  ],
  asyncHandler(async (req: AuthRequest, res) => {
    validate(req);
    const { userId, courseId, validityMonths } = req.body;
    let templateId = req.body.templateId || null;

    if (!templateId) {
      const defaultTemplate = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `SELECT id FROM certificate_templates WHERE tenant_id = @tenantId AND is_default = ${db.bool(true)} LIMIT 1`
          : `SELECT TOP 1 id FROM certificate_templates WHERE tenant_id = @tenantId AND is_default = ${db.bool(true)}`,
        { tenantId: req.user!.tenantId }
      );
      templateId = defaultTemplate[0]?.id || null;
    }

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

    // Create certificate record. Without an
    // explicit validity, the organization's default validity (in days) applies. The
    // expiry is computed here rather than in SQL: Postgres can't type a bound param
    // used only in `@x IS NOT NULL` / `@x * interval`, which made every manual
    // issuance fail there.
    const { certificateValidity: defaultValidityDays } = await TenantSettingsService.get(req.user!.tenantId);
    const expiresAt = new Date();
    if (validityMonths) expiresAt.setUTCMonth(expiresAt.getUTCMonth() + Number(validityMonths));
    else expiresAt.setUTCDate(expiresAt.getUTCDate() + defaultValidityDays);
    // Same format as the serials SQL Server's trigger used to generate (Postgres has
    // no such trigger, so every issuance got '' and the second one hit the UNIQUE
    // constraint). One certificate per user and course, so this is unique.
    const serial = `CERT-${req.user!.tenantId}-${courseId}-${userId}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO certificates (tenant_id, user_id, course_id, serial, validity_months, expires_at, template_id)
           VALUES (
             @tenantId, @userId, @courseId, @serial, @validityMonths,
             @expiresAt,
             @templateId
           )
           RETURNING id`
        : `INSERT INTO certificates (tenant_id, user_id, course_id, serial, validity_months, expires_at, template_id)
           OUTPUT INSERTED.id
           VALUES (
             @tenantId, @userId, @courseId, @serial, @validityMonths,
             @expiresAt,
             @templateId
           )`,
      {
        tenantId: req.user!.tenantId,
        userId,
        courseId,
        validityMonths: validityMonths || null,
        expiresAt,
        serial,
        templateId,
      }
    );

    // Reload the stored row (serial, dates) for the PDF and the response
    const cert = await DatabaseService.query<any>(
      'SELECT * FROM certificates WHERE id = @id',
      { id: result[0].id }
    );

    // Generate PDF certificate
    const pdfPath = await generateCertificatePDF(
      cert[0].serial,
      users[0].display_name,
      courses[0].title,
      cert[0].issued_at,
      req.user!.tenantId
    );

    // Store the PDF as file asset
    const fileResult = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
           VALUES (@tenantId, @filename, 'application/pdf', @storageKey, @createdBy)
           RETURNING id`
        : `INSERT INTO file_assets (tenant_id, filename, mime_type, storage_key, created_by)
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
  })
);

/**
 * @route GET /api/v1/certificates/:id/download
 * @desc Download certificate PDF
 */
router.get('/:id/download', authenticate, asyncHandler(async (req: AuthRequest, res) => {
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
}));

/**
 * @route DELETE /api/v1/certificates/:id
 * @desc Delete certificate
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res) => {
  const certificateId = parseInt(req.params.id, 10);
  await DatabaseService.execute(
    'DELETE FROM certificates WHERE id = @certificateId AND tenant_id = @tenantId',
    { certificateId, tenantId: req.user!.tenantId }
  );
  res.json({ success: true, message: 'Certificate deleted' });
}));

// Helper function to generate PDF certificate (exported for the one-off backfill
// script -- see backend/src/scripts/backfill_certificate_pdfs.ts)
export async function generateCertificatePDF(
  serial: string,
  userName: string,
  courseTitle: string,
  issuedAt: Date,
  tenantId?: number
): Promise<string> {
  // margin: 0 -- the layout below already draws its own decorative border
  // (the two doc.rect() calls at 30px/40px inset) and positions the footer
  // near the physical bottom edge (doc.page.height - 45). PDFKit's default
  // 72pt margin made that footer text fall outside the "writable" area, so
  // every certificate silently got a spurious blank second page containing
  // only the "Scan to verify" caption that no longer fit on page one.
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  
  const filename = `certificates/${serial}.pdf`;
  const fullPath = path.join(config.uploadDir, filename);
  
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  // Watermark -- drawn first, low opacity, so all subsequent text/border
  // strokes render on top of it and stay legible.
  if (tenantId) {
    const watermark = await DatabaseService.query<{ storage_key: string }>(
      IS_PG
        ? `SELECT fa.storage_key FROM certificate_watermarks cw JOIN file_assets fa ON cw.file_id = fa.id
           WHERE cw.tenant_id = @tenantId AND cw.is_default = ${db.bool(true)} LIMIT 1`
        : `SELECT TOP 1 fa.storage_key FROM certificate_watermarks cw JOIN file_assets fa ON cw.file_id = fa.id
           WHERE cw.tenant_id = @tenantId AND cw.is_default = ${db.bool(true)}`,
      { tenantId }
    );
    if (watermark.length > 0) {
      const watermarkPath = path.join(config.uploadDir, watermark[0].storage_key);
      if (fs.existsSync(watermarkPath)) {
        doc.opacity(0.12);
        // align/valign center the scaled image within the 400x300 box regardless
        // of the uploaded image's own aspect ratio -- without them a non-4:3
        // image renders anchored to the box's top-left instead of centered.
        doc.image(watermarkPath, (doc.page.width - 400) / 2, (doc.page.height - 300) / 2, {
          fit: [400, 300],
          align: 'center',
          valign: 'center',
        });
        doc.opacity(1);
      }
    }
  }

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
