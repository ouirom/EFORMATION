import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { Course, Module, Lesson, Content, AudienceScope, PaginationParams, FilterParams } from '../types';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface CreateCourseDTO {
  tenantId: number;
  title: string;
  description?: string;
  category?: string;
  level?: string;
  duration?: number;
  audienceScope?: AudienceScope;
  prerequisites?: { courseIds?: number[]; badgeIds?: number[] };
  createdBy: number;
}

interface UpdateCourseDTO {
  title?: string;
  description?: string;
  category?: string;
  level?: string;
  duration?: number;
  audienceScope?: AudienceScope;
  prerequisites?: { courseIds?: number[]; badgeIds?: number[] };
  isPublished?: boolean;
}

export class CourseService {
  /**
   * Create a new course
   */
  static async create(data: CreateCourseDTO): Promise<Course> {
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO courses (tenant_id, title, description, category, level, duration, audience_scope, prerequisites, created_by)
           VALUES (@tenantId, @title, @description, @category, @level, @duration, @audienceScope, @prerequisites, @createdBy)
           RETURNING id`
        : `INSERT INTO courses (tenant_id, title, description, category, level, duration, audience_scope, prerequisites, created_by)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @title, @description, @category, @level, @duration, @audienceScope, @prerequisites, @createdBy)`,
      {
        tenantId: data.tenantId,
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        level: data.level || 'beginner',
        duration: data.duration || null,
        audienceScope: data.audienceScope ? JSON.stringify(data.audienceScope) : null,
        prerequisites: data.prerequisites ? JSON.stringify(data.prerequisites) : null,
        createdBy: data.createdBy,
      }
    );

    return this.findById(data.tenantId, result[0].id);
  }

  /**
   * Get course by ID
   */
  static async findById(tenantId: number, courseId: number): Promise<Course> {
    const courses = await DatabaseService.query<any>(
      `SELECT c.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count,
              (SELECT AVG(CAST(rating AS FLOAT)) FROM course_evaluations WHERE course_id = c.id) as avg_rating,
              (SELECT COUNT(*) FROM course_evaluations WHERE course_id = c.id) as review_count
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = @courseId AND c.tenant_id = @tenantId`,
      { courseId, tenantId }
    );

    if (courses.length === 0) {
      throw NotFoundError('Course');
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
      audienceScope: db.parseJsonColumn(course.audience_scope),
      prerequisites: db.parseJsonColumn(course.prerequisites),
      isPublished: course.is_published,
      createdBy: course.created_by,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      creatorName: course.creator_name,
      moduleCount: course.module_count,
      avgRating: course.avg_rating,
      reviewCount: course.review_count,
    } as Course & { creatorName: string; moduleCount: number; avgRating: number; reviewCount: number };
  }

  /**
   * List courses with pagination and filtering
   */
  static async findAll(
    tenantId: number,
    pagination: PaginationParams,
    filters: FilterParams,
    userId?: number,
    userRole?: string,
    userEnterpriseId?: number,
    userDirectionId?: number,
    userServiceId?: number
  ): Promise<{ data: Course[]; total: number }> {
    const { page, limit, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.tenant_id = @tenantId';
    const params: Record<string, any> = { tenantId, limit, offset };

    // Apply filters
    if (filters.search) {
      whereClause += ` AND (c.title LIKE @search OR c.description LIKE @search)`;
      params.search = `%${filters.search}%`;
    }

    if (filters.status === 'published') {
      whereClause += ` AND c.is_published = ${db.bool(true)}`;
    } else if (filters.status === 'draft') {
      whereClause += ` AND c.is_published = ${db.bool(false)}`;
    }

    // Apply audience scope filtering for non-admin users
    if (userRole && userRole !== 'admin') {
      const audienceLevel = db.jsonExtract('c.audience_scope', 'level');
      whereClause += ` AND (
        c.is_published = ${db.bool(true)} AND (
          c.audience_scope IS NULL
          OR ${audienceLevel} = 'enterprise'
          ${userDirectionId ? `OR (${audienceLevel} = 'direction' AND ${db.jsonArrayContains('c.audience_scope', 'ids', '@userDirectionId')})` : ''}
          ${userServiceId ? `OR (${audienceLevel} = 'service' AND ${db.jsonArrayContains('c.audience_scope', 'ids', '@userServiceId')})` : ''}
          OR (${audienceLevel} = 'role' AND ${db.jsonArrayContains('c.audience_scope', 'roles', '@userRole')})
        )
      )`;
      params.userDirectionId = userDirectionId;
      params.userServiceId = userServiceId;
      params.userRole = userRole;
    }

    // Count total
    const countResult = await DatabaseService.query<{ total: number }>(
      `SELECT COUNT(*) as total FROM courses c ${whereClause}`,
      params
    );

    // Get courses
    const validSortColumns = ['title', 'created_at', 'updated_at'];
    const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const courses = await DatabaseService.query<any>(
      `SELECT c.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM modules WHERE course_id = c.id) as module_count,
              (SELECT AVG(CAST(rating AS FLOAT)) FROM course_evaluations WHERE course_id = c.id) as avg_rating,
              (SELECT COUNT(*) FROM course_assignments WHERE course_id = c.id) as enrolled_count
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       ${whereClause}
       ORDER BY c.${orderBy} ${order}
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );

    return {
      data: courses.map((course: any) => ({
        id: course.id,
        tenantId: course.tenant_id,
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        duration: course.duration,
        audienceScope: db.parseJsonColumn(course.audience_scope),
        prerequisites: db.parseJsonColumn(course.prerequisites),
        isPublished: course.is_published,
        createdBy: course.created_by,
        createdAt: course.created_at,
        updatedAt: course.updated_at,
        creatorName: course.creator_name,
        moduleCount: course.module_count,
        avgRating: course.avg_rating,
        enrolledCount: course.enrolled_count,
      })),
      total: countResult[0].total,
    };
  }

  /**
   * Get all course categories
   */
  static async getCategories(tenantId: number): Promise<{ id: string; name: string; count: number }[]> {
    const results = await DatabaseService.query<{ category: string; count: number }>(
      `SELECT category, COUNT(*) as count 
       FROM courses 
       WHERE tenant_id = @tenantId AND category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY count DESC`,
      { tenantId }
    );

    // Map categories to a more user-friendly format
    const categoryNames: Record<string, string> = {
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
  static async update(
    tenantId: number,
    courseId: number,
    data: UpdateCourseDTO,
    userId: number,
    userRole: string
  ): Promise<Course> {
    // Check if course exists
    const existing = await this.findById(tenantId, courseId);

    // Check permissions (only creator or admin can edit)
    if (userRole !== 'admin' && existing.createdBy !== userId) {
      throw ForbiddenError('You can only edit your own courses');
    }

    const updateFields: string[] = [];
    const params: Record<string, any> = { tenantId, courseId };

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
      await DatabaseService.execute(
        `UPDATE courses SET ${updateFields.join(', ')}, updated_at = ${db.now()}
         WHERE id = @courseId AND tenant_id = @tenantId`,
        params
      );
    }

    return this.findById(tenantId, courseId);
  }

  /**
   * Delete course
   */
  static async delete(
    tenantId: number,
    courseId: number,
    userId: number,
    userRole: string
  ): Promise<void> {
    const existing = await this.findById(tenantId, courseId);

    if (userRole !== 'admin' && existing.createdBy !== userId) {
      throw ForbiddenError('You can only delete your own courses');
    }

    // Delete in cascade order to respect foreign key constraints
    
    // 1. Delete learning analytics
    await DatabaseService.execute(
      'DELETE FROM learning_analytics WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 2. Delete course evaluations
    await DatabaseService.execute(
      'DELETE FROM course_evaluations WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 3. Delete certificates
    await DatabaseService.execute(
      'DELETE FROM certificates WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 4. Delete course assignments
    await DatabaseService.execute(
      'DELETE FROM course_assignments WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 5. Delete enrollments
    await DatabaseService.execute(
      'DELETE FROM enrollments WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 6. Delete live sessions
    await DatabaseService.execute(
      'DELETE FROM live_sessions WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    // 7. Delete modules and their related data (lessons, contents, quizzes, etc.)
    const modules = await DatabaseService.query<any>(
      'SELECT id FROM modules WHERE course_id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );

    for (const module of modules) {
      // Delete contents, quizzes, and lesson progress for lessons in this module
      const lessons = await DatabaseService.query<any>(
        'SELECT id FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId',
        { moduleId: module.id, tenantId }
      );

      for (const lesson of lessons) {
        await DatabaseService.execute(
          'DELETE FROM contents WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
          { lessonId: lesson.id, tenantId }
        );
        await DatabaseService.execute(
          'DELETE FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
          { lessonId: lesson.id, tenantId }
        );
        await DatabaseService.execute(
          'DELETE FROM lesson_progress WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
          { lessonId: lesson.id, tenantId }
        );
      }

      // Delete lessons
      await DatabaseService.execute(
        'DELETE FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId',
        { moduleId: module.id, tenantId }
      );

      // Delete module
      await DatabaseService.execute(
        'DELETE FROM modules WHERE id = @moduleId AND tenant_id = @tenantId',
        { moduleId: module.id, tenantId }
      );
    }

    // 8. Finally delete the course
    await DatabaseService.execute(
      'DELETE FROM courses WHERE id = @courseId AND tenant_id = @tenantId',
      { courseId, tenantId }
    );
  }

  /**
   * Publish course
   */
  static async publish(tenantId: number, courseId: number): Promise<Course> {
    await DatabaseService.execute(
      `UPDATE courses SET is_published = ${db.bool(true)}, updated_at = ${db.now()}
       WHERE id = @courseId AND tenant_id = @tenantId`,
      { courseId, tenantId }
    );
    return this.findById(tenantId, courseId);
  }

  /**
   * Unpublish course
   */
  static async unpublish(tenantId: number, courseId: number): Promise<Course> {
    await DatabaseService.execute(
      `UPDATE courses SET is_published = ${db.bool(false)}, updated_at = ${db.now()}
       WHERE id = @courseId AND tenant_id = @tenantId`,
      { courseId, tenantId }
    );
    return this.findById(tenantId, courseId);
  }

  /**
   * Get full course structure (with modules, lessons, contents)
   */
  static async getFullStructure(tenantId: number, courseId: number): Promise<any> {
    const course = await this.findById(tenantId, courseId);

    const modules = await DatabaseService.query<any>(
      `SELECT * FROM modules WHERE course_id = @courseId AND tenant_id = @tenantId ORDER BY position`,
      { courseId, tenantId }
    );

    const fullModules = await Promise.all(
      modules.map(async (module: any) => {
        const lessons = await DatabaseService.query<any>(
          `SELECT * FROM lessons WHERE module_id = @moduleId AND tenant_id = @tenantId ORDER BY position`,
          { moduleId: module.id, tenantId }
        );

        const fullLessons = await Promise.all(
          lessons.map(async (lesson: any) => {
            const contents = await DatabaseService.query<any>(
              `SELECT c.*, f.filename, f.mime_type, f.storage_key
               FROM contents c
               LEFT JOIN file_assets f ON c.file_id = f.id
               WHERE c.lesson_id = @lessonId AND c.tenant_id = @tenantId
               ORDER BY c.position`,
              { lessonId: lesson.id, tenantId }
            );

            const quizzes = await DatabaseService.query<any>(
              `SELECT * FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId`,
              { lessonId: lesson.id, tenantId }
            );

            return {
              ...lesson,
              contents,
              quizzes,
            };
          })
        );

        return {
          ...module,
          lessons: fullLessons,
        };
      })
    );

    return {
      ...course,
      modules: fullModules,
    };
  }

  /**
   * Clone course
   */
  static async clone(
    tenantId: number,
    courseId: number,
    newTitle: string,
    userId: number
  ): Promise<Course> {
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
  static async getStatistics(tenantId: number, courseId: number): Promise<any> {
    const stats = await DatabaseService.query<any>(
      `SELECT 
        (SELECT COUNT(*) FROM modules WHERE course_id = @courseId) as total_modules,
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_lessons,
        (SELECT COALESCE(SUM(l.duration_min), 0) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_duration,
        (SELECT COUNT(*) FROM quizzes q JOIN lessons l ON q.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = @courseId) as total_quizzes,
        (SELECT COUNT(DISTINCT ce.user_id) FROM course_evaluations ce WHERE ce.course_id = @courseId) as total_reviews,
        (SELECT AVG(CAST(ce.rating AS FLOAT)) FROM course_evaluations ce WHERE ce.course_id = @courseId) as avg_rating,
        (SELECT COUNT(DISTINCT c.user_id) FROM certificates c WHERE c.course_id = @courseId) as total_completions`,
      { courseId, tenantId }
    );

    return stats[0];
  }
}

// Module Service
export class ModuleService {
  static async create(data: {
    tenantId: number;
    courseId: number;
    title: string;
    position: number;
  }): Promise<Module> {
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO modules (tenant_id, course_id, title, position)
           VALUES (@tenantId, @courseId, @title, @position)
           RETURNING id`
        : `INSERT INTO modules (tenant_id, course_id, title, position)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @courseId, @title, @position)`,
      data
    );

    const modules = await DatabaseService.query<any>(
      'SELECT * FROM modules WHERE id = @id',
      { id: result[0].id }
    );

    return modules[0];
  }

  static async update(
    tenantId: number,
    moduleId: number,
    data: { title?: string; position?: number }
  ): Promise<Module> {
    const updateFields: string[] = [];
    const params: Record<string, any> = { tenantId, moduleId };

    if (data.title !== undefined) {
      updateFields.push('title = @title');
      params.title = data.title;
    }
    if (data.position !== undefined) {
      updateFields.push('position = @position');
      params.position = data.position;
    }

    if (updateFields.length > 0) {
      await DatabaseService.execute(
        `UPDATE modules SET ${updateFields.join(', ')}
         WHERE id = @moduleId AND tenant_id = @tenantId`,
        params
      );
    }

    const modules = await DatabaseService.query<any>(
      'SELECT * FROM modules WHERE id = @moduleId AND tenant_id = @tenantId',
      { moduleId, tenantId }
    );

    if (modules.length === 0) {
      throw NotFoundError('Module');
    }

    return modules[0];
  }

  static async delete(tenantId: number, moduleId: number): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM modules WHERE id = @moduleId AND tenant_id = @tenantId',
      { moduleId, tenantId }
    );
  }

  static async reorder(
    tenantId: number,
    courseId: number,
    moduleIds: number[]
  ): Promise<void> {
    for (let i = 0; i < moduleIds.length; i++) {
      await DatabaseService.execute(
        `UPDATE modules SET position = @position
         WHERE id = @moduleId AND course_id = @courseId AND tenant_id = @tenantId`,
        { position: i + 1, moduleId: moduleIds[i], courseId, tenantId }
      );
    }
  }
}

// Lesson Service
export class LessonService {
  static async create(data: {
    tenantId: number;
    moduleId: number;
    title: string;
    type?: string;
    position: number;
    durationMin?: number;
  }): Promise<Lesson> {
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO lessons (tenant_id, module_id, title, type, position, duration_min)
           VALUES (@tenantId, @moduleId, @title, @type, @position, @durationMin)
           RETURNING id`
        : `INSERT INTO lessons (tenant_id, module_id, title, type, position, duration_min)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @moduleId, @title, @type, @position, @durationMin)`,
      {
        tenantId: data.tenantId,
        moduleId: data.moduleId,
        title: data.title,
        type: data.type || null,
        position: data.position,
        durationMin: data.durationMin || null,
      }
    );

    const lessons = await DatabaseService.query<any>(
      'SELECT * FROM lessons WHERE id = @id',
      { id: result[0].id }
    );

    return lessons[0];
  }

  static async update(
    tenantId: number,
    lessonId: number,
    data: { title?: string; type?: string; position?: number; durationMin?: number }
  ): Promise<Lesson> {
    const updateFields: string[] = [];
    const params: Record<string, any> = { tenantId, lessonId };

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
      await DatabaseService.execute(
        `UPDATE lessons SET ${updateFields.join(', ')}
         WHERE id = @lessonId AND tenant_id = @tenantId`,
        params
      );
    }

    const lessons = await DatabaseService.query<any>(
      'SELECT * FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId }
    );

    if (lessons.length === 0) {
      throw NotFoundError('Lesson');
    }

    return lessons[0];
  }

  static async delete(tenantId: number, lessonId: number): Promise<void> {
    // First delete related content records
    await DatabaseService.execute(
      'DELETE FROM contents WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId }
    );
    
    // Then delete quizzes
    await DatabaseService.execute(
      'DELETE FROM quizzes WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId }
    );
    
    // Then delete lesson progress records
    await DatabaseService.execute(
      'DELETE FROM lesson_progress WHERE lesson_id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId }
    );
    
    // Finally delete the lesson
    await DatabaseService.execute(
      'DELETE FROM lessons WHERE id = @lessonId AND tenant_id = @tenantId',
      { lessonId, tenantId }
    );
  }
}

// Content Service
export class ContentService {
  static async create(data: {
    tenantId: number;
    lessonId: number;
    type: string;
    title: string;
    body?: string;
    fileId?: number;
    url?: string;
    position: number;
  }): Promise<Content> {
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO contents (tenant_id, lesson_id, type, title, body, file_id, url, position)
           VALUES (@tenantId, @lessonId, @type, @title, @body, @fileId, @url, @position)
           RETURNING id`
        : `INSERT INTO contents (tenant_id, lesson_id, type, title, body, file_id, url, position)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @lessonId, @type, @title, @body, @fileId, @url, @position)`,
      {
        tenantId: data.tenantId,
        lessonId: data.lessonId,
        type: data.type,
        title: data.title,
        body: data.body || null,
        fileId: data.fileId || null,
        url: data.url || null,
        position: data.position,
      }
    );

    const contents = await DatabaseService.query<any>(
      'SELECT * FROM contents WHERE id = @id',
      { id: result[0].id }
    );

    return contents[0];
  }

  static async update(
    tenantId: number,
    contentId: number,
    data: { title?: string; body?: string; fileId?: number; url?: string; position?: number }
  ): Promise<Content> {
    const updateFields: string[] = [];
    const params: Record<string, any> = { tenantId, contentId };

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
      await DatabaseService.execute(
        `UPDATE contents SET ${updateFields.join(', ')}
         WHERE id = @contentId AND tenant_id = @tenantId`,
        params
      );
    }

    const contents = await DatabaseService.query<any>(
      'SELECT * FROM contents WHERE id = @contentId AND tenant_id = @tenantId',
      { contentId, tenantId }
    );

    if (contents.length === 0) {
      throw NotFoundError('Content');
    }

    return contents[0];
  }

  static async delete(tenantId: number, contentId: number): Promise<void> {
    await DatabaseService.execute(
      'DELETE FROM contents WHERE id = @contentId AND tenant_id = @tenantId',
      { contentId, tenantId }
    );
  }
}
