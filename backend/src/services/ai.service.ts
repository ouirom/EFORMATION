import OpenAI from 'openai';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { logger } from '../utils/logger';
import { ServiceUnavailableError } from '../middleware/error.middleware';
import {
  buildAppUsageGuideText,
  matchUsageTopics,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
  SupportedLanguage,
} from '../data/appUsageGuide';

// User-facing strings for the AI tutor, keyed by language -- kept small and
// separate from the app-usage guide (which is about app *features*, not the
// tutor's own chrome/error text).
const TUTOR_STRINGS: Record<SupportedLanguage, {
  systemPrompt: (usageGuide: string, context: string) => string;
  notConfiguredFallback: string;
  noResponse: string;
  processingError: string;
}> = {
  fr: {
    systemPrompt: (usageGuide, context) => `Tu es l'assistant IA d'une plateforme de formation en ligne (e-learning). Tu réponds en français.

Il y a deux types de questions :
1. Questions pédagogiques sur le contenu d'un cours/leçon : aide l'apprenant à comprendre les concepts et guide-le vers la réponse sans la lui donner directement. Sois encourageant et pédagogue.
2. Questions sur le fonctionnement de l'application elle-même (comment faire telle ou telle action, où trouver telle page) : réponds directement et précisément en te basant UNIQUEMENT sur le guide d'utilisation ci-dessous. Ne réponds jamais avec une fonctionnalité qui n'y figure pas.

Guide d'utilisation de l'application :
${usageGuide}
${context ? `\nContexte sur la leçon/cours actuel :\n${context}` : ''}`,
    notConfiguredFallback:
      "Désolé, l'assistant IA n'est pas configuré sur ce serveur pour l'instant, et je n'ai pas trouvé de rubrique d'aide correspondant à votre question. Essayez de reformuler, consultez l'aide contextuelle (F1) sur la page concernée, ou contactez votre formateur/administrateur.",
    noResponse: "Je n'ai pas pu générer de réponse. Essayez de reformuler votre question.",
    processingError: "J'ai du mal à traiter votre question pour le moment. Merci de réessayer dans un instant.",
  },
  en: {
    systemPrompt: (usageGuide, context) => `You are the AI assistant of an online learning (e-learning) platform. You answer in English.

There are two kinds of questions:
1. Pedagogical questions about a course/lesson's content: help the learner understand the concepts and guide them toward the answer without giving it away directly. Be encouraging and educational.
2. Questions about how the application itself works (how to do something, where to find a page): answer directly and precisely, based ONLY on the usage guide below. Never answer with a feature that isn't listed there.

Application usage guide:
${usageGuide}
${context ? `\nContext about the current lesson/course:\n${context}` : ''}`,
    notConfiguredFallback:
      "Sorry, the AI assistant isn't configured on this server yet, and I couldn't find a help topic matching your question. Try rephrasing, check the contextual help (F1) on the relevant page, or contact your instructor/administrator.",
    noResponse: "I couldn't generate a response. Please try rephrasing your question.",
    processingError: "I'm having trouble processing your question right now. Please try again in a moment.",
  },
};

const openai = config.openai.apiKey
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;

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

export class AIService {
  /**
   * Generate course outline using AI
   */
  static async generateCourseOutline(input: CourseOutlineInput): Promise<any> {
    if (!openai) {
      throw ServiceUnavailableError('AI content generation is not configured on this server');
    }

    const prompt = `Create a detailed course outline for: "${input.topic}"
${input.targetAudience ? `Target audience: ${input.targetAudience}` : ''}
${input.duration ? `Duration: ${input.duration}` : ''}
${input.objectives?.length ? `Learning objectives:\n${input.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : ''}

Please provide a structured JSON response with the following format:
{
  "title": "Course title",
  "description": "Course description",
  "objectives": ["objective1", "objective2"],
  "modules": [
    {
      "title": "Module title",
      "description": "Module description",
      "lessons": [
        {
          "title": "Lesson title",
          "description": "Brief description",
          "duration_minutes": 30,
          "content_types": ["text", "video", "quiz"]
        }
      ]
    }
  ],
  "estimated_duration_hours": 10,
  "difficulty_level": "beginner|intermediate|advanced"
}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert instructional designer. Create well-structured, pedagogically sound course outlines. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      return JSON.parse(responseText);
    } catch (error) {
      logger.error('AI course outline generation failed', { error });
      throw ServiceUnavailableError('AI course outline generation failed');
    }
  }

  /**
   * Generate lesson content
   */
  static async generateLessonContent(input: LessonContentInput): Promise<any> {
    if (!openai) {
      throw ServiceUnavailableError('AI content generation is not configured on this server');
    }

    const contentPrompts: Record<string, string> = {
      text: 'Create comprehensive educational content',
      interactive: 'Create interactive content with exercises and checkpoints',
      summary: 'Create a concise summary with key takeaways',
    };

    const prompt = `${contentPrompts[input.contentType]} for a lesson titled: "${input.title}"
${input.courseContext ? `Course context: ${input.courseContext}` : ''}

Provide the content in markdown format with:
- Clear headings and subheadings
- Key concepts highlighted
- Examples where applicable
- Summary points at the end`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert educator creating engaging learning content.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });

      return {
        content: completion.choices[0]?.message?.content || '',
        contentType: input.contentType,
      };
    } catch (error) {
      logger.error('AI lesson content generation failed', { error });
      throw ServiceUnavailableError('AI lesson content generation failed');
    }
  }

  /**
   * Generate quiz questions
   */
  static async generateQuiz(input: QuizGenerationInput): Promise<any> {
    if (!openai) {
      throw ServiceUnavailableError('AI content generation is not configured on this server');
    }

    const prompt = `Generate ${input.numberOfQuestions} quiz questions about: "${input.topic}"
Difficulty: ${input.difficulty}
Question types: ${input.questionTypes.join(', ')}
${input.sourceContent ? `Based on this content:\n${input.sourceContent.substring(0, 2000)}` : ''}

Respond with JSON:
{
  "questions": [
    {
      "type": "multiple_choice|true_false|short_answer",
      "question": "Question text",
      "choices": [{"text": "Choice A", "is_correct": false}, {"text": "Choice B", "is_correct": true}],
      "explanation": "Why the correct answer is correct",
      "points": 10
    }
  ]
}`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert assessment designer. Create clear, fair, and educational quiz questions. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });

      const responseText = completion.choices[0]?.message?.content || '{"questions": []}';
      return JSON.parse(responseText);
    } catch (error) {
      logger.error('AI quiz generation failed', { error });
      throw ServiceUnavailableError('AI quiz generation failed');
    }
  }

  /**
   * Improve text using AI
   */
  static async improveText(input: TextImprovementInput): Promise<{ text: string }> {
    if (!openai) {
      return { text: input.text };
    }

    const actionPrompts: Record<string, string> = {
      improve: 'Improve the clarity, flow, and professionalism of this text while maintaining its meaning',
      simplify: 'Simplify this text to make it easier to understand, using simpler words and shorter sentences',
      elaborate: 'Expand and elaborate on this text, adding more detail and explanation',
      fix_grammar: 'Fix any grammar, spelling, and punctuation errors in this text',
      translate: `Translate this text to ${input.targetLanguage || 'English'}`,
    };

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a professional editor and writer.' },
          { role: 'user', content: `${actionPrompts[input.action]}:\n\n${input.text}` },
        ],
        temperature: 0.5,
        max_tokens: 2000,
      });

      return { text: completion.choices[0]?.message?.content || input.text };
    } catch (error) {
      logger.error('AI text improvement failed', { error });
      return { text: input.text };
    }
  }

  /**
   * Get personalized course recommendations
   */
  static async getRecommendations(input: RecommendationInput): Promise<any[]> {
    // Get available courses
    const availableCourses = await DatabaseService.query<any>(
      `SELECT c.id, c.title, c.description, c.category, c.level
       FROM courses c
       WHERE c.tenant_id = @tenantId AND c.is_published = ${db.bool(true)} AND c.deleted_at IS NULL
       AND c.id NOT IN (SELECT course_id FROM enrollments WHERE user_id = @userId)`,
      { tenantId: input.tenantId, userId: input.userId }
    );

    if (!openai || availableCourses.length === 0) {
      // No relevance score is computed here -- this is just "courses you
      // haven't enrolled in yet", not a ranked AI recommendation, so we don't
      // attach a fabricated score to it.
      return availableCourses.slice(0, input.limit).map((c: any) => ({
        courseId: c.id,
        title: c.title,
        reason: 'Not yet enrolled',
      }));
    }

    const prompt = `Based on the user's learning history and preferences, recommend the most suitable courses.

Completed courses: ${JSON.stringify(input.completedCourses.map(c => c.title))}
User interests: ${input.preferences.interests || 'Not specified'}
Learning goals: ${input.preferences.learning_goals || 'Not specified'}

Available courses:
${availableCourses.map((c: any) => `- ID: ${c.id}, Title: ${c.title}, Category: ${c.category || 'General'}, Difficulty: ${c.difficulty_level || 'intermediate'}`).join('\n')}

Respond with JSON array of top ${input.limit} recommendations:
[{"courseId": 1, "score": 0.95, "reason": "Why this course is recommended"}]`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a learning recommendation system. Provide personalized course recommendations. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      });

      const responseText = completion.choices[0]?.message?.content || '[]';
      const recommendations = JSON.parse(responseText);
      
      // Enrich with course details
      return recommendations.map((rec: any) => {
        const course = availableCourses.find((c: any) => c.id === rec.courseId);
        return { ...rec, title: course?.title, category: course?.category };
      });
    } catch (error) {
      logger.error('AI recommendations failed', { error });
      return availableCourses.slice(0, input.limit).map((c: any) => ({
        courseId: c.id,
        title: c.title,
        reason: 'Not yet enrolled',
      }));
    }
  }

  /**
   * Get next learning steps recommendations
   */
  static async getNextSteps(input: { currentEnrollments: any[]; recentQuizResults: any[] }): Promise<any> {
    const steps: any[] = [];

    // Add steps for ongoing courses
    input.currentEnrollments.forEach((enrollment: any) => {
      if (enrollment.next_lesson) {
        steps.push({
          type: 'continue_course',
          priority: 'high',
          action: `Continue "${enrollment.course_title}"`,
          detail: `Next: ${enrollment.next_lesson}`,
          progress: enrollment.progress,
        });
      }
    });

    // Check for failed quizzes
    const failedQuizzes = input.recentQuizResults.filter((q: any) => !q.passed);
    failedQuizzes.forEach((quiz: any) => {
      steps.push({
        type: 'retry_quiz',
        priority: 'medium',
        action: `Retry "${quiz.title}"`,
        detail: `Previous score: ${quiz.score}%`,
      });
    });

    return {
      recommendedSteps: steps.slice(0, 5),
      summary: steps.length > 0 
        ? `You have ${steps.length} recommended learning actions`
        : 'Great job! Consider exploring new courses.',
    };
  }

  /**
   * AI Tutor - Answer questions. Handles two kinds of questions: pedagogical
   * ("explain this concept") using lesson/course context, and app-usage
   * ("how do I do X in this platform") using the built-in usage guide -- the
   * model previously had zero knowledge of the app's own features/navigation,
   * so it either hallucinated or refused those questions.
   */
  static async askTutor(input: {
    question: string;
    context: string;
    userId: number;
    role: string;
    language?: string;
  }): Promise<string> {
    const language: SupportedLanguage = isSupportedLanguage(input.language) ? input.language : DEFAULT_LANGUAGE;
    const strings = TUTOR_STRINGS[language];
    const usageGuide = buildAppUsageGuideText(input.role, language);

    if (!openai) {
      // No AI provider configured: still answer app-usage questions correctly via
      // keyword matching against the same guide, instead of a blanket "unavailable"
      // message regardless of what was actually asked.
      const matches = matchUsageTopics(input.question, input.role, language);
      if (matches.length > 0) {
        return matches.map((m) => `**${m.title}**\n${m.answer}`).join('\n\n');
      }
      return strings.notConfiguredFallback;
    }

    // Get recent chat history for context
    const history = await DatabaseService.query<any>(
      IS_PG
        ? `SELECT role, message FROM ai_chat_history
           WHERE user_id = @userId
           ORDER BY created_at DESC LIMIT 10`
        : `SELECT TOP 10 role, message FROM ai_chat_history
           WHERE user_id = @userId
           ORDER BY created_at DESC`,
      { userId: input.userId }
    );

    const messages: any[] = [
      { role: 'system', content: strings.systemPrompt(usageGuide, input.context) },
      ...history.reverse().map((h: any) => ({ role: h.role, content: h.message })),
      { role: 'user', content: input.question },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      return completion.choices[0]?.message?.content || strings.noResponse;
    } catch (error) {
      logger.error('AI tutor failed', { error });
      return strings.processingError;
    }
  }

  /**
   * Analyze learning patterns
   */
  static async analyzeLearningPatterns(input: { activityData: any[]; progressData: any[] }): Promise<any> {
    // Calculate peak learning hours
    const peakHours = input.activityData
      .sort((a, b) => b.activity_count - a.activity_count)
      .slice(0, 3)
      .map(a => a.hour);

    // Calculate average completion time
    const completedCourses = input.progressData.filter(p => p.completed_at);
    const avgCompletionDays = completedCourses.length > 0
      ? completedCourses.reduce((sum, c) => sum + c.days_elapsed, 0) / completedCourses.length
      : 0;

    return {
      peakLearningHours: peakHours,
      averageCompletionDays: Math.round(avgCompletionDays),
      totalCoursesCompleted: completedCourses.length,
      inProgressCourses: input.progressData.filter(p => !p.completed_at).length,
      insights: [
        peakHours.length > 0 ? `You're most active around ${peakHours[0]}:00` : 'Not enough data to determine peak hours',
        avgCompletionDays > 0 ? `On average, you complete courses in ${Math.round(avgCompletionDays)} days` : 'Complete a course to see your pace',
      ],
    };
  }

  /**
   * Analyze course effectiveness
   */
  static async analyzeCourseEffectiveness(input: { completionData: any; quizData: any[] }): Promise<any> {
    const completionRate = input.completionData.total_enrollments > 0
      ? (input.completionData.completions / input.completionData.total_enrollments) * 100
      : 0;

    const avgQuizScore = input.quizData.length > 0
      ? input.quizData.reduce((sum, q) => sum + q.avg_score, 0) / input.quizData.length
      : 0;

    const avgPassRate = input.quizData.length > 0
      ? input.quizData.reduce((sum, q) => sum + q.pass_rate, 0) / input.quizData.length
      : 0;

    return {
      metrics: {
        completionRate: Math.round(completionRate * 10) / 10,
        averageProgress: Math.round(input.completionData.avg_progress * 10) / 10,
        totalEnrollments: input.completionData.total_enrollments,
        totalCompletions: input.completionData.completions,
        averageQuizScore: Math.round(avgQuizScore * 10) / 10,
        averagePassRate: Math.round(avgPassRate * 10) / 10,
      },
      quizBreakdown: input.quizData,
      recommendations: [
        completionRate < 50 ? 'Consider breaking content into smaller modules' : null,
        avgPassRate < 70 ? 'Quiz difficulty may need adjustment' : null,
        input.completionData.avg_progress < 30 ? 'Early engagement may need improvement' : null,
      ].filter(Boolean),
    };
  }

}
