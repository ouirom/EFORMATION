import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { QuizQuestionSelector } from '../components/QuizQuestionSelector';
import { Badge } from '../components/ui/badge';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

interface Question {
  id: number;
  type: string;
  prompt: string;
  position: number;
  choices?: Array<{ id: number; label: string; isCorrect: boolean }>;
}

interface Quiz {
  id: number;
  title: string;
  description?: string;
  questions: Question[];
}

export const QuizManageQuestionsPage: React.FC = () => {
  const { t } = useTranslation('courses');
  const { t: tCommon } = useTranslation('common');
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [showSelector, setShowSelector] = useState(false);
  const [questionPendingDelete, setQuestionPendingDelete] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const quizIdNum = parseInt(quizId || '0', 10);

  // Fetch quiz with questions
  const { data: quizData, isLoading, isError } = useQuery({
    queryKey: ['quiz', quizIdNum],
    queryFn: () => api.get(`/quizzes/${quizIdNum}`),
  });

  const quiz: Quiz = quizData?.data;

  // Remove question mutation
  const removeQuestionMutation = useMutation({
    mutationFn: (questionId: number) =>
      api.post(`/quizzes/${quizIdNum}/remove-question/${questionId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizIdNum] });
    },
  });

  // Reorder questions mutation
  const reorderQuestionMutation = useMutation({
    mutationFn: ({ questionId, direction }: { questionId: number; direction: 'up' | 'down' }) =>
      api.post(`/quizzes/${quizIdNum}/reorder-question`, {
        questionId,
        direction,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizIdNum] });
    },
  });

  const handleRemoveQuestion = (questionId: number) => {
    setQuestionPendingDelete(questionId);
  };

  const handleMoveUp = (questionId: number) => {
    reorderQuestionMutation.mutate({ questionId, direction: 'up' });
  };

  const handleMoveDown = (questionId: number) => {
    reorderQuestionMutation.mutate({ questionId, direction: 'down' });
  };

  if (isLoading) return <div className="p-6">{t('quizManageQuestions.loading')}</div>;
  if (isError) return <div className="p-6 text-red-600">{t('quizManageQuestions.loadError')}</div>;
  if (!quiz) return <div className="p-6">{t('quizManageQuestions.notFound')}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          {t('quizManageQuestions.back')}
        </button>
        <h1 className="text-3xl font-bold mb-2">{quiz.title}</h1>
        <p className="text-gray-600">
          {t('quizManageQuestions.manageQuestions', { count: quiz.questions?.length || 0 })}
        </p>
      </div>

      {showSelector ? (
        <Card className="p-6 mb-6">
          <QuizQuestionSelector
            quizId={quizIdNum}
            onClose={() => setShowSelector(false)}
          />
        </Card>
      ) : null}

      <div className="flex gap-2 mb-6">
        <Button onClick={() => setShowSelector(!showSelector)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {showSelector ? t('quizManageQuestions.hideSelector') : t('quizManageQuestions.addQuestions')}
        </Button>
      </div>

      {!quiz.questions || quiz.questions.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          {t('quizManageQuestions.empty')}
        </Card>
      ) : (
        <div className="space-y-3">
          {quiz.questions.map((question: Question, index: number) => (
            <Card key={question.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-600">
                      {t('quizManageQuestions.questionLabel', { number: index + 1 })}
                    </span>
                    <Badge variant="secondary">{question.type}</Badge>
                  </div>
                  <p className="text-sm break-words">{question.prompt}</p>
                  {question.choices && (
                    <div className="mt-3 ml-4 space-y-1">
                      {question.choices.map((choice) => (
                        <div
                          key={choice.id}
                          className={`text-xs p-2 rounded ${
                            choice.isCorrect
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          {choice.isCorrect && '✓ '} {choice.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMoveUp(question.id)}
                    disabled={index === 0}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('quizManageQuestions.moveUp')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(question.id)}
                    disabled={index === (quiz.questions?.length || 0) - 1}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('quizManageQuestions.moveDown')}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveQuestion(question.id)}
                    className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-600"
                    title={t('quizManageQuestions.remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={questionPendingDelete !== null}
        onOpenChange={(open) => !open && setQuestionPendingDelete(null)}
        title={t('quizManageQuestions.remove')}
        description={t('quizManageQuestions.confirmRemove')}
        confirmLabel={tCommon('actions.remove')}
        onConfirm={() => {
          if (questionPendingDelete !== null) {
            removeQuestionMutation.mutate(questionPendingDelete);
          }
          setQuestionPendingDelete(null);
        }}
      />
    </div>
  );
};
