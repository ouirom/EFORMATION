import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { AlertTriangle } from 'lucide-react';

interface Question {
  id: number;
  type: string;
  prompt: string;
  choice_count?: number;
}

interface QuizQuestionSelectorProps {
  quizId: number;
  onClose?: () => void;
}

export const QuizQuestionSelector: React.FC<QuizQuestionSelectorProps> = ({
  quizId,
  onClose,
}) => {
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  // Fetch quiz questions (currently added)
  const { data: quizData, isLoading: quizLoading, error: quizError } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const response = await api.get(`/quizzes/${quizId}`);
      return response.data;
    },
  });

  // Fetch available questions (not in any quiz)
  const { data: availableData, isLoading: availableLoading, error: availableError } = useQuery({
    queryKey: ['available-questions', quizId],
    queryFn: async () => {
      const response = await api.get(`/quizzes/${quizId}/available-questions`);
      return response.data;
    },
    retry: 1,
  });

  // Initialize with currently added questions
  useEffect(() => {
    if (quizData?.questions) {
      setSelectedQuestions(quizData.questions.map((q: Question) => q.id));
    }
  }, [quizData]);

  // Add questions mutation
  const addQuestionsMutation = useMutation({
    mutationFn: (questionIds: number[]) =>
      api.post(`/quizzes/${quizId}/add-questions`, { questionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      queryClient.invalidateQueries({ queryKey: ['available-questions', quizId] });
    },
    onError: (error: any) => {
      console.error('Error adding questions:', error.response?.data || error.message);
    },
  });

  // Remove question mutation
  const removeQuestionMutation = useMutation({
    mutationFn: (questionId: number) =>
      api.post(`/quizzes/${quizId}/remove-question/${questionId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      queryClient.invalidateQueries({ queryKey: ['available-questions', quizId] });
    },
    onError: (error: any) => {
      console.error('Error removing question:', error.response?.data || error.message);
    },
  });

  const availableQuestions = availableData?.data || [];

  const filteredQuestions = availableQuestions.filter((q: Question) =>
    q.prompt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleQuestion = async (questionId: number) => {
    if (selectedQuestions.includes(questionId)) {
      // Remove
      setSelectedQuestions((prev) => prev.filter((id) => id !== questionId));
      removeQuestionMutation.mutate(questionId);
    } else {
      // Add
      setSelectedQuestions((prev) => [...prev, questionId]);
      addQuestionsMutation.mutate([questionId]);
    }
  };

  const handleAddAll = () => {
    const unselected = filteredQuestions
      .filter((q: Question) => !selectedQuestions.includes(q.id))
      .map((q: Question) => q.id);

    if (unselected.length > 0) {
      setSelectedQuestions((prev) => [...prev, ...unselected]);
      addQuestionsMutation.mutate(unselected);
    }
  };

  const handleRemoveAll = () => {
    const questionsToRemove = [...selectedQuestions];
    setSelectedQuestions([]);
    questionsToRemove.forEach((id) => {
      removeQuestionMutation.mutate(id);
    });
  };

  const isLoading = quizLoading || availableLoading;
  const hasError = quizError || availableError;

  // Check for permission error
  const isPermissionError = 
    (availableError as any)?.response?.status === 403 ||
    (quizError as any)?.response?.status === 403;

  const permissionErrorMessage = isPermissionError
    ? 'Vous n\'avez pas les permissions nécessaires pour gérer les questions de ce quiz. Seuls les administrateurs, directeurs et responsables peuvent effectuer cette action.'
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Sélectionner les questions</h3>
        <p className="text-sm text-gray-600">
          {selectedQuestions.length} question(s) sélectionnée(s)
        </p>
      </div>

      {permissionErrorMessage && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{permissionErrorMessage}</p>
        </div>
      )}

      {hasError && !isPermissionError && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            Erreur lors du chargement des questions. Veuillez réessayer.
          </p>
        </div>
      )}

      {!hasError && (
        <>
          <div className="space-y-2">
            <Input
              placeholder="Rechercher des questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddAll}
              disabled={isLoading || filteredQuestions.length === 0}
            >
              Ajouter tout
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemoveAll}
              disabled={selectedQuestions.length === 0}
            >
              Supprimer tout
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-4">Chargement des questions...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              {availableQuestions.length === 0
                ? 'Aucune question disponible'
                : 'Aucun résultat pour votre recherche'}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
              {filteredQuestions.map((question: Question) => (
                <div
                  key={question.id}
                  className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded"
                >
                  <Checkbox
                    checked={selectedQuestions.includes(question.id)}
                    onCheckedChange={() => handleToggleQuestion(question.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">
                      {question.prompt}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {question.type}
                      </Badge>
                      {question.choice_count && (
                        <Badge variant="outline" className="text-xs">
                          {question.choice_count} choix
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {onClose && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      )}
    </div>
  );
};
