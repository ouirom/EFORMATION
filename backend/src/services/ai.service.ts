import OpenAI from 'openai';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { logger } from '../utils/logger';

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
      return this.getMockCourseOutline(input);
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
      return this.getMockCourseOutline(input);
    }
  }

  /**
   * Generate lesson content
   */
  static async generateLessonContent(input: LessonContentInput): Promise<any> {
    if (!openai) {
      return this.getMockLessonContent(input);
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
      return this.getMockLessonContent(input);
    }
  }

  /**
   * Generate quiz questions
   */
  static async generateQuiz(input: QuizGenerationInput): Promise<any> {
    if (!openai) {
      return this.getMockQuiz(input);
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
      return this.getMockQuiz(input);
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
      `SELECT c.id, c.title, c.description, c.category, c.difficulty_level
       FROM courses c
       WHERE c.tenant_id = @tenantId AND c.status = 'published'
       AND c.id NOT IN (SELECT course_id FROM enrollments WHERE user_id = @userId)`,
      { tenantId: input.tenantId, userId: input.userId }
    );

    if (!openai || availableCourses.length === 0) {
      return availableCourses.slice(0, input.limit).map((c: any) => ({
        courseId: c.id,
        title: c.title,
        score: 0.8,
        reason: 'Recommended based on your interests',
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
        score: 0.8,
        reason: 'Recommended based on availability',
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
   * AI Tutor - Answer questions
   */
  static async askTutor(input: { question: string; context: string; userId: number }): Promise<string> {
    if (!openai) {
      return "I'm sorry, the AI tutor is currently unavailable. Please try again later or contact your instructor for help.";
    }

    // Get recent chat history for context
    const history = await DatabaseService.query<any>(
      `SELECT TOP 10 role, message FROM ai_chat_history 
       WHERE user_id = @userId 
       ORDER BY created_at DESC`,
      { userId: input.userId }
    );

    const messages: any[] = [
      { 
        role: 'system', 
        content: `You are a helpful AI tutor for an e-learning platform. Your goal is to help students understand concepts and guide them to answers without just giving away solutions. Be encouraging and educational.
${input.context ? `\nContext about the current lesson:\n${input.context}` : ''}` 
      },
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

      return completion.choices[0]?.message?.content || "I couldn't generate a response. Please try rephrasing your question.";
    } catch (error) {
      logger.error('AI tutor failed', { error });
      return "I'm having trouble processing your question right now. Please try again in a moment.";
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

  // Mock responses when AI is not available
  private static getMockCourseOutline(input: CourseOutlineInput): any {
    return {
      title: input.topic,
      description: `A comprehensive course on ${input.topic}`,
      objectives: input.objectives || ['Understand key concepts', 'Apply knowledge practically'],
      modules: [
        {
          title: 'Introduction',
          description: 'Getting started with the basics',
          lessons: [
            { title: 'Overview', description: 'Introduction to the topic', duration_minutes: 30, content_types: ['text', 'video'] },
            { title: 'Key Concepts', description: 'Understanding fundamental concepts', duration_minutes: 45, content_types: ['text', 'quiz'] },
          ],
        },
        {
          title: 'Core Content',
          description: 'Deep dive into the subject',
          lessons: [
            { title: 'Main Topic', description: 'Detailed exploration', duration_minutes: 60, content_types: ['text', 'video', 'quiz'] },
          ],
        },
      ],
      estimated_duration_hours: 5,
      difficulty_level: 'intermediate',
    };
  }

  private static getMockLessonContent(input: LessonContentInput): any {
    return {
      content: `# ${input.title}\n\nThis is placeholder content for the lesson. The AI content generation feature is not currently available.\n\n## Key Points\n- Point 1\n- Point 2\n- Point 3\n\n## Summary\nPlease add your content here.`,
      contentType: input.contentType,
    };
  }

  private static getMockQuiz(input: QuizGenerationInput): any {
    return {
      questions: [
        {
          type: 'multiple_choice',
          question: `Sample question about ${input.topic}`,
          choices: [
            { text: 'Option A', is_correct: false },
            { text: 'Option B', is_correct: true },
            { text: 'Option C', is_correct: false },
            { text: 'Option D', is_correct: false },
          ],
          explanation: 'Option B is correct because...',
          points: 10,
        },
      ],
    };
  }
}
