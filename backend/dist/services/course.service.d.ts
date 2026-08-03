import { Course, Module, Lesson, Content, AudienceScope, PaginationParams, FilterParams } from '../types';
interface CreateCourseDTO {
    tenantId: number;
    title: string;
    description?: string;
    category?: string;
    level?: string;
    duration?: number;
    audienceScope?: AudienceScope;
    prerequisites?: {
        courseIds?: number[];
        badgeIds?: number[];
    };
    createdBy: number;
}
interface UpdateCourseDTO {
    title?: string;
    description?: string;
    category?: string;
    level?: string;
    duration?: number;
    audienceScope?: AudienceScope;
    prerequisites?: {
        courseIds?: number[];
        badgeIds?: number[];
    };
    isPublished?: boolean;
}
export declare class CourseService {
    /**
     * Create a new course
     */
    static create(data: CreateCourseDTO): Promise<Course>;
    /**
     * Get course by ID
     */
    static findById(tenantId: number, courseId: number): Promise<Course>;
    /**
     * List courses with pagination and filtering
     */
    static findAll(tenantId: number, pagination: PaginationParams, filters: FilterParams, userId?: number, userRole?: string, userEnterpriseId?: number, userDirectionId?: number, userServiceId?: number): Promise<{
        data: Course[];
        total: number;
    }>;
    /**
     * Get all course categories
     */
    static getCategories(tenantId: number): Promise<{
        id: string;
        name: string;
        count: number;
    }[]>;
    /**
     * Update course
     */
    static update(tenantId: number, courseId: number, data: UpdateCourseDTO, userId: number, userRole: string): Promise<Course>;
    /**
     * Delete course
     */
    static delete(tenantId: number, courseId: number, userId: number, userRole: string): Promise<void>;
    /**
     * Publish course
     */
    static publish(tenantId: number, courseId: number): Promise<Course>;
    /**
     * Unpublish course
     */
    static unpublish(tenantId: number, courseId: number): Promise<Course>;
    /**
     * Get full course structure (with modules, lessons, contents)
     */
    static getFullStructure(tenantId: number, courseId: number): Promise<any>;
    /**
     * Clone course
     */
    static clone(tenantId: number, courseId: number, newTitle: string, userId: number): Promise<Course>;
    /**
     * Get course statistics
     */
    static getStatistics(tenantId: number, courseId: number): Promise<any>;
}
export declare class ModuleService {
    static create(data: {
        tenantId: number;
        courseId: number;
        title: string;
        position: number;
    }): Promise<Module>;
    static update(tenantId: number, moduleId: number, data: {
        title?: string;
        position?: number;
    }): Promise<Module>;
    static delete(tenantId: number, moduleId: number): Promise<void>;
    static reorder(tenantId: number, courseId: number, moduleIds: number[]): Promise<void>;
}
export declare class LessonService {
    static create(data: {
        tenantId: number;
        moduleId: number;
        title: string;
        type?: string;
        position: number;
        durationMin?: number;
    }): Promise<Lesson>;
    static update(tenantId: number, lessonId: number, data: {
        title?: string;
        type?: string;
        position?: number;
        durationMin?: number;
    }): Promise<Lesson>;
    static delete(tenantId: number, lessonId: number): Promise<void>;
}
export declare class ContentService {
    static create(data: {
        tenantId: number;
        lessonId: number;
        type: string;
        title: string;
        body?: string;
        fileId?: number;
        url?: string;
        position: number;
    }): Promise<Content>;
    static update(tenantId: number, contentId: number, data: {
        title?: string;
        body?: string;
        fileId?: number;
        url?: string;
        position?: number;
    }): Promise<Content>;
    static delete(tenantId: number, contentId: number): Promise<void>;
}
export {};
//# sourceMappingURL=course.service.d.ts.map