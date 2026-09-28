import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { Course, Module, Lesson, Content, AudienceScope, PaginationParams, FilterParams } from '../types';
import { NotFoundError, ForbiddenError } from '../middleware/error.middleware';
import { ROLE_HIERARCHY } from '../middleware/auth.middleware';
import { teamAssignmentClause } from '../utils/teamAssignment';
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
        // Every course gets an explicit scope now -- 'general' (open to the whole tenant)
        // when the caller doesn't pick anything more specific, rather than a bare NULL
        // whose "open to everyone" meaning was previously just an accident of omission.
        audienceScope: JSON.stringify(data.audienceScope || { level: 'general' }),
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
       WHERE c.id = @courseId AND c.tenant_id = @tenantId AND c.deleted_at IS NULL`,
      { courseId, tenantId }
    );

    if (courses.length === 0) {
      throw NotFoundError('Course');
    }

    const course = courses[0];
    return {
      id: course.id,
      publicId: course.public_id,
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
    } as Course & { publicId: string; creatorName: string; moduleCount: number; avgRating: number; reviewCount: number };
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
    userServiceId?: number,
    userSubsidiaryId?: number
  ): Promise<{ data: Course[]; total: number }> {
    const { page, limit, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.tenant_id = @tenantId AND c.deleted_at IS NULL';
    const params: Record<string, any> = { tenantId, limit, offset };

    // Apply filters
    if (filters.search) {
      whereClause += ` AND (c.title LIKE @search OR c.description LIKE @search)`;
      params.search = `%${filters.search}%`;
    }

    if (filters.category) {
      // 'tech' is the legacy code for 'technology' (see frontend lib/categories.ts).
      const codes = filters.category === 'technology' ? ['technology', 'tech'] : [filters.category];
      whereClause += ` AND c.category IN (${codes.map((_, i) => `@category${i}`).join(', ')})`;
      codes.forEach((code, i) => { params[`category${i}`] = code; });
    }

    if (filters.status === 'published') {
      whereClause += ` AND c.is_published = ${db.bool(true)}`;
    } else if (filters.status === 'draft') {
      whereClause += ` AND c.is_published = ${db.bool(false)}`;
    }

    // Audience-scope filtering, shared with canAccessCourse/getLessonCatalog via
    // audienceScopeCondition (course management roles are exempt -- see its own doc
    // comment -- so they see every course in their tenant, including their own
    // unpublished drafts, not just what a learner would be allowed to browse).
    if (userRole) {
      const audience = this.audienceScopeCondition('c', {
        role: userRole,
        enterpriseId: userEnterpriseId,
        subsidiaryId: userSubsidiaryId,
        directionId: userDirectionId,
        serviceId: userServiceId,
      });
      if (audience.clause !== '1=1') {
        whereClause += ` AND ${audience.clause}`;
        Object.assign(params, audience.params);
      }
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
              (SELECT COUNT(*) FROM course_evaluations WHERE course_id = c.id) as review_count,
              (SELECT COUNT(*) FROM course_assignments WHERE course_id = c.id) as enrolled_count,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.course_id = c.id AND l.module_id = m.id WHERE l.deleted_at IS NULL) as lessons_count
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
        publicId: course.public_id,
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
        enrolledCount: course.enrolled_count,
        lessonsCount: course.lessons_count,
      })),
      total: countResult[0].total,
    };
  }

  /**
   * SQL condition (for use in a WHERE clause against a `courses`-aliased table) that's
   * true iff `user`'s org unit/role matches the course's audience_scope: 'general' (or a
   * NULL audience_scope, treated identically -- courses created before this field had a
   * UI default to NULL and stay equivalent to 'general' indefinitely, no backfill needed)
   * is open to everyone; 'enterprise'/'direction'/'service' check the user's own id is
   * listed in `ids`; 'role' checks the user's role is listed in `roles`. Course management
   * roles (manager and above in ROLE_HIERARCHY, i.e. manager/director/admin/super_admin)
   * always match -- they need to see every course in their tenant, including their own
   * unpublished drafts, not just what a learner would be allowed to browse.
   */
  private static audienceScopeCondition(
    alias: string,
    user: { role: string; enterpriseId?: number; subsidiaryId?: number; directionId?: number; serviceId?: number }
  ): { clause: string; params: Record<string, any> } {
    // Role-hierarchy check (manager and above, e.g. super_admin) rather than a hardcoded
    // list -- a flat list of role names silently excludes any role ranked above 'manager'
    // that isn't spelled out here (this is exactly what happened with 'super_admin' before).
    if ((ROLE_HIERARCHY[user.role] || 0) >= ROLE_HIERARCHY.manager) {
      return { clause: '1=1', params: {} };
    }

    const audienceLevel = db.jsonExtract(`${alias}.audience_scope`, 'level');
    const clause = `(
      ${alias}.is_published = ${db.bool(true)} AND (
        ${alias}.audience_scope IS NULL
        OR ${audienceLevel} = 'general'
        ${user.enterpriseId ? `OR (${audienceLevel} = 'enterprise' AND ${db.jsonArrayContains(`${alias}.audience_scope`, 'ids', '@userEnterpriseId')})` : ''}
        ${user.subsidiaryId ? `OR (${audienceLevel} = 'subsidiary' AND ${db.jsonArrayContains(`${alias}.audience_scope`, 'ids', '@userSubsidiaryId')})` : ''}
        ${user.directionId ? `OR (${audienceLevel} = 'direction' AND ${db.jsonArrayContains(`${alias}.audience_scope`, 'ids', '@userDirectionId')})` : ''}
        ${user.serviceId ? `OR (${audienceLevel} = 'service' AND ${db.jsonArrayContains(`${alias}.audience_scope`, 'ids', '@userServiceId')})` : ''}
        OR (${audienceLevel} = 'role' AND ${db.jsonArrayContains(`${alias}.audience_scope`, 'roles', '@userRole')})
      )
    )`;

    return {
      clause,
      params: {
        userEnterpriseId: user.enterpriseId,
        userSubsidiaryId: user.subsidiaryId,
        userDirectionId: user.directionId,
        userServiceId: user.serviceId,
        userRole: user.role,
      },
    };
  }

  /**
   * Whether a given user is allowed to read a course's content (full structure,
   * individual lessons). findAll() already keeps courses a learner shouldn't see out
   * of their catalog listing, but that's a listing filter only -- nothing previously
   * stopped a learner from reading any course/lesson in the tenant by guessing/
   * incrementing the id in the URL. Extends the audience-scope rule with two paths
   * findAll doesn't need to handle: an existing enrollment (e.g. an admin enrolled the
   * user directly, outside the course's audience_scope), and a course assignment
   * individually targeting the user or their org unit/role (assigning a course doesn't
   * create an enrollment row until the learner actually starts it -- see
   * lesson.routes.ts's "safety net" enrollment-on-first-progress).
   */
  private static accessibleCoursesCondition(
    alias: string,
    user: { id: number; role: string; enterpriseId?: number; subsidiaryId?: number; directionId?: number; serviceId?: number }
  ): { clause: string; params: Record<string, any> } {
    const audience = this.audienceScopeCondition(alias, user);
    if (audience.clause === '1=1') {
      return audience;
    }

    const clause = `(
      ${audience.clause}
      OR EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ${alias}.id AND e.user_id = @userId AND e.tenant_id = @tenantId)
      OR EXISTS (
        SELECT 1 FROM course_assignments ca
        WHERE ca.course_id = ${alias}.id AND ca.tenant_id = @tenantId AND (
          (ca.assignment_type = 'user' AND ca.target_id = @userId)
          ${user.enterpriseId ? `OR (ca.assignment_type = 'enterprise' AND ca.target_id = @userEnterpriseId)` : ''}
          ${user.subsidiaryId ? `OR (ca.assignment_type = 'subsidiary' AND ca.target_id = @userSubsidiaryId)` : ''}
          ${user.directionId ? `OR (ca.assignment_type = 'direction' AND ca.target_id = @userDirectionId)` : ''}
          ${user.serviceId ? `OR (ca.assignment_type = 'service' AND ca.target_id = @userServiceId)` : ''}
          OR (ca.assignment_type = 'role' AND ca.target_role = @userRole)
          OR ${teamAssignmentClause('ca', 'userId', user.enterpriseId ? 'userEnterpriseId' : null, user.directionId ? 'userDirectionId' : null, user.serviceId ? 'userServiceId' : null, user.subsidiaryId ? 'userSubsidiaryId' : null)}
        )
      )
    )`;

    return {
      clause,
      params: { ...audience.params, userId: user.id },
    };
  }

  static async canAccessCourse(
    tenantId: number,
    courseId: number,
    user: { id: number; role: string; enterpriseId?: number; subsidiaryId?: number; directionId?: number; serviceId?: number }
  ): Promise<boolean> {
    const { clause, params } = this.accessibleCoursesCondition('c', user);
    const rows = await DatabaseService.query<{ id: number }>(
      `SELECT c.id FROM courses c
       WHERE c.id = @courseId AND c.tenant_id = @tenantId AND c.deleted_at IS NULL AND ${clause}`,
      { courseId, tenantId, ...params }
    );
    return rows.length > 0;
  }

  /**
   * Lessons across every course `user` may access (see accessibleCoursesCondition),
   * with that user's own progress on each and optional filters -- backs the dashboard's
   * lesson catalog ("continue where I left off" + browse-all).
   */
  static async getLessonCatalog(
    tenantId: number,
    user: { id: number; role: string; enterpriseId?: number; subsidiaryId?: number; directionId?: number; serviceId?: number },
    options: { status?: string; courseId?: number; mandatory?: boolean; page: number; limit: number }
  ): Promise<{ data: any[]; total: number }> {
    const { clause, params: accessParams } = this.accessibleCoursesCondition('c', user);
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    let whereClause = `WHERE l.tenant_id = @tenantId AND l.deleted_at IS NULL AND c.deleted_at IS NULL AND ${clause}`;
    const params: Record<string, any> = { tenantId, userId: user.id, limit, offset, ...accessParams };

    // Learners only get lessons of published courses, matching the dashboard's course
    // list (GET /analytics/my-courses). An enrolled learner can still open an unpublished
    // course by direct link (canAccessCourse is unchanged) -- it just isn't surfaced here.
    // Course management roles (manager and above, same threshold as audienceScopeCondition)
    // keep seeing their drafts.
    if ((ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY.manager) {
      whereClause += ` AND c.is_published = ${db.bool(true)}`;
    }

    if (options.courseId) {
      whereClause += ' AND c.id = @courseId';
      params.courseId = options.courseId;
    }
    if (options.status) {
      whereClause += ' AND lp.status = @status';
      params.status = options.status;
    }
    if (options.mandatory) {
      whereClause += ` AND l.is_mandatory = ${db.bool(true)}`;
    }

    const countResult = await DatabaseService.query<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = @userId AND lp.tenant_id = @tenantId
       ${whereClause}`,
      params
    );

    const lessons = await DatabaseService.query<any>(
      `SELECT l.id, l.public_id, l.title, l.type, l.duration_min, l.position, l.is_mandatory,
              m.id as module_id, m.title as module_title,
              c.id as course_id, c.public_id as course_public_id, c.title as course_title,
              lp.status as progress_status, lp.progress_percent, lp.time_spent_seconds, lp.last_accessed_at
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = @userId AND lp.tenant_id = @tenantId
       ${whereClause}
       ORDER BY CASE WHEN lp.last_accessed_at IS NULL THEN 1 ELSE 0 END, lp.last_accessed_at DESC, c.title, m.position, l.position
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      params
    );

    return { data: lessons, total: countResult[0].total };
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

    // Soft-delete only -- a course that's been taken by learners has real history
    // attached to it (certificates, evaluations, enrollments, lesson_progress).
    // Hard-deleting used to cascade through all of that; now the course and its
    // lessons are just marked deleted_at and drop out of listings, while every
    // learner record stays intact and lookups by id (e.g. an issued certificate's
    // course reference) keep resolving.
    await DatabaseService.execute(
      `UPDATE lessons SET deleted_at = ${db.now()}
       WHERE tenant_id = @tenantId
         AND module_id IN (SELECT id FROM modules WHERE course_id = @courseId AND tenant_id = @tenantId)`,
      { courseId, tenantId }
    );

    await DatabaseService.execute(
      `UPDATE courses SET deleted_at = ${db.now()} WHERE id = @courseId AND tenant_id = @tenantId`,
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

    if (modules.length === 0) {
      return { ...course, modules: [] };
    }

    const moduleIds: number[] = modules.map((m: any) => m.id);
    const modulePlaceholders = moduleIds.map((_, i) => `@moduleId${i}`).join(', ');
    const moduleParams: Record<string, any> = { tenantId };
    moduleIds.forEach((id, i) => { moduleParams[`moduleId${i}`] = id; });

    const allLessons = await DatabaseService.query<any>(
      `SELECT * FROM lessons WHERE module_id IN (${modulePlaceholders}) AND tenant_id = @tenantId AND deleted_at IS NULL ORDER BY module_id, position`,
      moduleParams
    );

    const lessonIds: number[] = allLessons.map((l: any) => l.id);

    const contentsByLesson = new Map<number, any[]>();
    const quizzesByLesson = new Map<number, any[]>();

    if (lessonIds.length > 0) {
      const lessonPlaceholders = lessonIds.map((_, i) => `@lessonId${i}`).join(', ');
      const lessonParams: Record<string, any> = { tenantId };
      lessonIds.forEach((id, i) => { lessonParams[`lessonId${i}`] = id; });

      const [allContents, allQuizzes] = await Promise.all([
        DatabaseService.query<any>(
          `SELECT c.*, f.filename, f.mime_type, f.storage_key
           FROM contents c
           LEFT JOIN file_assets f ON c.file_id = f.id
           WHERE c.lesson_id IN (${lessonPlaceholders}) AND c.tenant_id = @tenantId
           ORDER BY c.lesson_id, c.position`,
          lessonParams
        ),
        DatabaseService.query<any>(
          `SELECT * FROM quizzes WHERE lesson_id IN (${lessonPlaceholders}) AND tenant_id = @tenantId`,
          lessonParams
        ),
      ]);

      for (const content of allContents) {
        const list = contentsByLesson.get(content.lesson_id) || [];
        list.push(content);
        contentsByLesson.set(content.lesson_id, list);
      }
      for (const quiz of allQuizzes) {
        const list = quizzesByLesson.get(quiz.lesson_id) || [];
        list.push(quiz);
        quizzesByLesson.set(quiz.lesson_id, list);
      }
    }

    const lessonsByModule = new Map<number, any[]>();
    for (const lesson of allLessons) {
      const full = {
        ...lesson,
        contents: contentsByLesson.get(lesson.id) || [],
        quizzes: quizzesByLesson.get(lesson.id) || [],
      };
      const list = lessonsByModule.get(lesson.module_id) || [];
      list.push(full);
      lessonsByModule.set(lesson.module_id, list);
    }

    const fullModules = modules.map((module: any) => ({
      ...module,
      lessons: lessonsByModule.get(module.id) || [],
    }));

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
    isMandatory?: boolean;
    presenceCheckPercent?: number | null;
    resetTimeOnReopen?: boolean;
    allowDocumentDownload?: boolean;
  }): Promise<Lesson> {
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO lessons (tenant_id, module_id, title, type, position, duration_min, is_mandatory, presence_check_percent, reset_time_on_reopen, allow_document_download)
           VALUES (@tenantId, @moduleId, @title, @type, @position, @durationMin, @isMandatory, @presenceCheckPercent, @resetTimeOnReopen, @allowDocumentDownload)
           RETURNING id`
        : `INSERT INTO lessons (tenant_id, module_id, title, type, position, duration_min, is_mandatory, presence_check_percent, reset_time_on_reopen, allow_document_download)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @moduleId, @title, @type, @position, @durationMin, @isMandatory, @presenceCheckPercent, @resetTimeOnReopen, @allowDocumentDownload)`,
      {
        tenantId: data.tenantId,
        moduleId: data.moduleId,
        title: data.title,
        type: data.type || null,
        position: data.position,
        durationMin: data.durationMin || null,
        isMandatory: data.isMandatory ?? false,
        presenceCheckPercent: data.presenceCheckPercent ?? null,
        resetTimeOnReopen: data.resetTimeOnReopen ?? false,
        allowDocumentDownload: data.allowDocumentDownload ?? true,
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
    data: {
      title?: string;
      type?: string;
      position?: number;
      durationMin?: number;
      isMandatory?: boolean;
      presenceCheckPercent?: number | null;
      resetTimeOnReopen?: boolean;
      allowDocumentDownload?: boolean;
    }
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
    if (data.isMandatory !== undefined) {
      updateFields.push('is_mandatory = @isMandatory');
      params.isMandatory = data.isMandatory;
    }
    if (data.presenceCheckPercent !== undefined) {
      updateFields.push('presence_check_percent = @presenceCheckPercent');
      params.presenceCheckPercent = data.presenceCheckPercent;
    }
    if (data.resetTimeOnReopen !== undefined) {
      updateFields.push('reset_time_on_reopen = @resetTimeOnReopen');
      params.resetTimeOnReopen = data.resetTimeOnReopen;
    }
    if (data.allowDocumentDownload !== undefined) {
      updateFields.push('allow_document_download = @allowDocumentDownload');
      params.allowDocumentDownload = data.allowDocumentDownload;
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
    // Soft-delete only -- preserves lesson_progress (a learner's completion history)
    // instead of destroying it; the lesson just drops out of listings.
    await DatabaseService.execute(
      `UPDATE lessons SET deleted_at = ${db.now()} WHERE id = @lessonId AND tenant_id = @tenantId`,
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
