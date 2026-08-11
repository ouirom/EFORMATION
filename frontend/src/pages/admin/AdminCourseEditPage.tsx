import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLoading } from '@/components/ui/loading'
import { useToast } from '@/components/ui/use-toast'
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  BookOpen,
  Video,
  FileText,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { api } from '@/services/api'
import { fileService } from '@/services/file.service'

interface Module {
  id: number
  title: string
  position: number
  lessons: Lesson[]
}

interface Lesson {
  id: number
  title: string
  type: string
  duration_min: number
  position: number
  quizzes?: Quiz[]
}

interface Quiz {
  id: number
  title: string
  description?: string
  instructions?: string
  passing_score: number
  question_count: number
  time_limit_minutes?: number
  max_attempts?: number
  questions_to_draw?: number | null
  expires_at?: string
  badge_id?: number
  certificate_enabled?: boolean
  show_correct_answers?: boolean
  shuffle_choices?: boolean
  randomized?: boolean
  questions?: Question[]
}

interface Question {
  id: number
  type: 'mcq' | 'true_false' | 'short_text' | 'essay'
  prompt: string
  position: number
  choices?: Choice[]
}

interface Choice {
  id?: number
  label: string
  isCorrect: boolean
}

export default function AdminCourseEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const courseId = id ? parseInt(id, 10) : null

  const [expandedModules, setExpandedModules] = useState<number[]>([])
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false)
  const [isQuizDialogOpen, setIsQuizDialogOpen] = useState(false)
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false)
  const [isQuizQuestionsOpen, setIsQuizQuestionsOpen] = useState(false)
  const [editingModule, setEditingModule] = useState<Module | null>(null)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null)

  const [moduleForm, setModuleForm] = useState({ title: '' })
  const [lessonForm, setLessonForm] = useState({ title: '', type: 'video', duration_min: 10, videoUrl: '', documentUrl: '', linkUrl: '' })
  const [lessonDocumentFile, setLessonDocumentFile] = useState<File | null>(null)
  const [lessonDocumentUploading, setLessonDocumentUploading] = useState(false)
  const [lessonDocumentProgress, setLessonDocumentProgress] = useState(0)
  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    instructions: '',
    passing_score: 70,
    randomized: false,
    questions_to_draw: null as number | null,
    time_limit_minutes: null as number | null,
    max_attempts: 3,
    expires_at: '',
    badge_id: null as number | null,
    certificate_enabled: false,
    show_correct_answers: true,
    shuffle_choices: false,
  })
  const [questionForm, setQuestionForm] = useState<{
    type: 'mcq' | 'true_false' | 'short_text' | 'essay'
    prompt: string
    choices: Choice[]
  }>({
    type: 'mcq',
    prompt: '',
    choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
  })
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([])

  // Fetch course with full structure
  const { data: course, isLoading } = useQuery({
    queryKey: ['course-edit', courseId],
    queryFn: async () => {
      const response = await api.get(`/courses/${courseId}/full`)
      return response.data.data
    },
    enabled: !!courseId,
  })

  // Query pour récupérer les badges
  const { data: badgesList } = useQuery({
    queryKey: ['all-badges'],
    queryFn: async () => {
      const response = await api.get('/badges')
      return response.data.data
    },
  })

  // Module mutations
  const createModuleMutation = useMutation({
    mutationFn: async (data: { title: string }) => {
      const response = await api.post(`/modules`, { courseId, title: data.title })
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Module créé avec succès' })
      setIsModuleDialogOpen(false)
      setModuleForm({ title: '' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateModuleMutation = useMutation({
    mutationFn: async ({ moduleId, data }: { moduleId: number; data: { title: string } }) => {
      const response = await api.put(`/modules/${moduleId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Module mis à jour' })
      setIsModuleDialogOpen(false)
      setEditingModule(null)
      setModuleForm({ title: '' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: number) => {
      await api.delete(`/modules/${moduleId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Module supprimé' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  // Helper function to map lesson type to content type
  const mapLessonTypeToContentType = (lessonType: string): string => {
    switch (lessonType) {
      case 'video': return 'youtube_link'
      case 'document': return 'pdf'
      case 'link': return 'text'
      default: return 'text'
    }
  }

  // Lesson mutations
  const createLessonMutation = useMutation({
    mutationFn: async (data: { 
      moduleId: number; 
      title: string; 
      type: string; 
      duration_min: number;
      videoUrl?: string;
      documentUrl?: string;
      documentFileId?: number;
      linkUrl?: string;
    }) => {
      console.log('createLessonMutation - sending to API:', data)
      
      // 1. Create the lesson first
      const response = await api.post(`/lessons`, {
        moduleId: data.moduleId,
        title: data.title,
        type: data.type,
        durationMin: data.duration_min,
      })
      const lesson = response.data.data
      console.log('createLessonMutation - lesson created:', lesson)
      
      // 2. Create associated content if URL or FileID is provided
      if (data.documentFileId) {
        // Pour les fichiers uploadés, utiliser fileId
        console.log('Creating content with fileId:', data.documentFileId)
        
        await api.post('/contents', {
          lessonId: lesson.id,
          type: 'pdf',
          title: data.title,
          fileId: data.documentFileId,
        })
        console.log('Content created successfully')
      } else {
        const url = data.videoUrl || data.documentUrl || data.linkUrl
        if (url && url.trim()) {
          const contentType = mapLessonTypeToContentType(data.type)
          console.log('Creating content with type:', contentType, 'url:', url)
          
          await api.post('/contents', {
            lessonId: lesson.id,
            type: contentType,
            title: data.title,
            url: url.trim(),
          })
          console.log('Content created successfully')
        }
      }
      
      return lesson
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Leçon créée avec succès' })
      setIsLessonDialogOpen(false)
      setLessonForm({ title: '', type: 'video', duration_min: 10, videoUrl: '', documentUrl: '', linkUrl: '' })
      setLessonDocumentFile(null)
      setLessonDocumentProgress(0)
      setSelectedModuleId(null)
    },
    onError: (error: any) => {
      console.error('createLessonMutation - error:', error.response?.data || error)
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateLessonMutation = useMutation({
    mutationFn: async ({ lessonId, data }: { lessonId: number; data: any }) => {
      const response = await api.put(`/lessons/${lessonId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Leçon mise à jour' })
      setIsLessonDialogOpen(false)
      setEditingLesson(null)
      setLessonForm({ title: '', type: 'video', duration_min: 10, videoUrl: '', documentUrl: '', linkUrl: '' })
      setLessonDocumentFile(null)
      setLessonDocumentProgress(0)
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: number) => {
      await api.delete(`/lessons/${lessonId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Leçon supprimée' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  // Quiz mutations
  const createQuizMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/quizzes', {
        lessonId: data.lessonId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        passingScore: data.passingScore,
        randomized: data.randomized,
        timeLimitMinutes: data.timeLimitMinutes,
        maxAttempts: data.maxAttempts,
        expiresAt: data.expiresAt,
        badgeId: data.badgeId,
        certificateEnabled: data.certificateEnabled,
        showCorrectAnswers: data.showCorrectAnswers,
        shuffleChoices: data.shuffleChoices,
      })
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Quiz créé avec succès' })
      setIsQuizDialogOpen(false)
      resetQuizForm()
      setSelectedLessonId(null)
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateQuizMutation = useMutation({
    mutationFn: async ({ quizId, data }: { quizId: number; data: any }) => {
      const response = await api.put(`/quizzes/${quizId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Quiz mis à jour' })
      setIsQuizDialogOpen(false)
      setEditingQuiz(null)
      resetQuizForm()
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: number) => {
      await api.delete(`/quizzes/${quizId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Quiz supprimé' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  // Question mutations
  const fetchQuizQuestions = async (quizId: number) => {
    const response = await api.get(`/quizzes/${quizId}`)
    return response.data.data.questions || []
  }

  const createQuestionMutation = useMutation({
    mutationFn: async (data: { quizId: number; type: string; prompt: string; choices: Choice[] }) => {
      const response = await api.post(`/quizzes/${data.quizId}/questions`, {
        type: data.type,
        prompt: data.prompt,
        choices: data.choices.filter(c => c.label.trim() !== ''),
      })
      return response.data.data
    },
    onSuccess: async () => {
      if (selectedQuiz) {
        const questions = await fetchQuizQuestions(selectedQuiz.id)
        setQuizQuestions(questions)
      }
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Question ajoutée' })
      setIsQuestionDialogOpen(false)
      setQuestionForm({
        type: 'mcq',
        prompt: '',
        choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
      })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la création', variant: 'destructive' })
    },
  })

  const updateQuestionMutation = useMutation({
    mutationFn: async (data: { quizId: number; questionId: number; prompt: string; choices: Choice[] }) => {
      const response = await api.put(`/quizzes/${data.quizId}/questions/${data.questionId}`, {
        prompt: data.prompt,
        choices: data.choices.filter(c => c.label.trim() !== ''),
      })
      return response.data.data
    },
    onSuccess: async () => {
      if (selectedQuiz) {
        const questions = await fetchQuizQuestions(selectedQuiz.id)
        setQuizQuestions(questions)
      }
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Question mise à jour' })
      setIsQuestionDialogOpen(false)
      setEditingQuestion(null)
      setQuestionForm({
        type: 'mcq',
        prompt: '',
        choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
      })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la mise à jour', variant: 'destructive' })
    },
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) => {
      if (!selectedQuiz) throw new Error('No quiz selected')
      await api.delete(`/quizzes/${selectedQuiz.id}/questions/${questionId}`)
    },
    onSuccess: async () => {
      if (selectedQuiz) {
        const questions = await fetchQuizQuestions(selectedQuiz.id)
        setQuizQuestions(questions)
      }
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: 'Succès', description: 'Question supprimée' })
    },
    onError: (error: any) => {
      toast({ title: 'Erreur', description: error.response?.data?.error?.message || 'Erreur lors de la suppression', variant: 'destructive' })
    },
  })

  const toggleModule = (moduleId: number) => {
    setExpandedModules(prev =>
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    )
  }

  const openAddModule = () => {
    setEditingModule(null)
    setModuleForm({ title: '' })
    setIsModuleDialogOpen(true)
  }

  const openEditModule = (module: Module) => {
    setEditingModule(module)
    setModuleForm({ title: module.title })
    setIsModuleDialogOpen(true)
  }

  const openAddLesson = (moduleId: number) => {
    console.log('openAddLesson called with moduleId:', moduleId)
    setSelectedModuleId(moduleId)
    setEditingLesson(null)
    setLessonForm({ title: '', type: 'video', duration_min: 10, videoUrl: '', documentUrl: '', linkUrl: '' })
    setLessonDocumentFile(null)
    setLessonDocumentProgress(0)
    setIsLessonDialogOpen(true)
  }

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setLessonForm({ 
      title: lesson.title, 
      type: lesson.type || 'video', 
      duration_min: lesson.duration_min,
      videoUrl: (lesson as any).videoUrl || '',
      documentUrl: (lesson as any).documentUrl || '',
      linkUrl: (lesson as any).linkUrl || ''
    })
    setLessonDocumentFile(null)
    setLessonDocumentProgress(0)
    setIsLessonDialogOpen(true)
  }

  const resetQuizForm = () => {
    setQuizForm({
      title: '',
      description: '',
      instructions: '',
      passing_score: 70,
      randomized: false,
      questions_to_draw: null,
      time_limit_minutes: null,
      max_attempts: 3,
      expires_at: '',
      badge_id: null,
      certificate_enabled: false,
      show_correct_answers: true,
      shuffle_choices: false,
    })
  }

  const openAddQuiz = (lessonId: number) => {
    setSelectedLessonId(lessonId)
    setEditingQuiz(null)
    resetQuizForm()
    setIsQuizDialogOpen(true)
  }

  const openEditQuiz = (quiz: Quiz) => {
    setEditingQuiz(quiz)
    setSelectedLessonId(null)
    setQuizForm({
      title: quiz.title,
      description: quiz.description || '',
      instructions: quiz.instructions || '',
      passing_score: quiz.passing_score,
      randomized: quiz.randomized || false,
      questions_to_draw: quiz.questions_to_draw ?? null,
      time_limit_minutes: quiz.time_limit_minutes || null,
      max_attempts: quiz.max_attempts || 3,
      expires_at: quiz.expires_at ? quiz.expires_at.split('T')[0] : '',
      badge_id: quiz.badge_id || null,
      certificate_enabled: quiz.certificate_enabled || false,
      show_correct_answers: quiz.show_correct_answers !== false,
      shuffle_choices: quiz.shuffle_choices || false,
    })
    setIsQuizDialogOpen(true)
  }

  const openQuizQuestions = async (quiz: Quiz) => {
    setSelectedQuiz(quiz)
    const questions = await fetchQuizQuestions(quiz.id)
    setQuizQuestions(questions)
    setIsQuizQuestionsOpen(true)
  }

  const openAddQuestion = () => {
    setEditingQuestion(null)
    setQuestionForm({
      type: 'mcq',
      prompt: '',
      choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
    })
    setIsQuestionDialogOpen(true)
  }

  const openEditQuestion = (question: Question) => {
    setEditingQuestion(question)
    setQuestionForm({
      type: question.type,
      prompt: question.prompt,
      choices: question.choices && question.choices.length > 0
        ? question.choices.map(c => ({ id: c.id, label: c.label, isCorrect: c.isCorrect }))
        : [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
    })
    setIsQuestionDialogOpen(true)
  }

  const addChoice = () => {
    setQuestionForm({
      ...questionForm,
      choices: [...questionForm.choices, { label: '', isCorrect: false }],
    })
  }

  const removeChoice = (index: number) => {
    if (questionForm.choices.length > 2) {
      setQuestionForm({
        ...questionForm,
        choices: questionForm.choices.filter((_, i) => i !== index),
      })
    }
  }

  const updateChoice = (index: number, field: 'label' | 'isCorrect', value: string | boolean) => {
    const newChoices = [...questionForm.choices]
    if (field === 'isCorrect' && value === true) {
      // Pour MCQ, une seule bonne réponse
      newChoices.forEach((c, i) => {
        c.isCorrect = i === index
      })
    } else {
      (newChoices[index] as any)[field] = value
    }
    setQuestionForm({ ...questionForm, choices: newChoices })
  }

  const handleQuestionSubmit = () => {
    if (selectedQuiz) {
      const choices = questionForm.type === 'mcq' || questionForm.type === 'true_false' ? questionForm.choices : []
      if (editingQuestion) {
        updateQuestionMutation.mutate({
          quizId: selectedQuiz.id,
          questionId: editingQuestion.id,
          prompt: questionForm.prompt,
          choices,
        })
      } else {
        createQuestionMutation.mutate({
          quizId: selectedQuiz.id,
          type: questionForm.type,
          prompt: questionForm.prompt,
          choices,
        })
      }
    }
  }

  const handleModuleSubmit = () => {
    if (editingModule) {
      updateModuleMutation.mutate({ moduleId: editingModule.id, data: moduleForm })
    } else {
      createModuleMutation.mutate(moduleForm)
    }
  }

  const handleLessonSubmit = async () => {
    console.log('handleLessonSubmit called', { editingLesson, selectedModuleId, lessonForm })
    
    // Si c'est un document et qu'un fichier est sélectionné, l'uploader d'abord
    if (!editingLesson && lessonForm.type === 'document' && lessonDocumentFile) {
      setLessonDocumentUploading(true)
      setLessonDocumentProgress(0)
      
      try {
        const uploadedFile = await fileService.uploadFile(
          lessonDocumentFile,
          (progress) => setLessonDocumentProgress(progress),
          'lessons'
        )
        
        // Créer la leçon avec l'ID du fichier uploadé
        if (selectedModuleId) {
          console.log('Creating lesson with uploaded document:', {
            moduleId: selectedModuleId,
            title: lessonForm.title,
            type: lessonForm.type,
            duration_min: lessonForm.duration_min,
            documentFileId: uploadedFile.id,
          })
          createLessonMutation.mutate({
            moduleId: selectedModuleId,
            title: lessonForm.title,
            type: lessonForm.type,
            duration_min: lessonForm.duration_min,
            documentFileId: uploadedFile.id,
          })
        }
      } catch (error) {
        console.error('Erreur lors de l\'upload du document:', error)
        toast({
          title: 'Erreur',
          description: 'Impossible de télécharger le document. Veuillez réessayer.',
          variant: 'destructive',
        })
      } finally {
        setLessonDocumentUploading(false)
      }
      return
    }
    
    if (editingLesson) {
      updateLessonMutation.mutate({
        lessonId: editingLesson.id,
        data: {
          title: lessonForm.title,
          type: lessonForm.type,
          durationMin: lessonForm.duration_min,
        },
      })
    } else if (selectedModuleId) {
      console.log('Creating lesson with data:', {
        moduleId: selectedModuleId,
        ...lessonForm,
      })
      createLessonMutation.mutate({
        moduleId: selectedModuleId,
        ...lessonForm,
      })
    } else {
      console.error('No selectedModuleId!')
    }
  }

  const handleQuizSubmit = () => {
    const quizData: any = {
      title: quizForm.title,
      description: quizForm.description || null,
      instructions: quizForm.instructions || null,
      passingScore: quizForm.passing_score,
      randomized: quizForm.randomized,
      certificateEnabled: quizForm.certificate_enabled,
      showCorrectAnswers: quizForm.show_correct_answers,
      shuffleChoices: quizForm.shuffle_choices,
      maxAttempts: quizForm.max_attempts || 3,
      questionsToDraw: quizForm.questions_to_draw || null,
    };
    if (quizForm.time_limit_minutes !== null && quizForm.time_limit_minutes !== undefined) {
      quizData.timeLimitMinutes = quizForm.time_limit_minutes;
    }
    if (quizForm.expires_at) {
      quizData.expiresAt = quizForm.expires_at;
    }
    if (quizForm.badge_id !== null && quizForm.badge_id !== undefined) {
      quizData.badgeId = quizForm.badge_id;
    }

    if (editingQuiz) {
      updateQuizMutation.mutate({
        quizId: editingQuiz.id,
        data: quizData,
      })
    } else if (selectedLessonId) {
      createQuizMutation.mutate({
        lessonId: selectedLessonId,
        ...quizData,
      })
    }
  }

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />
      case 'article':
        return <FileText className="h-4 w-4" />
      case 'quiz':
        return <HelpCircle className="h-4 w-4" />
      default:
        return <BookOpen className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return <PageLoading />
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Cours non trouvé</h2>
        <Button onClick={() => navigate('/admin/courses')}>Retour aux cours</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/courses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <p className="text-muted-foreground">Gérer le contenu du cours</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Contenu</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4">
          {/* Add Module Button */}
          <div className="flex justify-end">
            <Button onClick={openAddModule}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un module
            </Button>
          </div>

          {/* Modules List */}
          {course.modules && course.modules.length > 0 ? (
            <div className="space-y-4">
              {course.modules.map((module: Module, index: number) => (
                <Card key={module.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 cursor-pointer flex-1"
                        onClick={() => toggleModule(module.id)}
                      >
                        {expandedModules.includes(module.id) ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <CardTitle className="text-lg">{module.title}</CardTitle>
                        <span className="text-sm text-muted-foreground">
                          ({module.lessons?.length || 0} leçons)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModule(module)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Supprimer ce module ?')) {
                              deleteModuleMutation.mutate(module.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {expandedModules.includes(module.id) && (
                    <CardContent>
                      <div className="space-y-2 ml-10">
                        {module.lessons && module.lessons.length > 0 ? (
                          module.lessons.map((lesson: Lesson) => (
                            <div key={lesson.id} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {getLessonIcon(lesson.type)}
                                  <div>
                                    <p className="font-medium">{lesson.title}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {lesson.type} · {lesson.duration_min} min
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAddQuiz(lesson.id)}
                                  >
                                    <HelpCircle className="h-4 w-4 mr-1" />
                                    Quiz
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openEditLesson(lesson)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm('Supprimer cette leçon ?')) {
                                        deleteLessonMutation.mutate(lesson.id)
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>

                              {/* Quizzes for this lesson */}
                              {lesson.quizzes && lesson.quizzes.length > 0 && (
                                <div className="mt-2 ml-7 space-y-1">
                                  {lesson.quizzes.map((quiz: Quiz) => (
                                    <div
                                      key={quiz.id}
                                      className="flex items-center justify-between bg-muted/50 rounded p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <HelpCircle className="h-4 w-4 text-primary" />
                                        <span className="text-sm">{quiz.title}</span>
                                        <span className="text-xs text-muted-foreground">
                                          (Score requis: {quiz.passing_score}% · {quiz.question_count || 0} questions)
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openQuizQuestions(quiz)}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Questions
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => openEditQuiz(quiz)}
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (confirm('Supprimer ce quiz ?')) {
                                              deleteQuizMutation.mutate(quiz.id)
                                            }
                                          }}
                                        >
                                          <Trash2 className="h-3 w-3 text-red-500" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Aucune leçon dans ce module
                          </p>
                        )}

                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => openAddLesson(module.id)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Ajouter une leçon
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucun module</h3>
                <p className="text-muted-foreground mb-4">
                  Commencez par ajouter un module pour structurer votre cours
                </p>
                <Button onClick={openAddModule}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un module
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres du cours</CardTitle>
              <CardDescription>Configuration générale du cours</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Utilisez la page de gestion des cours pour modifier les paramètres généraux.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Module Dialog */}
      <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModule ? 'Modifier le module' : 'Ajouter un module'}</DialogTitle>
            <DialogDescription>
              {editingModule ? 'Modifiez les informations du module' : 'Créez un nouveau module pour structurer votre cours'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="module-title">Titre du module</Label>
              <Input
                id="module-title"
                value={moduleForm.title}
                onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                placeholder="Ex: Introduction au sujet"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModuleDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleModuleSubmit}
              disabled={!moduleForm.title || createModuleMutation.isPending || updateModuleMutation.isPending}
            >
              {editingModule ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Dialog */}
      <Dialog open={isLessonDialogOpen} onOpenChange={setIsLessonDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLesson ? 'Modifier la leçon' : 'Ajouter une leçon'}</DialogTitle>
            <DialogDescription>
              {editingLesson ? 'Modifiez les informations de la leçon' : 'Créez une nouvelle leçon'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lesson-title">Titre de la leçon</Label>
              <Input
                id="lesson-title"
                value={lessonForm.title}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                placeholder="Ex: Comprendre les bases"
              />
            </div>
            <div>
              <Label htmlFor="lesson-type">Type de contenu</Label>
              <Select
                value={lessonForm.type}
                onValueChange={(value: string) => {
                  setLessonForm({ ...lessonForm, type: value, videoUrl: '', documentUrl: '', linkUrl: '' })
                  setLessonDocumentFile(null)
                  setLessonDocumentProgress(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Vidéo
                    </div>
                  </SelectItem>
                  <SelectItem value="document">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Document
                    </div>
                  </SelectItem>
                  <SelectItem value="link">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Lien externe
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Champ URL Vidéo */}
            {lessonForm.type === 'video' && (
              <div>
                <Label htmlFor="lesson-video-url">URL de la vidéo</Label>
                <Input
                  id="lesson-video-url"
                  value={lessonForm.videoUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, videoUrl: e.target.value })}
                  placeholder="Ex: https://youtube.com/watch?v=... ou https://vimeo.com/..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supporte YouTube, Vimeo et autres liens vidéo directs
                </p>
              </div>
            )}

            {/* Champ Upload Document */}
            {lessonForm.type === 'document' && (
              <div className="space-y-3">
                <Label>Document à uploader</Label>
                <FileUpload
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.mp4"
                  multiple={false}
                  maxFiles={1}
                  maxSize={100 * 1024 * 1024}
                  disabled={lessonDocumentUploading}
                  onFilesSelected={(files) => {
                    if (files.length > 0) {
                      setLessonDocumentFile(files[0])
                    }
                  }}
                />
                
                {lessonDocumentFile && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      📄 {lessonDocumentFile.name}
                    </p>
                    {lessonDocumentUploading && (
                      <div className="mt-2 space-y-2">
                        <Progress value={lessonDocumentProgress} className="h-1" />
                        <p className="text-xs text-blue-600 dark:text-blue-300">
                          Téléchargement: {lessonDocumentProgress}%
                        </p>
                      </div>
                    )}
                    {!lessonDocumentUploading && lessonDocumentProgress === 100 && (
                      <p className="text-xs text-green-600 dark:text-green-300 mt-2">
                        ✓ Fichier prêt à être uploadé lors de la création
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Champ URL Lien externe */}
            {lessonForm.type === 'link' && (
              <div>
                <Label htmlFor="lesson-link-url">URL du lien</Label>
                <Input
                  id="lesson-link-url"
                  value={lessonForm.linkUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, linkUrl: e.target.value })}
                  placeholder="Ex: https://example.com/ressource"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lien vers une ressource externe
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="lesson-duration">Durée estimée (minutes)</Label>
              <Input
                id="lesson-duration"
                type="number"
                min="1"
                value={lessonForm.duration_min}
                onChange={(e) => setLessonForm({ ...lessonForm, duration_min: parseInt(e.target.value) || 10 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsLessonDialogOpen(false)
                setLessonDocumentFile(null)
                setLessonDocumentProgress(0)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleLessonSubmit}
              disabled={!lessonForm.title || createLessonMutation.isPending || updateLessonMutation.isPending || lessonDocumentUploading}
            >
              {lessonDocumentUploading ? 'Téléchargement...' : editingLesson ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quiz Dialog */}
      <Dialog open={isQuizDialogOpen} onOpenChange={setIsQuizDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuiz ? 'Modifier le quiz' : 'Ajouter un quiz'}</DialogTitle>
            <DialogDescription>
              {editingQuiz ? 'Modifiez les informations du quiz' : 'Créez un quiz pour évaluer les connaissances des apprenants'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="quiz-title">Titre du quiz</Label>
              <Input
                id="quiz-title"
                value={quizForm.title}
                onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                placeholder="Ex: Quiz de fin de chapitre"
              />
            </div>
            <div>
              <Label htmlFor="quiz-description">Description</Label>
              <Input
                id="quiz-description"
                value={quizForm.description}
                onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                placeholder="Description du quiz (optionnel)"
              />
            </div>
            <div>
              <Label htmlFor="quiz-instructions">Instructions</Label>
              <Input
                id="quiz-instructions"
                value={quizForm.instructions}
                onChange={(e) => setQuizForm({ ...quizForm, instructions: e.target.value })}
                placeholder="Instructions pour les participants (optionnel)"
              />
            </div>
            <div>
              <Label htmlFor="quiz-passing-score">Score de réussite (%)</Label>
              <Input
                id="quiz-passing-score"
                type="number"
                min="0"
                max="100"
                value={quizForm.passing_score}
                onChange={(e) => setQuizForm({ ...quizForm, passing_score: parseInt(e.target.value) || 70 })}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="quiz-time-limit">Durée limite (minutes)</Label>
                <Input
                  id="quiz-time-limit"
                  type="number"
                  min="0"
                  value={quizForm.time_limit_minutes ?? ''}
                  onChange={(e) => setQuizForm({ ...quizForm, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Ex: 30"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="quiz-max-attempts">Nombre d'essais max</Label>
                <Input
                  id="quiz-max-attempts"
                  type="number"
                  min="1"
                  value={quizForm.max_attempts ?? 3}
                  onChange={(e) => setQuizForm({ ...quizForm, max_attempts: e.target.value ? parseInt(e.target.value) : 3 })}
                  placeholder="Ex: 3"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="quiz-questions-to-draw">Questions tirées au hasard (sur la banque de questions)</Label>
              <Input
                id="quiz-questions-to-draw"
                type="number"
                min="1"
                value={quizForm.questions_to_draw ?? ''}
                onChange={(e) => setQuizForm({ ...quizForm, questions_to_draw: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Laisser vide pour utiliser toutes les questions"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Chaque tentative tirera aléatoirement ce nombre de questions parmi celles du quiz.
              </p>
            </div>
            <div>
              <Label htmlFor="quiz-expires-at">Date d'expiration</Label>
              <Input
                id="quiz-expires-at"
                type="date"
                value={quizForm.expires_at || ''}
                onChange={(e) => setQuizForm({ ...quizForm, expires_at: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="quiz-badge">Badge associé</Label>
              <select
                id="quiz-badge"
                className="w-full border rounded px-2 py-1"
                value={quizForm.badge_id ?? ''}
                onChange={(e) => setQuizForm({ ...quizForm, badge_id: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Aucun</option>
                {badgesList && badgesList.map((badge: any) => (
                  <option key={badge.id} value={badge.id}>{badge.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-certificate-enabled"
                checked={quizForm.certificate_enabled}
                onChange={(e) => setQuizForm({ ...quizForm, certificate_enabled: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-certificate-enabled">Délivrer un certificat si réussi</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-show-correct-answers"
                checked={quizForm.show_correct_answers}
                onChange={(e) => setQuizForm({ ...quizForm, show_correct_answers: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-show-correct-answers">Afficher les bonnes réponses après soumission</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-shuffle-choices"
                checked={quizForm.shuffle_choices}
                onChange={(e) => setQuizForm({ ...quizForm, shuffle_choices: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-shuffle-choices">Mélanger l'ordre des choix</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-randomized"
                checked={quizForm.randomized}
                onChange={(e) => setQuizForm({ ...quizForm, randomized: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-randomized">Randomiser les questions</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuizDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleQuizSubmit}
              disabled={!quizForm.title || createQuizMutation.isPending || updateQuizMutation.isPending}
            >
              {editingQuiz ? 'Mettre à jour' : 'Créer le quiz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quiz Questions Management Dialog */}
      <Dialog open={isQuizQuestionsOpen} onOpenChange={setIsQuizQuestionsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Questions du quiz: {selectedQuiz?.title}</DialogTitle>
            <DialogDescription>
              Gérez les questions de ce quiz
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Questions list */}
            {quizQuestions.length > 0 ? (
              <div className="space-y-3">
                {quizQuestions.map((question, index) => (
                  <div key={question.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs">
                            Q{index + 1}
                          </span>
                          <span className="text-xs text-muted-foreground uppercase">
                            {question.type === 'mcq' ? 'QCM' : 
                             question.type === 'true_false' ? 'Vrai/Faux' :
                             question.type === 'short_text' ? 'Réponse courte' : 'Rédaction'}
                          </span>
                        </div>
                        <p className="font-medium">{question.prompt}</p>
                        {question.choices && question.choices.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {question.choices.map((choice, ci) => (
                              <div
                                key={ci}
                                className={`text-sm flex items-center gap-2 ${
                                  choice.isCorrect ? 'text-green-600 font-medium' : 'text-muted-foreground'
                                }`}
                              >
                                {choice.isCorrect ? '✓' : '○'} {choice.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditQuestion(question)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Supprimer cette question ?')) {
                              deleteQuestionMutation.mutate(question.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Aucune question dans ce quiz
              </div>
            )}

            <Button onClick={openAddQuestion} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une question
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuizQuestionsOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Question Dialog */}
      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Modifier la question' : 'Ajouter une question'}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? 'Modifiez les informations de la question' : 'Créez une nouvelle question pour le quiz'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type de question</Label>
              <Select
                value={questionForm.type}
                onValueChange={(value: 'mcq' | 'true_false' | 'short_text' | 'essay') => {
                  if (value === 'true_false') {
                    setQuestionForm({
                      ...questionForm,
                      type: value,
                      choices: [
                        { label: 'Vrai', isCorrect: true },
                        { label: 'Faux', isCorrect: false },
                      ],
                    })
                  } else if (value === 'mcq') {
                    setQuestionForm({
                      ...questionForm,
                      type: value,
                      choices: [
                        { label: '', isCorrect: false },
                        { label: '', isCorrect: false },
                      ],
                    })
                  } else {
                    setQuestionForm({ ...questionForm, type: value, choices: [] })
                  }
                }}
                disabled={!!editingQuestion}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">QCM (Choix multiples)</SelectItem>
                  <SelectItem value="true_false">Vrai / Faux</SelectItem>
                  <SelectItem value="short_text">Réponse courte</SelectItem>
                  <SelectItem value="essay">Rédaction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="question-prompt">Question</Label>
              <Input
                id="question-prompt"
                value={questionForm.prompt}
                onChange={(e) => setQuestionForm({ ...questionForm, prompt: e.target.value })}
                placeholder="Entrez votre question..."
              />
            </div>

            {/* Choices for MCQ */}
            {questionForm.type === 'mcq' && (
              <div className="space-y-3">
                <Label>Choix de réponses</Label>
                {questionForm.choices.map((choice, index) => (
                  <div key={`choice-${index}`} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-choice"
                      id={`choice-correct-${index}`}
                      checked={choice.isCorrect === true}
                      onChange={() => updateChoice(index, 'isCorrect', true)}
                      className="h-4 w-4"
                    />
                    <Input
                      value={choice.label}
                      onChange={(e) => updateChoice(index, 'label', e.target.value)}
                      placeholder={`Choix ${index + 1}`}
                      className="flex-1"
                    />
                    {questionForm.choices.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChoice(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addChoice}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter un choix
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sélectionnez le bouton radio pour indiquer la bonne réponse
                </p>
              </div>
            )}

            {/* Choices for True/False */}
            {questionForm.type === 'true_false' && (
              <div className="space-y-3">
                <Label>Bonne réponse</Label>
                <div className="flex gap-4">
                  {questionForm.choices.map((choice, index) => (
                    <label key={`tf-choice-${index}`} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="tf-choice"
                        id={`tf-choice-${index}`}
                        checked={choice.isCorrect === true}
                        onChange={() => updateChoice(index, 'isCorrect', true)}
                        className="h-4 w-4"
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuestionDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleQuestionSubmit}
              disabled={!questionForm.prompt || createQuestionMutation.isPending || updateQuestionMutation.isPending}
            >
              {editingQuestion ? 'Mettre à jour' : 'Ajouter la question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
