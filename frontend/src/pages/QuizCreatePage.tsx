import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { QuizQuestionSelector } from '../components/QuizQuestionSelector';
import { Textarea } from '../components/ui/textarea';
import { useOrganization } from '@/lib/tenantSettings';

export const QuizCreatePage: React.FC = () => {
  const { t } = useTranslation('courses');
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  // New quizzes start from the organization's pass mark (Administration > Organisation).
  const { data: organization } = useOrganization();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    instructions: '',
    passingScore: organization?.settings?.quizDefaultPassingScore ?? 70,
    randomized: false,
    timeLimitMinutes: 0,
    questionsToDraw: 0,
  });
  const [createdQuizId, setCreatedQuizId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createQuizMutation = useMutation({
    mutationFn: (data: any) => api.post('/quizzes', data),
    onSuccess: (response) => {
      // FIX: la réponse est enveloppée dans data.data
      const quiz = response.data?.data ?? response.data;
      const quizId = quiz?.id;
      if (quizId) {
        setCreatedQuizId(quizId);
        setCreateError(null);
      } else {
        setCreateError(t('quizCreate.quizIdMissing'));
        console.error('Unexpected response shape:', response.data);
      }
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        t('quizCreate.creationError');
      setCreateError(msg);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonId) return;
    setCreateError(null);

    createQuizMutation.mutate({
      ...formData,
      lessonId: parseInt(lessonId, 10),
      // FIX: 0 n'est pas une limite de temps valide → envoyer null
      timeLimitMinutes: formData.timeLimitMinutes > 0 ? formData.timeLimitMinutes : null,
      questionsToDraw: formData.questionsToDraw > 0 ? formData.questionsToDraw : null,
    } as any);
  };

  if (createdQuizId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t('quizCreate.createdTitle')}</h1>
          <p className="text-gray-600">
            {t('quizCreate.selectQuestionsHint')}
          </p>
        </div>

        <Card className="p-6">
          <QuizQuestionSelector
            quizId={createdQuizId}
            onClose={() => navigate(`/lessons/${lessonId}/quizzes`)}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          {t('quizCreate.back')}
        </button>
        <h1 className="text-3xl font-bold">{t('quizCreate.title')}</h1>
      </div>

      <form onSubmit={handleCreateQuiz} className="space-y-4">
        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('quizCreate.titleLabel')}</label>
            <Input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder={t('quizCreate.titlePlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('quizCreate.descriptionLabel')}</label>
            <Textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder={t('quizCreate.descriptionPlaceholder')}
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('quizCreate.instructionsLabel')}</label>
            <Textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleChange}
              placeholder={t('quizCreate.instructionsPlaceholder')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('quizCreate.passingScoreLabel')}
              </label>
              <Input
                name="passingScore"
                type="number"
                min="0"
                max="100"
                value={formData.passingScore}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('quizCreate.timeLimitLabel')}
              </label>
              <Input
                name="timeLimitMinutes"
                type="number"
                min="0"
                value={formData.timeLimitMinutes}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('quizCreate.questionsToDrawLabel')}
            </label>
            <Input
              name="questionsToDraw"
              type="number"
              min="0"
              value={formData.questionsToDraw}
              onChange={handleChange}
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('quizCreate.questionsToDrawHint')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="randomized"
              id="randomized"
              checked={formData.randomized}
              onChange={handleChange}
              className="rounded"
            />
            <label htmlFor="randomized" className="text-sm font-medium cursor-pointer">
              {t('quizCreate.randomize')}
            </label>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={createQuizMutation.isPending}>
            {createQuizMutation.isPending ? t('quizCreate.creating') : t('quizCreate.create')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            {t('quizCreate.cancel')}
          </Button>
        </div>

        {createError && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">
            {createError}
          </div>
        )}
      </form>
    </div>
  );
};
