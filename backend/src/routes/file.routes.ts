import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { authenticate, authorize, AuthRequest, UserPayload } from '../middleware/auth.middleware';
import { DatabaseService } from '../services/database.service';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../middleware/error.middleware';
import { config } from '../config';
import { IS_PG } from '../database/db-helpers';

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
      'text/html',
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
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
      meta: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
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

      // Remove original temp file
      fs.unlinkSync(file.path);
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
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
 * @route GET /api/v1/files/:id/stream
 * @desc Stream a file (for video/audio/PDF preview in <video>/<iframe>, which can't send
 * custom headers). Accepts the access token via the standard Authorization header OR a
 * `?token=` query param, and always trusts the token's own tenantId — never a client-supplied
 * header — to prevent cross-tenant file access.
 */
router.get('/:id/stream', async (req: AuthRequest, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string | undefined);

    if (!token) {
      throw UnauthorizedError('Authentication required');
    }

    let payload: UserPayload;
    try {
      payload = jwt.verify(token, config.jwt.secret) as UserPayload;
    } catch {
      throw UnauthorizedError('Invalid or expired token');
    }

    const fileId = parseInt(req.params.id, 10);
    const tenantId = payload.tenantId;

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
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': file.mime_type,
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
    // Since we don't have a folder column, we can return empty array or use date-based grouping
    // For now, return empty to avoid SQL errors
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

export default router;
