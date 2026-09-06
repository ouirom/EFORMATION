import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Quiz {
  id: number;
  title: string;
  description?: string;
  passing_score: number;
  question_count: number;
}

export const LessonQuizzesPage: React.FC = () => {
  const { t } = useTranslation('courses');
  const { t: tCommon } = useTranslation('common');
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lessonIdNum = parseInt(lessonId || '0', 10);
  const [quizPendingDelete, setQuizPendingDelete] = useState<Quiz | null>(null);

  // Fetch quizzes for this lesson
  const { data: quizzesData, isLoading } = useQuery({
    queryKey: ['quizzes', lessonIdNum],
    queryFn: () => api.get(`/quizzes?lessonId=${lessonIdNum}`),
  });

  // Delete quiz mutation
  const deleteQuizMutation = useMutation({
    mutationFn: (quizId: number) => api.delete(`/quizzes/${quizId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes', lessonIdNum] });
    },
  });

  const quizzes: Quiz[] = quizzesData?.data || [];

  const handleDeleteQuiz = (quiz: Quiz) => {
    setQuizPendingDelete(quiz);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          {t('lessonQuizzes.back')}
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('lessonQuizzes.title')}</h1>
            <p className="text-gray-600">{t('lessonQuizzes.quizCount', { count: quizzes.length })}</p>
          </div>
          <Button
            onClick={() => navigate(`/lessons/${lessonId}/quiz/create`)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('lessonQuizzes.createQuiz')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">{t('lessonQuizzes.loading')}</div>
      ) : quizzes.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">{t('lessonQuizzes.empty')}</p>
          <Button onClick={() => navigate(`/lessons/${lessonId}/quiz/create`)}>
            {t('lessonQuizzes.createQuiz')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{quiz.title}</h3>
                  {quiz.description && (
                    <p className="text-sm text-gray-600 mb-2">{quiz.description}</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {t('lessonQuizzes.questionCount', { count: quiz.question_count })}
                    </Badge>
                    <Badge variant="outline">
                      {t('lessonQuizzes.scoreLabel', { score: quiz.passing_score })}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/quizzes/${quiz.id}/manage-questions`)}
                    className="flex items-center gap-1"
                  >
                    <Edit2 className="w-4 h-4" />
                    {t('lessonQuizzes.manage')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteQuiz(quiz)}
                    disabled={deleteQuizMutation.isPending}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!quizPendingDelete}
        onOpenChange={(open) => !open && setQuizPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('lessonQuizzes.confirmDelete', { title: quizPendingDelete?.title })}
        onConfirm={() => {
          if (quizPendingDelete) {
            deleteQuizMutation.mutate(quizPendingDelete.id);
          }
          setQuizPendingDelete(null);
        }}
      />
    </div>
  );
};
