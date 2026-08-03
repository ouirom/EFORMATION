interface CourseOutlineInput {
    topic: string;
    targetAudience?: string;
    duration?: string;
    objectives?: string[];
}
interface LessonContentInput {
    title: string;
    courseContext?: string;
    contentType: 'text' | 'interactive' | 'summary';
}
interface QuizGenerationInput {
    topic: string;
    numberOfQuestions: number;
    questionTypes: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    sourceContent?: string;
}
interface TextImprovementInput {
    text: string;
    action: 'improve' | 'simplify' | 'elaborate' | 'fix_grammar' | 'translate';
    targetLanguage?: string;
}
interface RecommendationInput {
    userId: number;
    tenantId: number;
    completedCourses: any[];
    preferences: any;
    limit: number;
}
export declare class AIService {
    /**
     * Generate course outline using AI
     */
    static generateCourseOutline(input: CourseOutlineInput): Promise<any>;
    /**
     * Generate lesson content
     */
    static generateLessonContent(input: LessonContentInput): Promise<any>;
    /**
     * Generate quiz questions
     */
    static generateQuiz(input: QuizGenerationInput): Promise<any>;
    /**
     * Improve text using AI
     */
    static improveText(input: TextImprovementInput): Promise<{
        text: string;
    }>;
    /**
     * Get personalized course recommendations
     */
    static getRecommendations(input: RecommendationInput): Promise<any[]>;
    /**
     * Get next learning steps recommendations
     */
    static getNextSteps(input: {
        currentEnrollments: any[];
        recentQuizResults: any[];
    }): Promise<any>;
    /**
     * AI Tutor - Answer questions
     */
    static askTutor(input: {
        question: string;
        context: string;
        userId: number;
    }): Promise<string>;
    /**
     * Analyze learning patterns
     */
    static analyzeLearningPatterns(input: {
        activityData: any[];
        progressData: any[];
    }): Promise<any>;
    /**
     * Analyze course effectiveness
     */
    static analyzeCourseEffectiveness(input: {
        completionData: any;
        quizData: any[];
    }): Promise<any>;
    private static getMockCourseOutline;
    private static getMockLessonContent;
    private static getMockQuiz;
}
export {};
//# sourceMappingURL=ai.service.d.ts.map