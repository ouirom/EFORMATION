import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { QuizQuestionSelector } from '../components/QuizQuestionSelector';
import { Textarea } from '../components/ui/textarea';

export const QuizCreatePage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    instructions: '',
    passingScore: 70,
    randomized: false,
    timeLimitMinutes: 0,
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
        setCreateError('Quiz créé mais ID introuvable dans la réponse.');
        console.error('Unexpected response shape:', response.data);
      }
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        'Erreur lors de la création du quiz';
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
    } as any);
  };

  if (createdQuizId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Quiz créé ✓</h1>
          <p className="text-gray-600">
            Maintenant, sélectionnez les questions pour ce quiz.
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
          ← Retour
        </button>
        <h1 className="text-3xl font-bold">Créer un nouveau quiz</h1>
      </div>

      <form onSubmit={handleCreateQuiz} className="space-y-4">
        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Titre *</label>
            <Input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Titre du quiz"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Description du quiz"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Instructions</label>
            <Textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleChange}
              placeholder="Instructions pour le quiz"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Score minimum de passage (%) *
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
                Limite de temps (minutes, 0 = illimité)
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
              Randomiser les questions
            </label>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={createQuizMutation.isPending}>
            {createQuizMutation.isPending ? 'Création...' : 'Créer le quiz'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Annuler
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
