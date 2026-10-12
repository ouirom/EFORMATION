import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize, AuthRequest, UserPayload, ROLE_HIERARCHY, verifyAccessToken } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError, UnauthorizedError, ForbiddenError } from '../middleware/error.middleware';
import { config } from '../config';
import { IS_PG } from '../database/db-helpers';
import { logger } from '../utils/logger';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { issueStreamToken, resolveStreamToken } from '../utils/streamTokens';

const router = Router();

const validate = (req: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw BadRequestError('Validation error', 'VALIDATION_ERROR', errors.array());
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(config.uploadDir, 'temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'text/plain',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

/**
 * @route GET /api/v1/files
 * @desc List uploaded files
 */
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });
    const mimeType = req.query.mimeType as string;

    let query = `SELECT f.*, u.display_name as uploaded_by_name
                 FROM file_assets f
                 LEFT JOIN users u ON f.created_by = u.id
                 WHERE f.tenant_id = @tenantId`;
    const params: Record<string, any> = { tenantId: req.user!.tenantId };

    if (mimeType) {
      query += ' AND f.mime_type LIKE @mimeType';
      params.mimeType = `${mimeType}%`;
    }

    const [countResult, files] = await Promise.all([
      DatabaseService.query<{ total: number }>(
        `SELECT COUNT(*) as total FROM file_assets WHERE tenant_id = @tenantId`,
        { tenantId: req.user!.tenantId }
      ),
      DatabaseService.query<any>(
        `${query} ORDER BY f.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { ...params, offset, limit }
      ),
    ]);

    // Ajouter les champs calculés pour chaque fichier
    const filesWithMeta = files.map((file: any) => ({
      ...file,
      original_filename: file.filename,
      url: `/files/${file.id}`,
      path: file.storage_key,
    }));

    res.json({
      success: true,
      data: filesWithMeta,
      meta: buildPaginationMeta(countResult[0].total, page, limit),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/files/upload
 * @desc Upload a file
 */
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      throw BadRequestError('No file uploaded');
    }

    const { folder, description } = req.body;
    const file = req.file;

    // Determine final storage location
    const dateFolder = new Date().toISOString().slice(0, 7).replace('-', '/'); // YYYY/MM
    const targetFolder = folder || dateFolder;
    const targetDir = path.join(config.uploadDir, targetFolder);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let storageKey = `${targetFolder}/${file.filename}`;
    let thumbnailKey: string | null = null;

    // Process images - create thumbnails and optimize
    if (file.mimetype.startsWith('image/')) {
      const optimizedName = `optimized_${file.filename}`;
      const thumbnailName = `thumb_${file.filename}`;

      // Optimize original
      await sharp(file.path)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(targetDir, optimizedName));

      // Create thumbnail
      await sharp(file.path)
        .resize(300, 300, { fit: 'cover' })
        .jpeg({ quality: 70 })
        .toFile(path.join(targetDir, thumbnailName));

      storageKey = `${targetFolder}/${optimizedName}`;
      thumbnailKey = `${targetFolder}/${thumbnailName}`;

      // Remove original temp file. Best-effort: on Windows this can transiently
      // EBUSY (AV/indexer still holding a handle right after sharp closes it) --
      // the optimized/thumbnail files are already written and the DB insert
      // below is what actually matters, so a leftover temp file is harmless.
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        logger.warn('Failed to remove temp upload file', { path: file.path, error: cleanupError });
      }
    } else {
      // Move file to final location
      const finalPath = path.join(targetDir, file.filename);
      fs.renameSync(file.path, finalPath);
    }

    // Save to database
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
           VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)
           RETURNING id`
        : `INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)`,
      {
        tenantId: req.user!.tenantId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        createdBy: req.user!.id,
      }
    );

    const fileAsset = await DatabaseService.query<any>(
      'SELECT * FROM file_assets WHERE id = @id',
      { id: result[0].id }
    );

    // Ajouter les champs calculés que le frontend attend
    const response = {
      ...fileAsset[0],
      original_filename: file.originalname,
      url: `/files/${result[0].id}`,
      path: storageKey,
    };

    res.status(201).json({ success: true, data: response });
  } catch (error) {
    // Clean up temp file on error -- best-effort, same EBUSY caveat as above.
    // Letting this throw here would crash the process instead of returning
    // the original error to the client.
    try {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      logger.warn('Failed to remove temp upload file after error', { path: req.file?.path, error: cleanupError });
    }
    next(error);
  }
});

/**
 * @route POST /api/v1/files/upload-multiple
 * @desc Upload multiple files
 */
router.post('/upload-multiple', authenticate, upload.array('files', 10), async (req: AuthRequest, res, next) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      throw BadRequestError('No files uploaded');
    }

    const files = req.files as Express.Multer.File[];
    const { folder } = req.body;
    const results: any[] = [];

    for (const file of files) {
      const dateFolder = new Date().toISOString().slice(0, 7).replace('-', '/');
      const targetFolder = folder || dateFolder;
      const targetDir = path.join(config.uploadDir, targetFolder);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let storageKey = `${targetFolder}/${file.filename}`;

      if (file.mimetype.startsWith('image/')) {
        const optimizedName = `optimized_${file.filename}`;

        await sharp(file.path)
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(path.join(targetDir, optimizedName));

        storageKey = `${targetFolder}/${optimizedName}`;
        fs.unlinkSync(file.path);
      } else {
        const finalPath = path.join(targetDir, file.filename);
        fs.renameSync(file.path, finalPath);
      }

      const result = await DatabaseService.query<{ id: number }>(
        IS_PG
          ? `INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
             VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)
             RETURNING id`
          : `INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)`,
        {
          tenantId: req.user!.tenantId,
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          createdBy: req.user!.id,
        }
      );

      const fileAsset = await DatabaseService.query<any>(
        'SELECT * FROM file_assets WHERE id = @id',
        { id: result[0].id }
      );

      // Ajouter les champs calculés
      results.push({
        ...fileAsset[0],
        original_filename: file.originalname,
        url: `/files/${result[0].id}`,
        path: storageKey,
      });
    }

    res.status(201).json({ success: true, data: results });
  } catch (error) {
    // Clean up temp files on error
    if (req.files) {
      (req.files as Express.Multer.File[]).forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    next(error);
  }
});

/**
 * @route GET /api/v1/files/:id
 * @desc Get file metadata
 */
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const fileId = parseInt(req.params.id, 10);

    const files = await DatabaseService.query<any>(
      `SELECT f.*, u.display_name as uploaded_by_name
       FROM file_assets f
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.id = @fileId AND f.tenant_id = @tenantId`,
      { fileId, tenantId: req.user!.tenantId }
    );

    if (files.length === 0) {
      throw NotFoundError('File');
    }

    const file = files[0];
    const response = {
      ...file,
      original_filename: file.filename,
      url: `/files/${file.id}`,
      path: file.storage_key,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/files/:id/download
 * @desc Download a file
 */
router.get('/:id/download', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const fileId = parseInt(req.params.id, 10);

    const files = await DatabaseService.query<any>(
      'SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId',
      { fileId, tenantId: req.user!.tenantId }
    );

    if (files.length === 0) {
      throw NotFoundError('File');
    }

    // A file attached to a lesson as its document can have downloads disabled for
    // that lesson (view-only) -- course management roles are exempt, same threshold
    // used for course/lesson management elsewhere (CourseService.audienceScopeCondition).
    // Files not attached to any lesson (avatars, other uploads) are unaffected.
    if ((ROLE_HIERARCHY[req.user!.role] || 0) < ROLE_HIERARCHY.manager) {
      const lessonRows = await DatabaseService.query<{ allow_document_download: boolean }>(
        `SELECT l.allow_document_download
         FROM contents c
         JOIN lessons l ON l.id = c.lesson_id
         WHERE c.file_id = @fileId AND c.tenant_id = @tenantId`,
        { fileId, tenantId: req.user!.tenantId }
      );
      if (lessonRows.length > 0 && !lessonRows[0].allow_document_download) {
        throw ForbiddenError('Downloading this document is not allowed');
      }
    }

    const file = files[0];
    const filePath = path.join(config.uploadDir, file.storage_key);

    if (!fs.existsSync(filePath)) {
      throw NotFoundError('File not found on disk');
    }

    res.download(filePath, file.original_filename || file.filename);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/files/:id/stream-token
 * @desc Mints a short-lived, single-file-scoped token for GET /:id/stream. <video>/<iframe>
 * elements can't send an Authorization header, so the token has to travel in the URL --
 * this keeps what ends up in server/proxy access logs and browser history to a token that's
 * useless within minutes and can only ever stream this one file, instead of the full access
 * token (which could otherwise reach any endpoint for its whole lifetime). The token itself
 * is a random opaque string looked up server-side (see utils/streamTokens.ts), not a JWT --
 * a JWT's payload is only signed, not encrypted, so it would still expose fileId/tenantId
 * in clear text to anyone who saw the token, even without being able to forge or reuse it.
 */
router.post('/:id/stream-token', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const fileId = parseInt(req.params.id, 10);

    const files = await DatabaseService.query<{ id: number }>(
      'SELECT id FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId',
      { fileId, tenantId: req.user!.tenantId }
    );
    if (files.length === 0) {
      throw NotFoundError('File');
    }

    const streamToken = issueStreamToken(fileId, req.user!.tenantId);

    res.json({ success: true, data: { streamToken } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/files/:id/stream
 * @desc Stream a file (for video/audio/PDF preview in <video>/<iframe>, which can't send
 * custom headers). The Authorization header takes a normal access token, same as any other
 * endpoint; the `?token=` query param only accepts the opaque, file-scoped token from
 * POST /:id/stream-token above -- never the full access token, so a token that leaks via logs
 * or browser history can't be replayed against the rest of the API, and reveals nothing about
 * its own fileId/tenantId on inspection. Always trusts the resolved tenantId/fileId — never a
 * client-supplied header/param — to prevent cross-tenant access.
 */
router.get('/:id/stream', async (req: AuthRequest, res, next) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    let tenantId: number;

    if (authHeader?.startsWith('Bearer ')) {
      let payload: UserPayload;
      try {
        payload = await verifyAccessToken(authHeader.slice(7));
      } catch {
        throw UnauthorizedError('Invalid or expired token');
      }
      tenantId = payload.tenantId;
    } else if (queryToken) {
      const resolved = resolveStreamToken(queryToken);
      if (!resolved || resolved.fileId !== fileId) {
        throw UnauthorizedError('Invalid or expired token');
      }
      tenantId = resolved.tenantId;
    } else {
      throw UnauthorizedError('Authentication required');
    }

    const files = await DatabaseService.query<any>(
      'SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId',
      { fileId, tenantId }
    );

    if (files.length === 0) {
      throw NotFoundError('File');
    }

    const file = files[0];
    const filePath = path.join(config.uploadDir, file.storage_key);

    if (!fs.existsSync(filePath)) {
      throw NotFoundError('File not found on disk');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Only render inline the media types the viewer actually needs to embed
    // (<video>/<audio>/<iframe> preview, images). Everything else is forced to
    // download rather than render on this origin -- defense in depth against a
    // stored file (e.g. an old text/html upload) executing as a page here.
    const INLINE_SAFE_PREFIXES = ['image/', 'video/', 'audio/'];
    const canInline = file.mime_type === 'application/pdf' || INLINE_SAFE_PREFIXES.some((p) => file.mime_type?.startsWith(p));
    const disposition = canInline ? 'inline' : `attachment; filename="${encodeURIComponent(file.original_filename || file.filename)}"`;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.mime_type,
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': file.mime_type,
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/files/:id
 * @desc Delete a file
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const fileId = parseInt(req.params.id, 10);

    const files = await DatabaseService.query<any>(
      'SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId',
      { fileId, tenantId: req.user!.tenantId }
    );

    if (files.length === 0) {
      throw NotFoundError('File');
    }

    const file = files[0];

    // Check if user owns the file or is admin
    if (file.created_by !== req.user!.id && !['admin', 'director'].includes(req.user!.role)) {
      throw BadRequestError('Not authorized to delete this file');
    }

    // Delete physical files
    const filePath = path.join(config.uploadDir, file.storage_key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (file.thumbnail_key) {
      const thumbnailPath = path.join(config.uploadDir, file.thumbnail_key);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }

    // Delete from database
    await DatabaseService.execute(
      'DELETE FROM file_assets WHERE id = @fileId',
      { fileId }
    );

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/files/folders
 * @desc Get list of folders
 */
router.get('/folders', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // There's no dedicated folder column -- storage_key is "<folder>/<filename>"
    // (see POST /upload), so the folder is the first path segment. Real,
    // computed list rather than the unconditional [] this used to return.
    const rows = await DatabaseService.query<{ folder: string }>(
      IS_PG
        ? `SELECT DISTINCT split_part(storage_key, '/', 1) as folder
           FROM file_assets WHERE tenant_id = @tenantId
           ORDER BY folder`
        : `SELECT DISTINCT LEFT(storage_key, CHARINDEX('/', storage_key + '/') - 1) as folder
           FROM file_assets WHERE tenant_id = @tenantId
           ORDER BY folder`,
      { tenantId: req.user!.tenantId }
    );

    res.json({ success: true, data: rows.map((r) => r.folder).filter(Boolean) });
  } catch (error) {
    next(error);
  }
});

export default router;
