"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_service_1 = require("../services/database.service");
const error_middleware_1 = require("../middleware/error.middleware");
const config_1 = require("../config");
const router = (0, express_1.Router)();
const validate = (req) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw (0, error_middleware_1.BadRequestError)('Validation error', 'VALIDATION_ERROR', errors.array());
    }
};
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path_1.default.join(config_1.config.uploadDir, 'temp');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
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
        }
        else {
            cb(new Error(`File type ${file.mimetype} not allowed`));
        }
    },
});
/**
 * @route GET /api/v1/files
 * @desc List uploaded files
 */
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const mimeType = req.query.mimeType;
        let query = `SELECT f.*, u.display_name as uploaded_by_name
                 FROM file_assets f
                 LEFT JOIN users u ON f.created_by = u.id
                 WHERE f.tenant_id = @tenantId`;
        const params = { tenantId: req.user.tenantId };
        if (mimeType) {
            query += ' AND f.mime_type LIKE @mimeType';
            params.mimeType = `${mimeType}%`;
        }
        const [countResult, files] = await Promise.all([
            database_service_1.DatabaseService.query(`SELECT COUNT(*) as total FROM file_assets WHERE tenant_id = @tenantId`, { tenantId: req.user.tenantId }),
            database_service_1.DatabaseService.query(`${query} ORDER BY f.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, { ...params, offset, limit }),
        ]);
        // Ajouter les champs calculés pour chaque fichier
        const filesWithMeta = files.map((file) => ({
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
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route POST /api/v1/files/upload
 * @desc Upload a file
 */
router.post('/upload', auth_middleware_1.authenticate, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            throw (0, error_middleware_1.BadRequestError)('No file uploaded');
        }
        const { folder, description } = req.body;
        const file = req.file;
        // Determine final storage location
        const dateFolder = new Date().toISOString().slice(0, 7).replace('-', '/'); // YYYY/MM
        const targetFolder = folder || dateFolder;
        const targetDir = path_1.default.join(config_1.config.uploadDir, targetFolder);
        if (!fs_1.default.existsSync(targetDir)) {
            fs_1.default.mkdirSync(targetDir, { recursive: true });
        }
        let storageKey = `${targetFolder}/${file.filename}`;
        let thumbnailKey = null;
        // Process images - create thumbnails and optimize
        if (file.mimetype.startsWith('image/')) {
            const optimizedName = `optimized_${file.filename}`;
            const thumbnailName = `thumb_${file.filename}`;
            // Optimize original
            await (0, sharp_1.default)(file.path)
                .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(path_1.default.join(targetDir, optimizedName));
            // Create thumbnail
            await (0, sharp_1.default)(file.path)
                .resize(300, 300, { fit: 'cover' })
                .jpeg({ quality: 70 })
                .toFile(path_1.default.join(targetDir, thumbnailName));
            storageKey = `${targetFolder}/${optimizedName}`;
            thumbnailKey = `${targetFolder}/${thumbnailName}`;
            // Remove original temp file
            fs_1.default.unlinkSync(file.path);
        }
        else {
            // Move file to final location
            const finalPath = path_1.default.join(targetDir, file.filename);
            fs_1.default.renameSync(file.path, finalPath);
        }
        // Save to database
        const result = await database_service_1.DatabaseService.query(`INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)`, {
            tenantId: req.user.tenantId,
            filename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageKey,
            createdBy: req.user.id,
        });
        const fileAsset = await database_service_1.DatabaseService.query('SELECT * FROM file_assets WHERE id = @id', { id: result[0].id });
        // Ajouter les champs calculés que le frontend attend
        const response = {
            ...fileAsset[0],
            original_filename: file.originalname,
            url: `/files/${result[0].id}`,
            path: storageKey,
        };
        res.status(201).json({ success: true, data: response });
    }
    catch (error) {
        // Clean up temp file on error
        if (req.file && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        next(error);
    }
});
/**
 * @route POST /api/v1/files/upload-multiple
 * @desc Upload multiple files
 */
router.post('/upload-multiple', auth_middleware_1.authenticate, upload.array('files', 10), async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            throw (0, error_middleware_1.BadRequestError)('No files uploaded');
        }
        const files = req.files;
        const { folder } = req.body;
        const results = [];
        for (const file of files) {
            const dateFolder = new Date().toISOString().slice(0, 7).replace('-', '/');
            const targetFolder = folder || dateFolder;
            const targetDir = path_1.default.join(config_1.config.uploadDir, targetFolder);
            if (!fs_1.default.existsSync(targetDir)) {
                fs_1.default.mkdirSync(targetDir, { recursive: true });
            }
            let storageKey = `${targetFolder}/${file.filename}`;
            if (file.mimetype.startsWith('image/')) {
                const optimizedName = `optimized_${file.filename}`;
                await (0, sharp_1.default)(file.path)
                    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(path_1.default.join(targetDir, optimizedName));
                storageKey = `${targetFolder}/${optimizedName}`;
                fs_1.default.unlinkSync(file.path);
            }
            else {
                const finalPath = path_1.default.join(targetDir, file.filename);
                fs_1.default.renameSync(file.path, finalPath);
            }
            const result = await database_service_1.DatabaseService.query(`INSERT INTO file_assets (tenant_id, filename, mime_type, size_bytes, storage_key, created_by)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @filename, @mimeType, @sizeBytes, @storageKey, @createdBy)`, {
                tenantId: req.user.tenantId,
                filename: file.originalname,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                storageKey,
                createdBy: req.user.id,
            });
            const fileAsset = await database_service_1.DatabaseService.query('SELECT * FROM file_assets WHERE id = @id', { id: result[0].id });
            // Ajouter les champs calculés
            results.push({
                ...fileAsset[0],
                original_filename: file.originalname,
                url: `/files/${result[0].id}`,
                path: storageKey,
            });
        }
        res.status(201).json({ success: true, data: results });
    }
    catch (error) {
        // Clean up temp files on error
        if (req.files) {
            req.files.forEach(file => {
                if (fs_1.default.existsSync(file.path)) {
                    fs_1.default.unlinkSync(file.path);
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
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const fileId = parseInt(req.params.id, 10);
        const files = await database_service_1.DatabaseService.query(`SELECT f.*, u.display_name as uploaded_by_name
       FROM file_assets f
       LEFT JOIN users u ON f.created_by = u.id
       WHERE f.id = @fileId AND f.tenant_id = @tenantId`, { fileId, tenantId: req.user.tenantId });
        if (files.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('File');
        }
        const file = files[0];
        const response = {
            ...file,
            original_filename: file.filename,
            url: `/files/${file.id}`,
            path: file.storage_key,
        };
        res.json({ success: true, data: response });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/files/:id/download
 * @desc Download a file
 */
router.get('/:id/download', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const fileId = parseInt(req.params.id, 10);
        const files = await database_service_1.DatabaseService.query('SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId', { fileId, tenantId: req.user.tenantId });
        if (files.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('File');
        }
        const file = files[0];
        const filePath = path_1.default.join(config_1.config.uploadDir, file.storage_key);
        if (!fs_1.default.existsSync(filePath)) {
            throw (0, error_middleware_1.NotFoundError)('File not found on disk');
        }
        res.download(filePath, file.original_filename || file.filename);
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/files/:id/stream
 * @desc Stream a file (for video/audio/PDF preview)
 * Supports authentication via Authorization header or X-Tenant-ID header
 */
router.get('/:id/stream', auth_middleware_1.optionalAuth, async (req, res, next) => {
    try {
        const fileId = parseInt(req.params.id, 10);
        // Get tenant ID from authenticated user or from header
        const tenantId = req.user?.tenantId || parseInt(req.headers['x-tenant-id']) || 1;
        const files = await database_service_1.DatabaseService.query('SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId', { fileId, tenantId });
        if (files.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('File');
        }
        const file = files[0];
        const filePath = path_1.default.join(config_1.config.uploadDir, file.storage_key);
        if (!fs_1.default.existsSync(filePath)) {
            throw (0, error_middleware_1.NotFoundError)('File not found on disk');
        }
        const stat = fs_1.default.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const fileStream = fs_1.default.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': file.mime_type,
            });
            fileStream.pipe(res);
        }
        else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': file.mime_type,
            });
            fs_1.default.createReadStream(filePath).pipe(res);
        }
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route DELETE /api/v1/files/:id
 * @desc Delete a file
 */
router.delete('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const fileId = parseInt(req.params.id, 10);
        const files = await database_service_1.DatabaseService.query('SELECT * FROM file_assets WHERE id = @fileId AND tenant_id = @tenantId', { fileId, tenantId: req.user.tenantId });
        if (files.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('File');
        }
        const file = files[0];
        // Check if user owns the file or is admin
        if (file.created_by !== req.user.id && !['admin', 'director'].includes(req.user.role)) {
            throw (0, error_middleware_1.BadRequestError)('Not authorized to delete this file');
        }
        // Delete physical files
        const filePath = path_1.default.join(config_1.config.uploadDir, file.storage_key);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
        if (file.thumbnail_key) {
            const thumbnailPath = path_1.default.join(config_1.config.uploadDir, file.thumbnail_key);
            if (fs_1.default.existsSync(thumbnailPath)) {
                fs_1.default.unlinkSync(thumbnailPath);
            }
        }
        // Delete from database
        await database_service_1.DatabaseService.execute('DELETE FROM file_assets WHERE id = @fileId', { fileId });
        res.json({ success: true, message: 'File deleted' });
    }
    catch (error) {
        next(error);
    }
});
/**
 * @route GET /api/v1/files/folders
 * @desc Get list of folders
 */
router.get('/folders', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        // Since we don't have a folder column, we can return empty array or use date-based grouping
        // For now, return empty to avoid SQL errors
        res.json({ success: true, data: [] });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=file.routes.js.map