import { AIService } from './ai.service';
import { DatabaseService } from './database.service';

jest.mock('./database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

// This test env has no OPENAI_API_KEY configured, so these calls exercise the
// "AI not available" path. That path used to silently return hardcoded
// placeholder content (a fake course outline, "Sample question about X", etc.)
// as if it were real AI output; it now throws instead so the caller gets an
// honest 503 rather than saveable fictional content.
describe('AIService content generation without a configured AI provider', () => {
  it('generateCourseOutline throws ServiceUnavailableError instead of returning placeholder content', async () => {
    await expect(AIService.generateCourseOutline({ topic: 'Excel' })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('generateLessonContent throws ServiceUnavailableError instead of returning placeholder content', async () => {
    await expect(AIService.generateLessonContent({ title: 'Intro', contentType: 'text' })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('generateQuiz throws ServiceUnavailableError instead of returning a fake sample question', async () => {
    await expect(
      AIService.generateQuiz({ topic: 'Excel', numberOfQuestions: 3, questionTypes: ['multiple_choice'], difficulty: 'easy' })
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('AIService.getRecommendations without a configured AI provider', () => {
  it('falls back to unenrolled courses without a fabricated relevance score', async () => {
    mockedQuery.mockResolvedValue([
      { id: 1, title: 'Course A', description: '', category: 'tech', level: 'beginner' },
      { id: 2, title: 'Course B', description: '', category: 'tech', level: 'beginner' },
    ]);

    const recommendations = await AIService.getRecommendations({
      userId: 1,
      tenantId: 10,
      completedCourses: [],
      preferences: {},
      limit: 5,
    });

    expect(recommendations).toHaveLength(2);
    for (const rec of recommendations) {
      expect(rec).not.toHaveProperty('score');
      expect(rec.courseId).toBeDefined();
    }
  });
});
