import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { QuizQuestionSelector } from '../components/QuizQuestionSelector';
import { Badge } from '../components/ui/badge';
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
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [showSelector, setShowSelector] = useState(false);
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
    if (
      window.confirm('Êtes-vous sûr de vouloir supprimer cette question du quiz?')
    ) {
      removeQuestionMutation.mutate(questionId);
    }
  };

  const handleMoveUp = (questionId: number) => {
    reorderQuestionMutation.mutate({ questionId, direction: 'up' });
  };

  const handleMoveDown = (questionId: number) => {
    reorderQuestionMutation.mutate({ questionId, direction: 'down' });
  };

  if (isLoading) return <div className="p-6">Chargement...</div>;
  if (isError) return <div className="p-6 text-red-600">Erreur lors du chargement</div>;
  if (!quiz) return <div className="p-6">Quiz non trouvé</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          ← Retour
        </button>
        <h1 className="text-3xl font-bold mb-2">{quiz.title}</h1>
        <p className="text-gray-600">
          Gérer les questions du quiz ({quiz.questions?.length || 0} questions)
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
          {showSelector ? 'Masquer le sélecteur' : 'Ajouter des questions'}
        </Button>
      </div>

      {!quiz.questions || quiz.questions.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          Aucune question dans ce quiz. Cliquez sur "Ajouter des questions" pour en ajouter.
        </Card>
      ) : (
        <div className="space-y-3">
          {quiz.questions.map((question: Question, index: number) => (
            <Card key={question.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-600">
                      Q{index + 1}
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
                    title="Déplacer vers le haut"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(question.id)}
                    disabled={index === (quiz.questions?.length || 0) - 1}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Déplacer vers le bas"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveQuestion(question.id)}
                    className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-600"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
