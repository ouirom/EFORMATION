import React from 'react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import {
  Trophy,
  CheckCircle,
  XCircle,
  Star,
  Sparkles,
  RotateCcw,
  Clock,
  ArrowRight,
  Check
} from 'lucide-react'
import { api } from '@/services/api'

// Composant Confettis pour la célébration
const Confetti = ({ count = 50 }: { count?: number }) => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ff69b4']
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(count)].map((_, i) => {
        const top = 10 + Math.random() * 80
        const left = 10 + Math.random() * 80
        const delay = Math.random() * 2
        const scale = 0.5 + Math.random() * 1
        const color = colors[i % colors.length]
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: `${top}%`,
              left: `${left}%`,
              width: 8 * scale,
              height: 8 * scale,
              background: color,
              borderRadius: '50%',
              opacity: 0.8,
              animation: `confetti-fall 2s linear ${delay}s 1`,
            }}
          />
        )
      })}
    </div>
  )
}

// Composant étoiles qui brillent
// CelebrationStars supprimé car non utilisé

interface Question {
  id: number
  prompt: string // API returns 'prompt' not 'questionText'
  type: 'mcq' | 'true_false' | 'short_text' | 'essay' // API returns lowercase types
  choices: { id: number; label: string; position: number }[] // API returns 'choices' not 'options'
  points: number
}

interface Quiz {
  id: number
  title: string
  description?: string
  passing_score: number // API returns 'passing_score' not 'passingScore'
  time_limit_minutes?: number
  max_attempts?: number
  questions: Question[]
}

interface Answer {
  questionId: number
  answer: string | string[]
}

interface StoredProgress {
  attemptId: number
  answers: Answer[]
  currentQuestion: number
  quizStartAt: number
  deadlineAt: number | null
}

function progressKey(quizId: string | undefined) {
  return `quiz-progress-${quizId}`
}

function loadProgress(quizId: string | undefined): StoredProgress | null {
  if (!quizId) return null
  try {
    const raw = localStorage.getItem(progressKey(quizId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveProgress(quizId: string | undefined, progress: StoredProgress) {
  if (!quizId) return
  localStorage.setItem(progressKey(quizId), JSON.stringify(progress))
}

function clearProgress(quizId: string | undefined) {
  if (!quizId) return
  localStorage.removeItem(progressKey(quizId))
}

export default function QuizPage() {
  const { t } = useTranslation('courses');
  const { t: tCommon } = useTranslation('common');
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  // Gestion de la boîte de confirmation agréable
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingTx, setPendingTx] = useState<any>(null);
  const blocker = React.useCallback((tx: any) => {
    if (quizStarted && !quizSubmitted) {
      setShowLeaveDialog(true);
      setPendingTx(tx);
    } else {
      tx.retry();
    }
  }, [quizStarted, quizSubmitted]);
  const { quizId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [timerActive, setTimerActive] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [quizStartAt, setQuizStartAt] = useState<number | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)

  // Reset state when quizId changes, restoring any in-progress attempt saved locally
  // (survives a page reload or a session-timeout logout/login) instead of just discarding it.
  React.useEffect(() => {
    setQuizSubmitted(false);
    setResult(null);

    const saved = loadProgress(quizId);
    if (saved) {
      setAttemptId(saved.attemptId);
      setAnswers(saved.answers);
      setCurrentQuestion(saved.currentQuestion);
      setQuizStartAt(saved.quizStartAt);
      setDeadlineAt(saved.deadlineAt);
      if (saved.deadlineAt) {
        const remaining = Math.max(0, Math.floor((saved.deadlineAt - Date.now()) / 1000));
        setTimeRemaining(remaining);
        setTimerActive(true);
      } else {
        setTimeRemaining(null);
        setTimerActive(false);
      }
      setQuizStarted(true);
    } else {
      setQuizStarted(false);
      setAnswers([]);
      setCurrentQuestion(0);
      setAttemptId(null);
      setQuizStartAt(null);
      setDeadlineAt(null);
      setTimeRemaining(null);
      setTimerActive(false);
    }
  }, [quizId]);

  // Confirmation avant de quitter la page si le quiz est en cours
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (quizStarted && !quizSubmitted) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [quizStarted, quizSubmitted]);

  // Interception de navigation React Router

  // Utilisation de la navigation block (React Router v6.4+)
  React.useEffect(() => {
    if (quizStarted && !quizSubmitted && (window as any).__REACT_ROUTER__) {
      const unblock = (window as any).__REACT_ROUTER__.navigator.block(blocker);
      return () => unblock();
    }
  }, [quizStarted, quizSubmitted, blocker]);
  // Chargement du quiz depuis l'API réelle selon quizId. Une fois l'attempt démarré
  // (attemptId défini), on refetch avec l'attemptId pour recevoir exactement le jeu de
  // questions tiré et enregistré côté serveur pour cette tentative.
  const { data: quiz, isLoading } = useQuery<Quiz>({
    queryKey: ['quiz-take', quizId, attemptId],
    queryFn: async () => {
      const url = attemptId
        ? `/quizzes/${quizId}/take?attemptId=${attemptId}`
        : `/quizzes/${quizId}/take`;
      const response = await api.get(url);
      return response.data.data;
    },
    enabled: !!quizId
  });

  const beginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/attempts/begin', { quizId: parseInt(quizId || '0') });
      return response.data.data as { attemptId: number; timeLimitMinutes?: number; maxAttempts?: number };
    },
    onSuccess: (data) => {
      const startAt = Date.now();
      const deadline = data.timeLimitMinutes ? startAt + data.timeLimitMinutes * 60 * 1000 : null;

      setAttemptId(data.attemptId);
      setQuizStarted(true);
      setQuizSubmitted(false);
      setResult(null);
      setAnswers([]);
      setCurrentQuestion(0);
      setQuizStartAt(startAt);
      setDeadlineAt(deadline);
      setTimeRemaining(deadline ? data.timeLimitMinutes! * 60 : null);
      setTimerActive(!!deadline);

      saveProgress(quizId, {
        attemptId: data.attemptId,
        answers: [],
        currentQuestion: 0,
        quizStartAt: startAt,
        deadlineAt: deadline,
      });
    },
    onError: (error: any) => {
      toast({
        title: tCommon('status.error'),
        description: error.response?.data?.error?.message || t('quizPage.startFailedDescription'),
        variant: 'destructive',
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (submissionData: { answers: Answer[], timeSpent: number }) => {
      const response = await api.post(`/attempts`, {
        quizId: parseInt(quizId || '0'),
        attemptId,
        answers: submissionData.answers,
        timeSpent: submissionData.timeSpent,
      });
      return response.data.data;
    },
    onError: (error: any) => {
      const code = error.response?.data?.error?.code;
      toast({
        title: tCommon('status.error'),
        description:
          code === 'MAX_ATTEMPTS_REACHED' || code === 'TIME_LIMIT_EXCEEDED'
            ? error.response.data.error.message
            : t('quizPage.submitFailedDescription'),
        variant: 'destructive',
      });
      if (code === 'TIME_LIMIT_EXCEEDED' || code === 'MAX_ATTEMPTS_REACHED') {
        // The attempt this was tied to is no longer valid server-side — reset to the
        // intro screen (in place) rather than relying on browser history via navigate(-1),
        // which may not land back on this quiz at all.
        clearProgress(quizId);
        setQuizStarted(false);
        setAnswers([]);
        setCurrentQuestion(0);
        setAttemptId(null);
        setQuizStartAt(null);
        setDeadlineAt(null);
        setTimeRemaining(null);
        setTimerActive(false);
      }
    },
    onSuccess: async (data) => {
      clearProgress(quizId);
      // Award badges based on quiz performance
      try {
        const badgeResponse = await api.post('/badges/award-quiz', {
          quizId: parseInt(quizId || '0'),
          attemptId: data.id,
        })
        
        // Merge badge data into result
        const awardedBadges = badgeResponse.data.data?.awardedBadges || []
        setResult({ ...data, awardedBadges })
      } catch {
        setResult(data)
      }
      
      setQuizSubmitted(true)
      // Invalidate all relevant caches to update dashboard
      queryClient.invalidateQueries({ queryKey: ['quiz-attempts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['my-courses'] })
      queryClient.invalidateQueries({ queryKey: ['my-badges'] })
      
      toast({
        title: data.passed ? t('quizPage.congratsToastTitle') : t('quizPage.completedToastTitle'),
        description: data.passed
          ? t('quizPage.passedToastDescription', { score: data.score })
          : t('quizPage.failedToastDescription', { score: data.score, passingScore: quiz?.passing_score }),
      })
    },
  })

  const handleStartQuiz = () => {
    beginMutation.mutate()
  }

  const handleAnswer = (questionId: number, answer: string | string[]) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === questionId)
      return existing >= 0
        ? prev.map((a, i) => (i === existing ? { questionId, answer } : a))
        : [...prev, { questionId, answer }]
    })
  }

  // Persist progress (answers, position, deadline) on every change — so a reload,
  // a session timeout, or the browser closing doesn't lose an in-progress attempt.
  React.useEffect(() => {
    if (!attemptId || !quizStartAt || quizSubmitted) return
    saveProgress(quizId, { attemptId, answers, currentQuestion, quizStartAt, deadlineAt })
  }, [quizId, attemptId, quizStartAt, deadlineAt, answers, currentQuestion, quizSubmitted])

  const handleSubmit = () => {
    const timeSpent = quizStartAt ? Math.round((Date.now() - quizStartAt) / 1000) : 0
    submitMutation.mutate({ answers, timeSpent })
  }

  const handleRetry = () => {
    clearProgress(quizId)
    setQuizStarted(false)
    setQuizSubmitted(false)
    setResult(null)
    setAnswers([])
    setCurrentQuestion(0)
    setTimeRemaining(null)
    setTimerActive(false)
    setAttemptId(null)
    setQuizStartAt(null)
    setDeadlineAt(null)
  }
  // Timer effect : auto-soumission si durée existe
  React.useEffect(() => {
    if (!timerActive || timeRemaining === null || quizSubmitted) return;
    if (timeRemaining <= 0) {
      setTimerActive(false);
      handleSubmit();
      return;
    }
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSubmit is recreated each render; including it would reset the interval every tick
  }, [timerActive, timeRemaining, quizSubmitted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading || !quiz || !quiz.questions) {
    return <PageLoading />
  }

  const currentQ = quiz.questions[currentQuestion]
  const currentAnswer = answers.find((a) => a.questionId === currentQ?.id)?.answer
  const progress = ((currentQuestion + 1) / quiz.questions.length) * 100

  // Quiz not started - show intro
  if (!quizStarted) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('quizPage.back')}
        </Button>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{quiz.title}</CardTitle>
            <CardDescription>{quiz.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{quiz.questions.length}</p>
                <p className="text-sm text-muted-foreground">{t('quizPage.stats.questions')}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : '-'}
                </p>
                <p className="text-sm text-muted-foreground">{t('quizPage.stats.duration')}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{quiz.passing_score}%</p>
                <p className="text-sm text-muted-foreground">{t('quizPage.stats.minScore')}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">
                  {quiz.questions.reduce((sum, q) => sum + q.points, 0)}
                </p>
                <p className="text-sm text-muted-foreground">{t('quizPage.stats.totalPoints')}</p>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {t('quizPage.instructions.title')}
                </p>
                <ul className="mt-2 space-y-1 text-yellow-700 dark:text-yellow-300">
                  <li>• {t('quizPage.instructions.oneSession')}</li>
                  <li>• {t('quizPage.instructions.timerStarts')}</li>
                  <li>• {t('quizPage.instructions.canNavigate')}</li>
                  <li>• {t('quizPage.instructions.autoSaved')}</li>
                  {quiz.time_limit_minutes && (
                    <li>• {t('quizPage.instructions.timeLimit', { minutes: quiz.time_limit_minutes })}</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" onClick={handleStartQuiz}>
              {t('quizPage.startQuiz')}
            </Button>
          </CardFooter>
        </Card>

        {/* Boîte de dialogue de confirmation agréable */}
        <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('quizPage.leaveDialog.title')}</DialogTitle>
              <DialogDescription>
                {t('quizPage.leaveDialog.description')} <br />
                <span className="font-semibold">{t('quizPage.leaveDialog.warning')}</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowLeaveDialog(false);
                setPendingTx(null);
              }}>
                {t('quizPage.leaveDialog.stay')}
              </Button>
              <Button variant="destructive" onClick={() => {
                setShowLeaveDialog(false);
                if (pendingTx) {
                  pendingTx.retry();
                  setPendingTx(null);
                }
              }}>
                {t('quizPage.leaveDialog.leave')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Quiz submitted - show results
  if (quizSubmitted && result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 relative">
        {/* Confettis pour la réussite */}
        {result.passed && <Confetti count={80} />}
        
        <Card className={`relative overflow-hidden ${result.passed ? 'border-green-300 dark:border-green-700' : ''}`}>
          {/* Étoiles de célébration */}
          
          <CardHeader className="text-center relative z-10">
            <div className={`h-24 w-24 mx-auto rounded-full flex items-center justify-center mb-4 animate-bounce-in ${
              result.passed 
                ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-white animate-glow shadow-lg' 
                : 'bg-red-100 text-red-600'
            }`}>
              {result.passed ? (
                <Trophy className="h-12 w-12 animate-float" />
              ) : (
                <XCircle className="h-12 w-12" />
              )}
            </div>
            <CardTitle className={`text-3xl font-bold animate-bounce-in ${result.passed ? 'text-green-600 dark:text-green-400' : ''}`} style={{ animationDelay: '0.2s' }}>
              {result.passed ? t('quizPage.results.passedTitle') : t('quizPage.results.failedTitle')}
            </CardTitle>
            <CardDescription className="text-lg animate-bounce-in" style={{ animationDelay: '0.3s' }}>
              {result.passed
                ? t('quizPage.results.passedSubtitle')
                : t('quizPage.results.failedSubtitle', { score: quiz.passing_score })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 relative z-10">
            <div className="text-center">
              <div className={`inline-block p-6 rounded-2xl ${result.passed ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                <p className={`text-6xl font-bold mb-2 animate-score-count ${result.passed ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {result.score}%
                </p>
                <p className="text-muted-foreground flex items-center justify-center gap-2">
                  <CheckCircle className={`h-5 w-5 ${result.passed ? 'text-green-500' : 'text-gray-400'}`} />
                  {t('quizPage.results.correctAnswers', { correct: result.correctAnswers, total: result.totalQuestions })}
                </p>
              </div>
              
              {result.passed && (
                <div className="mt-4 flex justify-center gap-2 animate-bounce-in" style={{ animationDelay: '0.5s' }}>
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`h-8 w-8 ${i < Math.ceil(result.score / 20) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                      style={{ animationDelay: `${0.6 + i * 0.1}s` }}
                    />
                  ))}
                </div>
              )}
              
              {result.passed && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800 animate-bounce-in" style={{ animationDelay: '0.8s' }}>
                  <p className="text-green-700 dark:text-green-300 flex items-center justify-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    {t('quizPage.results.goalReached')}
                    <Sparkles className="h-5 w-5" />
                  </p>
                </div>
              )}
              
              {/* Badges et Trophées obtenus */}
              {result.awardedBadges && result.awardedBadges.length > 0 && (
                <div className="mt-6 animate-bounce-in" style={{ animationDelay: '1s' }}>
                  <h4 className="font-medium text-center mb-4 flex items-center justify-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    {t('quizPage.results.rewardsTitle')}
                  </h4>
                  <div className="flex flex-wrap justify-center gap-4">
                    {result.awardedBadges.map((badge: any, index: number) => (
                      <div
                        key={badge.code}
                        className={`p-4 rounded-xl text-center animate-bounce-in ${
                          badge.type === 'trophy'
                            ? 'bg-gradient-to-br from-yellow-100 to-amber-200 dark:from-yellow-900/40 dark:to-amber-900/40 border-2 border-yellow-400 animate-glow'
                            : 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 border border-blue-300'
                        }`}
                        style={{ animationDelay: `${1.2 + index * 0.2}s` }}
                      >
                        <div className={`text-4xl mb-2 ${badge.type === 'trophy' ? 'animate-float' : ''}`}>
                          {badge.type === 'trophy' ? '🏆' : badge.code === 'PERFECT_SCORE' ? '⭐' : '🎖️'}
                        </div>
                        <p className={`font-bold ${badge.type === 'trophy' ? 'text-yellow-700 dark:text-yellow-300' : 'text-blue-700 dark:text-blue-300'}`}>
                          {badge.name}
                        </p>
                        {badge.type === 'trophy' && (
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            {t('quizPage.results.excellence')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                {t('quizPage.results.answerDetailsTitle')}
              </h4>
              {quiz.questions.map((q, i) => {
                const feedback = result.feedback?.find((f: any) => f.questionId === q.id)
                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-lg border transition-all duration-300 hover:shadow-md ${
                      feedback?.correct
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    }`}
                    style={{ animationDelay: `${1 + i * 0.1}s` }}
                  >
                    <div className="flex items-start gap-3">
                      {feedback?.correct ? (
                        <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-medium">{t('quizPage.results.questionLabel', { number: i + 1 })}</p>
                        <p className="text-sm text-muted-foreground">{q.prompt}</p>
                        {!feedback?.correct && feedback?.correctAnswer && (
                          <p className="text-sm mt-2">
                            <span className="text-muted-foreground">{t('quizPage.results.correctAnswerLabel')}</span>
                            <span className="font-medium">{feedback.correctAnswer}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
          <CardFooter className="flex gap-4 relative z-10">
            <Button variant="outline" onClick={() => navigate(-1)} className="flex-1">
              {t('quizPage.results.backToCourse')}
            </Button>
            {!result.passed && (
              <Button onClick={handleRetry} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                {t('quizPage.results.retry')}
              </Button>
            )}
            {result.passed && (
              <Button onClick={() => navigate('/dashboard')} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                <Trophy className="h-4 w-4 mr-2" />
                {t('quizPage.results.continue')}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Quiz in progress
    // Affichage du timer pendant le quiz
    if (quizStarted && !quizSubmitted && quiz.time_limit_minutes) {
      return (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex justify-between items-center mb-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('quizPage.back')}
            </Button>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">
                {formatTime(timeRemaining ?? 0)}
              </span>
            </div>
          </div>
          {/* Quiz content rendering */}
          <Card>
            <CardHeader>
              <CardTitle>{t('quizPage.questionCounter', { current: currentQuestion + 1, total: quiz.questions.length })}</CardTitle>
              <Progress value={((currentQuestion + 1) / quiz.questions.length) * 100} />
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <p className="font-medium text-lg">{quiz.questions[currentQuestion].prompt}</p>
              </div>
              {/* Choices rendering for MCQ/TrueFalse */}
              {quiz.questions[currentQuestion].choices && quiz.questions[currentQuestion].choices.length > 0 && (
                <div className="space-y-2">
                  {quiz.questions[currentQuestion].choices.map((choice: any) => (
                    <Button
                      key={choice.id}
                      variant={answers.find(a => a.questionId === quiz.questions[currentQuestion].id && String(a.answer) === String(choice.id)) ? "default" : "outline"}
                      className="w-full text-left"
                      onClick={() => handleAnswer(quiz.questions[currentQuestion].id, String(choice.id))}
                    >
                      {choice.label}
                    </Button>
                  ))}
                </div>
              )}
              {/* Input for short_text/essay */}
              {(quiz.questions[currentQuestion].type === 'short_text' || quiz.questions[currentQuestion].type === 'essay') && (
                <textarea
                  className="w-full border rounded p-2 mt-2"
                  rows={quiz.questions[currentQuestion].type === 'essay' ? 6 : 2}
                  value={answers.find(a => a.questionId === quiz.questions[currentQuestion].id)?.answer || ''}
                  onChange={e => handleAnswer(quiz.questions[currentQuestion].id, e.target.value)}
                  placeholder={quiz.questions[currentQuestion].type === 'essay' ? t('quizPage.essayPlaceholder') : t('quizPage.shortAnswerPlaceholder')}
                />
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                disabled={currentQuestion === 0}
                onClick={() => setCurrentQuestion(q => Math.max(0, q - 1))}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> {t('quizPage.previous')}
              </Button>
              {currentQuestion < quiz.questions.length - 1 ? (
                <Button
                  onClick={() => setCurrentQuestion(q => Math.min(quiz.questions.length - 1, q + 1))}
                >
                  {t('quizPage.next')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit}>
                  {t('quizPage.submit')}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      );
    }
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header with timer */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{quiz.title}</h1>
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            timeRemaining < 60 ? 'bg-red-100 text-red-600' : 'bg-muted'
          }`}>
            <Clock className="h-4 w-4" />
            <span className="font-mono font-medium">{formatTime(timeRemaining)}</span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{t('quizPage.questionCounterOf', { current: currentQuestion + 1, total: quiz.questions.length })}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} />
      </div>

      {/* Question */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline">{t('quizPage.pointsLabel', { count: currentQ.points })}</Badge>
            <Badge>
              {currentQ.type === 'mcq' ? t('quizPage.questionTypes.mcq') :
               currentQ.type === 'true_false' ? t('quizPage.questionTypes.trueFalse') :
               currentQ.type === 'short_text' ? t('quizPage.questionTypes.shortText') :
               t('quizPage.questionTypes.essay')}
            </Badge>
          </div>
          <CardTitle className="text-lg mt-4">{currentQ.prompt}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currentQ.choices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => handleAnswer(currentQ.id, String(choice.id))}
                className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                  currentAnswer === String(choice.id)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                    currentAnswer === String(choice.id)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground'
                  }`}>
                    {currentAnswer === String(choice.id) && <Check className="h-4 w-4" />}
                  </div>
                  <span>{choice.label}</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQuestion((prev) => prev - 1)}
            disabled={currentQuestion === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('quizPage.previous')}
          </Button>
          {currentQuestion === quiz.questions.length - 1 ? (
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || answers.length < quiz.questions.length}
            >
              {submitMutation.isPending ? t('quizPage.submitting') : t('quizPage.finishQuiz')}
            </Button>
          ) : (
            <Button onClick={() => setCurrentQuestion((prev) => prev + 1)}>
              {t('quizPage.next')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Question navigation */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">{t('quizPage.quickNav')}</p>
          <div className="flex flex-wrap gap-2">
            {quiz.questions.map((q, i) => {
              const hasAnswer = answers.some((a) => a.questionId === q.id)
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={`h-10 w-10 rounded-lg font-medium transition-all ${
                    i === currentQuestion
                      ? 'bg-primary text-primary-foreground'
                      : hasAnswer
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
