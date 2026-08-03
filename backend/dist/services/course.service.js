"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = exports.LessonService = exports.ModuleService = exports.CourseService = void 0;
const database_service_1 = require("./database.service");
const error_middleware_1 = require("../middleware/error.middleware");
class CourseService {
    /**
     * Create a new course
     */
    static async create(data) {
        const result = await database_service_1.DatabaseService.query(`INSERT INTO courses (tenant_id, title, description, category, level, duration, audience_scope, prerequisites, created_by)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @title, @description, @category, @level, @duration, @audienceScope, @prerequisites, @createdBy)`, {
            tenantId: data.tenantId,
            title: data.title,
            description: data.description || null,
            category: data.category || null,
            level: data.level || 'beginner',
            duration: data.duration || null,
            audienceScope: data.audienceScope ? JSON.stringify(data.audienceScope) : null,
            prerequisites: data.prerequisites ? JSON.stringify(data.prerequisites) : null,
            createdBy: data.createdBy,
        });
        return this.findById(data.tenantId, result[0].id);
    }
    /**
     * Get course by ID
     */
    static async findById(tenantId, courseId) {
        const courses = await database_service_1.DatabaseService.query(`SELECT c.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count,
              (SELECT AVG(CAST(rating AS FLOAT)) FROM course_evaluations WHERE course_id = c.id) as avg_rating,
              (SELECT COUNT(*) FROM course_evaluations WHERE course_id = c.id) as review_count
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = @courseId AND c.tenant_id = @tenantId`, { courseId, tenantId });
        if (courses.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Course');
        }
        const course = courses[0];
        return {
            id: course.id,
            tenantId: course.tenant_id,
            title: course.title,
            description: course.description,
            category: course.category,
            level: course.level,
            duration: course.duration,
            audienceScope: course.audience_scope ? JSON.parse(course.audience_scope) : null,
            prerequisites: course.prerequisites ? JSON.parse(course.prerequisites) : null,
            isPublished: course.is_published,
            createdBy: course.created_by,
            createdAt: course.created_at,
            updatedAt: course.updated_at,
            creatorName: course.creator_name,
            moduleCount: course.module_count,
            avgRating: course.avg_rating,
            reviewCount: course.review_count,
        };
    }
    /**
     * List courses with pagination and filtering
     */
    static async findAll(tenantId, pagination, filters, userId, userRole, userEnterpriseId, userDirectionId, userServiceId) {
        const { page, limit, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;
        let whereClause = 'WHERE c.tenant_id = @tenantId';
        const params = { tenantId, limit, offset };
        // Apply filters
        if (filters.search) {
            whereClause += ` AND (c.title LIKE @search OR c.description LIKE @search)`;
            params.search = `%${filters.search}%`;
        }
        if (filters.status === 'published') {
            whereClause += ' AND c.is_published = 1';
        }
        else if (filters.status === 'draft') {
            whereClause += ' AND c.is_published = 0';
        }
        // Apply audience scope filtering for non-admin users
        if (userRole && userRole !== 'admin') {
            whereClause += ` AND (
        c.is_published = 1 AND (
          c.audience_scope IS NULL
          OR JSON_VALUE(c.audience_scope, '$.level') = 'enterprise'
          ${userDirectionId ? `OR (JSON_VALUE(c.audience_scope, '$.level') = 'direction' AND @userDirectionId IN (SELECT value FROM OPENJSON(c.audience_scope, '$.ids')))` : ''}
          ${userServiceId ? `OR (JSON_VALUE(c.audience_scope, '$.level') = 'service' AND @userServiceId IN (SELECT value FROM OPENJSON(c.audience_scope, '$.ids')))` : ''}
          OR (JSON_VALUE(c.audience_scope, '$.level') = 'role' AND @userRole IN (SELECT value FROM OPENJSON(c.audience_scope, '$.roles')))
        )
      )`;
            params.userDirectionId = userDirectionId;
            params.userServiceId = userServiceId;
            params.userRole = userRole;
        }
        // Count total
        const countResult = await database_service_1.DatabaseService.query(`SELECT COUNT(*) as total FROM courses c ${whereClause}`, params);
        // Get courses
        const validSortColumns = ['title', 'created_at', 'updated_at'];
        const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const courses = await database_service_1.DatabaseService.query(`SELECT c.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count,
              (SELECT AVG(CAST(rating AS FLOAT)) FROM course_evaluations WHERE course_id = c.id) as avg_rating
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       ${whereClause}
       ORDER BY c.${orderBy} ${order}
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, params);
        return {
            data: courses.map((course) => ({
                id: course.id,
                tenantId: course.tenant_id,
                title: course.title,
                description: course.description,
                category: course.category,
                level: course.level,
                duration: course.duration,
                audienceScope: course.audience_scope ? JSON.parse(course.audience_scope) : null,
                prerequisites: course.prerequisites ? JSON.parse(course.prerequisites) : null,
                isPublished: course.is_published,
                createdBy: course.created_by,
                createdAt: course.created_at,
                updatedAt: course.updated_at,
                creatorName: course.creator_name,
                moduleCount: course.module_count,
                avgRating: course.avg_rating,
            })),
            total: countResult[0].total,
        };
    }
    /**
     * Get all course categories
     */
    static async getCategories(tenantId) {
        const results = await database_service_1.DatabaseService.query(`SELECT category, COUNT(*) as count 
       FROM courses 
       WHERE tenant_id = @tenantId AND category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY count DESC`, { tenantId });
        // Map categories to a more user-friendly format
        const categoryNames = {
            'tech': 'Technologie',
            'technology': 'Technologie',
            'management': 'Management',
            'soft-skills': 'Soft Skills',
            'compliance': 'Conformité',
            'marketing': 'Marketing',
            'finance': 'Finance',
            'sales': 'Ventes',
            'hr': 'Ressources Humaines',
            'leadership': 'Leadership',
            'communication': 'Communication',
        };
        return results.map((r) => ({
            id: r.category,
            name: categoryNames[r.category.toLowerCase()] || r.category,
            count: r.count,
        }));
    }
    /**
     * Update course
     */
    static async update(tenantId, courseId, data, userId, userRole) {
        // Check if course exists
        const existing = await this.findById(tenantId, courseId);
        // Check permissions (only creator or admin can edit)
        if (userRole !== 'admin' && existing.createdBy !== userId) {
            throw (0, error_middleware_1.ForbiddenError)('You can only edit your own courses');
        }
        const updateFields = [];
        const params = { tenantId, courseId };
        if (data.title !== undefined) {
            updateFields.push('title = @title');
            params.title = data.title;
        }
        if (data.description !== undefined) {
            updateFields.push('description = @description');
            params.description = data.description;
        }
        if (data.category !== undefined) {
            updateFields.push('category = @category');
            params.category = data.category;
        }
        if (data.level !== undefined) {
            updateFields.push('level = @level');
            params.level = data.level;
        }
        if (data.duration !== undefined) {
            updateFields.push('duration = @duration');
            params.duration = data.duration;
        }
        if (data.audienceScope !== undefined) {
            updateFields.push('audience_scope = @audienceScope');
            params.audienceScope = JSON.stringify(data.audienceScope);
        }
        if (data.prerequisites !== undefined) {
            updateFields.push('prerequisites = @prerequisites');
            params.prerequisites = JSON.stringify(data.prerequisites);
        }
        if (data.isPublished !== undefined) {
            updateFields.push('is_published = @isPublished');
            params.isPublished = data.isPublished;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE courses SET ${updateFields.join(', ')}, updated_at = SYSUTCDATETIME()
         WHERE id = @courseId AND tenant_id = @tenantId`, params);
        }
        return this.findById(tenantId, courseId);
    }
    /**
     * Delete course
     */
    static async delete(tenantId, courseId, userId, userRole) {
        const existing = await this.findById(tenantId, courseId);
        if (userRole !== 'admin' && existing.createdBy !== userId) {
            throw (0, error_middleware_1.ForbiddenError)('You can only delete your own courses');
        }
        // Delete in cascade order to respect foreign key constraints
        // 1. Delete learning analytics
        await database_service_1.DatabaseService.execute('DELETE FROM learning_analytics WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 2. Delete course evaluations
        await database_service_1.DatabaseService.execute('DELETE FROM course_evaluations WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 3. Delete certificates
        await database_service_1.DatabaseService.execute('DELETE FROM certificates WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 4. Delete course assignments
        await database_service_1.DatabaseService.execute('DELETE FROM course_assignments WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 5. Delete enrollments
        await database_service_1.DatabaseService.execute('DELETE FROM enrollments WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 6. Delete live sessions
        await database_service_1.DatabaseService.execute('DELETE FROM live_sessions WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        // 7. Delete modules and their related data (lessons, contents, quizzes, etc.)
        const modules = await database_service_1.DatabaseService.query('SELECT id FROM modules WHERE course_id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
        for (const module of modules) {
            // Delete contents, quizzes, and lesson progress for lessons in this module
            const lessons = await database_service_1.DatabaseService.query('SELECT id FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId', { moduleId: module.id, tenantId });
            for (const lesson of lessons) {
                await database_service_1.DatabaseService.execute('DELETE FROM contents WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId: lesson.id, tenantId });
                await database_service_1.DatabaseService.execute('DELETE FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId: lesson.id, tenantId });
                await database_service_1.DatabaseService.execute('DELETE FROM lesson_progress WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId: lesson.id, tenantId });
            }
            // Delete lessons
            await database_service_1.DatabaseService.execute('DELETE FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId', { moduleId: module.id, tenantId });
            // Delete module
            await database_service_1.DatabaseService.execute('DELETE FROM modules WHERE id = @moduleId AND tenant_id = @tenantId', { moduleId: module.id, tenantId });
        }
        // 8. Finally delete the course
        await database_service_1.DatabaseService.execute('DELETE FROM courses WHERE id = @courseId AND tenant_id = @tenantId', { courseId, tenantId });
    }
    /**
     * Publish course
     */
    static async publish(tenantId, courseId) {
        await database_service_1.DatabaseService.execute(`UPDATE courses SET is_published = 1, updated_at = SYSUTCDATETIME()
       WHERE id = @courseId AND tenant_id = @tenantId`, { courseId, tenantId });
        return this.findById(tenantId, courseId);
    }
    /**
     * Unpublish course
     */
    static async unpublish(tenantId, courseId) {
        await database_service_1.DatabaseService.execute(`UPDATE courses SET is_published = 0, updated_at = SYSUTCDATETIME()
       WHERE id = @courseId AND tenant_id = @tenantId`, { courseId, tenantId });
        return this.findById(tenantId, courseId);
    }
    /**
     * Get full course structure (with modules, lessons, contents)
     */
    static async getFullStructure(tenantId, courseId) {
        const course = await this.findById(tenantId, courseId);
        const modules = await database_service_1.DatabaseService.query(`SELECT * FROM modules WHERE course_id = @courseId AND tenant_id = @tenantId ORDER BY position`, { courseId, tenantId });
        const fullModules = await Promise.all(modules.map(async (module) => {
            const lessons = await database_service_1.DatabaseService.query(`SELECT * FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId ORDER BY position`, { moduleId: module.id, tenantId });
            const fullLessons = await Promise.all(lessons.map(async (lesson) => {
                const contents = await database_service_1.DatabaseService.query(`SELECT c.*, f.filename, f.mime_type, f.storage_key
               FROM contents c
               LEFT JOIN file_assets f ON c.file_id = f.id
               WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId
               ORDER BY c.position`, { lessonId: lesson.id, tenantId });
                const quizzes = await database_service_1.DatabaseService.query(`SELECT * FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId`, { lessonId: lesson.id, tenantId });
                return {
                    ...lesson,
                    contents,
                    quizzes,
                };
            }));
            return {
                ...module,
                lessons: fullLessons,
            };
        }));
        return {
            ...course,
            modules: fullModules,
        };
    }
    /**
     * Clone course
     */
    static async clone(tenantId, courseId, newTitle, userId) {
        const source = await this.getFullStructure(tenantId, courseId);
        // Create new course
        const newCourse = await this.create({
            tenantId,
            title: newTitle || `${source.title} (Copy)`,
            description: source.description,
            audienceScope: source.audienceScope,
            prerequisites: source.prerequisites,
            createdBy: userId,
        });
        // Clone modules and lessons
        for (const module of source.modules || []) {
            const newModule = await ModuleService.create({
                tenantId,
                courseId: newCourse.id,
                title: module.title,
                position: module.position,
            });
            for (const lesson of module.lessons || []) {
                const newLesson = await LessonService.create({
                    tenantId,
                    moduleId: newModule.id,
                    title: lesson.title,
                    position: lesson.position,
                    durationMin: lesson.duration_min,
                });
                // Clone contents
                for (const content of lesson.contents || []) {
                    await ContentService.create({
                        tenantId,
                        lessonId: newLesson.id,
                        type: content.type,
                        title: content.title,
                        body: content.body,
                        fileId: content.file_id,
                        url: content.url,
                        position: content.position,
                    });
                }
            }
        }
        return newCourse;
    }
    /**
     * Get course statistics
     */
    static async getStatistics(tenantId, courseId) {
        const stats = await database_service_1.DatabaseService.query(`SELECT 
        (SELECT COUNT(*) FROM modules WHERE course_id = @courseId) as total_modules,
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_lessons,
        (SELECT COALESCE(SUM(l.duration_min), 0) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_duration,
        (SELECT COUNT(*) FROM quizzes q JOIN lessons l ON q.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_quizzes,
        (SELECT COUNT(DISTINCT ce.user_id) FROM course_evaluations ce WHERE ce.course_id = @courseId) as total_reviews,
        (SELECT AVG(CAST(ce.rating AS FLOAT)) FROM course_evaluations ce WHERE ce.course_id = @courseId) as avg_rating,
        (SELECT COUNT(DISTINCT c.user_id) FROM certificates c WHERE c.course_id = @courseId) as total_completions`, { courseId, tenantId });
        return stats[0];
    }
}
exports.CourseService = CourseService;
// Module Service
class ModuleService {
    static async create(data) {
        const result = await database_service_1.DatabaseService.query(`INSERT INTO modules (tenant_id, course_id, title, position)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @courseId, @title, @position)`, data);
        const modules = await database_service_1.DatabaseService.query('SELECT * FROM modules WHERE id = @id', { id: result[0].id });
        return modules[0];
    }
    static async update(tenantId, moduleId, data) {
        const updateFields = [];
        const params = { tenantId, moduleId };
        if (data.title !== undefined) {
            updateFields.push('title = @title');
            params.title = data.title;
        }
        if (data.position !== undefined) {
            updateFields.push('position = @position');
            params.position = data.position;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE modules SET ${updateFields.join(', ')}
         WHERE id = @moduleId AND tenant_id = @tenantId`, params);
        }
        const modules = await database_service_1.DatabaseService.query('SELECT * FROM modules WHERE id = @moduleId AND tenant_id = @tenantId', { moduleId, tenantId });
        if (modules.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Module');
        }
        return modules[0];
    }
    static async delete(tenantId, moduleId) {
        await database_service_1.DatabaseService.execute('DELETE FROM modules WHERE id = @moduleId AND tenant_id = @tenantId', { moduleId, tenantId });
    }
    static async reorder(tenantId, courseId, moduleIds) {
        for (let i = 0; i < moduleIds.length; i++) {
            await database_service_1.DatabaseService.execute(`UPDATE modules SET position = @position
         WHERE id = @moduleId AND course_id = @courseId AND tenant_id = @tenantId`, { position: i + 1, moduleId: moduleIds[i], courseId, tenantId });
        }
    }
}
exports.ModuleService = ModuleService;
// Lesson Service
class LessonService {
    static async create(data) {
        const result = await database_service_1.DatabaseService.query(`INSERT INTO lessons (tenant_id, module_id, title, type, position, duration_min)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @moduleId, @title, @type, @position, @durationMin)`, {
            tenantId: data.tenantId,
            moduleId: data.moduleId,
            title: data.title,
            type: data.type || null,
            position: data.position,
            durationMin: data.durationMin || null,
        });
        const lessons = await database_service_1.DatabaseService.query('SELECT * FROM lessons WHERE id = @id', { id: result[0].id });
        return lessons[0];
    }
    static async update(tenantId, lessonId, data) {
        const updateFields = [];
        const params = { tenantId, lessonId };
        if (data.title !== undefined) {
            updateFields.push('title = @title');
            params.title = data.title;
        }
        if (data.type !== undefined) {
            updateFields.push('type = @type');
            params.type = data.type;
        }
        if (data.position !== undefined) {
            updateFields.push('position = @position');
            params.position = data.position;
        }
        if (data.durationMin !== undefined) {
            updateFields.push('duration_min = @durationMin');
            params.durationMin = data.durationMin;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE lessons SET ${updateFields.join(', ')}
         WHERE id = @lessonId AND tenant_id = @tenantId`, params);
        }
        const lessons = await database_service_1.DatabaseService.query('SELECT * FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId });
        if (lessons.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Lesson');
        }
        return lessons[0];
    }
    static async delete(tenantId, lessonId) {
        // First delete related content records
        await database_service_1.DatabaseService.execute('DELETE FROM contents WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId });
        // Then delete quizzes
        await database_service_1.DatabaseService.execute('DELETE FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId });
        // Then delete lesson progress records
        await database_service_1.DatabaseService.execute('DELETE FROM lesson_progress WHERE lesson_id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId });
        // Finally delete the lesson
        await database_service_1.DatabaseService.execute('DELETE FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId', { lessonId, tenantId });
    }
}
exports.LessonService = LessonService;
// Content Service
class ContentService {
    static async create(data) {
        const result = await database_service_1.DatabaseService.query(`INSERT INTO contents (tenant_id, lesson_id, type, title, body, file_id, url, position)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @lessonId, @type, @title, @body, @fileId, @url, @position)`, {
            tenantId: data.tenantId,
            lessonId: data.lessonId,
            type: data.type,
            title: data.title,
            body: data.body || null,
            fileId: data.fileId || null,
            url: data.url || null,
            position: data.position,
        });
        const contents = await database_service_1.DatabaseService.query('SELECT * FROM contents WHERE id = @id', { id: result[0].id });
        return contents[0];
    }
    static async update(tenantId, contentId, data) {
        const updateFields = [];
        const params = { tenantId, contentId };
        if (data.title !== undefined) {
            updateFields.push('title = @title');
            params.title = data.title;
        }
        if (data.body !== undefined) {
            updateFields.push('body = @body');
            params.body = data.body;
        }
        if (data.fileId !== undefined) {
            updateFields.push('file_id = @fileId');
            params.fileId = data.fileId;
        }
        if (data.url !== undefined) {
            updateFields.push('url = @url');
            params.url = data.url;
        }
        if (data.position !== undefined) {
            updateFields.push('position = @position');
            params.position = data.position;
        }
        if (updateFields.length > 0) {
            await database_service_1.DatabaseService.execute(`UPDATE contents SET ${updateFields.join(', ')}
         WHERE id = @contentId AND tenant_id = @tenantId`, params);
        }
        const contents = await database_service_1.DatabaseService.query('SELECT * FROM contents WHERE id = @contentId AND tenant_id = @tenantId', { contentId, tenantId });
        if (contents.length === 0) {
            throw (0, error_middleware_1.NotFoundError)('Content');
        }
        return contents[0];
    }
    static async delete(tenantId, contentId) {
        await database_service_1.DatabaseService.execute('DELETE FROM contents WHERE id = @contentId AND tenant_id = @tenantId', { contentId, tenantId });
    }
}
exports.ContentService = ContentService;
//# sourceMappingURL=course.service.js.map