import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { useOrganization } from '@/lib/tenantSettings'

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
  is_mandatory?: boolean
  presence_check_percent?: number | null
  reset_time_on_reopen?: boolean
  allow_document_download?: boolean
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
  const { t } = useTranslation('admin')
  const { t: tCommon } = useTranslation('common')
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
  const [modulePendingDelete, setModulePendingDelete] = useState<Module | null>(null)
  const [lessonPendingDelete, setLessonPendingDelete] = useState<Lesson | null>(null)
  const [quizPendingDelete, setQuizPendingDelete] = useState<Quiz | null>(null)
  const [questionPendingDelete, setQuestionPendingDelete] = useState<Question | null>(null)
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null)

  const [moduleForm, setModuleForm] = useState({ title: '' })
  const [lessonForm, setLessonForm] = useState({ title: '', type: 'video', duration_min: 10, is_mandatory: false, videoUrl: '', documentUrl: '', linkUrl: '', presence_check_percent: null as number | null, reset_time_on_reopen: false, allow_document_download: true })
  const [lessonVideoSource, setLessonVideoSource] = useState<'url' | 'upload'>('url')
  const [lessonUploadFile, setLessonUploadFile] = useState<File | null>(null)
  const [lessonUploadUploading, setLessonUploadUploading] = useState(false)
  const [lessonUploadProgress, setLessonUploadProgress] = useState(0)
  const { data: organization } = useOrganization()
  const quizDefaults = {
    passingScore: organization?.settings?.quizDefaultPassingScore ?? 70,
    maxAttempts: organization?.settings?.quizDefaultMaxAttempts ?? 3,
  }
  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    instructions: '',
    passing_score: 70,
    randomized: false,
    questions_to_draw: null as number | null,
    time_limit_minutes: null as number | null,
    // 0 = unlimited
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
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.moduleCreated') })
      setIsModuleDialogOpen(false)
      setModuleForm({ title: '' })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericCreateError'), variant: 'destructive' })
    },
  })

  const updateModuleMutation = useMutation({
    mutationFn: async ({ moduleId, data }: { moduleId: number; data: { title: string } }) => {
      const response = await api.put(`/modules/${moduleId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.moduleUpdated') })
      setIsModuleDialogOpen(false)
      setEditingModule(null)
      setModuleForm({ title: '' })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericUpdateError'), variant: 'destructive' })
    },
  })

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: number) => {
      await api.delete(`/modules/${moduleId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.moduleDeleted') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericDeleteError'), variant: 'destructive' })
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
      is_mandatory?: boolean;
      presence_check_percent?: number | null;
      reset_time_on_reopen?: boolean;
      allow_document_download?: boolean;
      videoUrl?: string;
      documentUrl?: string;
      documentFileId?: number;
      videoFileId?: number;
      linkUrl?: string;
    }) => {
      // 1. Create the lesson first
      const response = await api.post(`/lessons`, {
        moduleId: data.moduleId,
        title: data.title,
        type: data.type,
        durationMin: data.duration_min,
        isMandatory: data.is_mandatory,
        presenceCheckPercent: data.presence_check_percent,
        resetTimeOnReopen: data.reset_time_on_reopen,
        allowDocumentDownload: data.allow_document_download,
      })
      const lesson = response.data.data

      // 2. Create associated content if URL or FileID is provided
      if (data.documentFileId) {
        // Pour les fichiers uploadés, utiliser fileId
        await api.post('/contents', {
          lessonId: lesson.id,
          type: 'pdf',
          title: data.title,
          fileId: data.documentFileId,
        })
      } else if (data.videoFileId) {
        // Vidéo uploadée localement, jouée depuis le stockage du serveur
        await api.post('/contents', {
          lessonId: lesson.id,
          type: 'video_mp4',
          title: data.title,
          fileId: data.videoFileId,
        })
      } else {
        const url = data.videoUrl || data.documentUrl || data.linkUrl
        if (url && url.trim()) {
          const contentType = mapLessonTypeToContentType(data.type)
          await api.post('/contents', {
            lessonId: lesson.id,
            type: contentType,
            title: data.title,
            url: url.trim(),
          })
        }
      }

      return lesson
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.lessonCreated') })
      setIsLessonDialogOpen(false)
      setLessonForm({ title: '', type: 'video', duration_min: 10, is_mandatory: false, videoUrl: '', documentUrl: '', linkUrl: '', presence_check_percent: null, reset_time_on_reopen: false, allow_document_download: true })
      setLessonVideoSource('url')
      setLessonUploadFile(null)
      setLessonUploadProgress(0)
      setSelectedModuleId(null)
    },
    onError: (error: any) => {
      console.error('createLessonMutation - error:', error.response?.data || error)
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericCreateError'), variant: 'destructive' })
    },
  })

  const updateLessonMutation = useMutation({
    mutationFn: async ({ lessonId, data }: { lessonId: number; data: any }) => {
      const response = await api.put(`/lessons/${lessonId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.lessonUpdated') })
      setIsLessonDialogOpen(false)
      setEditingLesson(null)
      setLessonForm({ title: '', type: 'video', duration_min: 10, is_mandatory: false, videoUrl: '', documentUrl: '', linkUrl: '', presence_check_percent: null, reset_time_on_reopen: false, allow_document_download: true })
      setLessonVideoSource('url')
      setLessonUploadFile(null)
      setLessonUploadProgress(0)
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericUpdateError'), variant: 'destructive' })
    },
  })

  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: number) => {
      await api.delete(`/lessons/${lessonId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.lessonDeleted') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericDeleteError'), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.quizCreated') })
      setIsQuizDialogOpen(false)
      resetQuizForm()
      setSelectedLessonId(null)
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericCreateError'), variant: 'destructive' })
    },
  })

  const updateQuizMutation = useMutation({
    mutationFn: async ({ quizId, data }: { quizId: number; data: any }) => {
      const response = await api.put(`/quizzes/${quizId}`, data)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.quizUpdated') })
      setIsQuizDialogOpen(false)
      setEditingQuiz(null)
      resetQuizForm()
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericUpdateError'), variant: 'destructive' })
    },
  })

  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: number) => {
      await api.delete(`/quizzes/${quizId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-edit', courseId] })
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.quizDeleted') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericDeleteError'), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.questionAdded') })
      setIsQuestionDialogOpen(false)
      setQuestionForm({
        type: 'mcq',
        prompt: '',
        choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
      })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericCreateError'), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.questionUpdated') })
      setIsQuestionDialogOpen(false)
      setEditingQuestion(null)
      setQuestionForm({
        type: 'mcq',
        prompt: '',
        choices: [{ label: '', isCorrect: false }, { label: '', isCorrect: false }],
      })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericUpdateError'), variant: 'destructive' })
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
      toast({ title: tCommon('status.success'), description: t('courseEdit.toasts.questionDeleted') })
    },
    onError: (error: any) => {
      toast({ title: tCommon('status.error'), description: error.response?.data?.error?.message || t('courseEdit.genericDeleteError'), variant: 'destructive' })
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
    setSelectedModuleId(moduleId)
    setEditingLesson(null)
    setLessonForm({ title: '', type: 'video', duration_min: 10, is_mandatory: false, videoUrl: '', documentUrl: '', linkUrl: '', presence_check_percent: null, reset_time_on_reopen: false, allow_document_download: true })
    setLessonVideoSource('url')
    setLessonUploadFile(null)
    setLessonUploadProgress(0)
    setIsLessonDialogOpen(true)
  }

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setLessonForm({
      title: lesson.title,
      type: lesson.type || 'video',
      duration_min: lesson.duration_min,
      is_mandatory: lesson.is_mandatory || false,
      videoUrl: (lesson as any).videoUrl || '',
      documentUrl: (lesson as any).documentUrl || '',
      linkUrl: (lesson as any).linkUrl || '',
      presence_check_percent: lesson.presence_check_percent ?? null,
      reset_time_on_reopen: lesson.reset_time_on_reopen || false,
      allow_document_download: lesson.allow_document_download ?? true,
    })
    setLessonVideoSource('url')
    setLessonUploadFile(null)
    setLessonUploadProgress(0)
    setIsLessonDialogOpen(true)
  }

  const resetQuizForm = () => {
    // New quizzes start from the organization's defaults (Administration > Organisation).
    setQuizForm({
      title: '',
      description: '',
      instructions: '',
      passing_score: quizDefaults.passingScore,
      randomized: false,
      questions_to_draw: null,
      time_limit_minutes: null,
      max_attempts: quizDefaults.maxAttempts,
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
      // NULL = unlimited: shown as 0, not silently turned into 3 on the next save.
      max_attempts: quiz.max_attempts ?? 0,
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
    // Si un fichier local est sélectionné (document, ou vidéo en mode upload),
    // l'uploader d'abord puis créer la leçon avec l'ID du fichier obtenu.
    const isDocumentUpload = lessonForm.type === 'document' && !!lessonUploadFile
    const isVideoUpload = lessonForm.type === 'video' && lessonVideoSource === 'upload' && !!lessonUploadFile
    if (!editingLesson && (isDocumentUpload || isVideoUpload)) {
      setLessonUploadUploading(true)
      setLessonUploadProgress(0)

      try {
        const uploadedFile = await fileService.uploadFile(
          lessonUploadFile!,
          (progress) => setLessonUploadProgress(progress),
          'lessons'
        )

        // Créer la leçon avec l'ID du fichier uploadé
        if (selectedModuleId) {
          createLessonMutation.mutate({
            moduleId: selectedModuleId,
            title: lessonForm.title,
            type: lessonForm.type,
            duration_min: lessonForm.duration_min,
            is_mandatory: lessonForm.is_mandatory,
            documentFileId: isDocumentUpload ? uploadedFile.id : undefined,
            videoFileId: isVideoUpload ? uploadedFile.id : undefined,
          })
        }
      } catch (error) {
        console.error('Erreur lors de l\'upload du fichier:', error)
        toast({
          title: tCommon('status.error'),
          description: isVideoUpload ? t('courseEdit.toasts.videoUploadError') : t('courseEdit.toasts.documentUploadError'),
          variant: 'destructive',
        })
      } finally {
        setLessonUploadUploading(false)
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
          isMandatory: lessonForm.is_mandatory,
          presenceCheckPercent: lessonForm.presence_check_percent,
          resetTimeOnReopen: lessonForm.reset_time_on_reopen,
          allowDocumentDownload: lessonForm.allow_document_download,
        },
      })
    } else if (selectedModuleId) {
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
      maxAttempts: quizForm.max_attempts || 0,
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
        <h2 className="text-xl font-semibold mb-2">{t('courseEdit.notFound.title')}</h2>
        <Button onClick={() => navigate('/admin/courses')}>{t('courseEdit.notFound.backButton')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/courses')} className="self-start">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('courseEdit.header.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-muted-foreground">{t('courseEdit.header.manageContent')}</p>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">{t('courseEdit.tabs.content')}</TabsTrigger>
          <TabsTrigger value="settings">{t('courseEdit.tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4">
          {/* Add Module Button */}
          <div className="flex justify-end">
            <Button onClick={openAddModule}>
              <Plus className="h-4 w-4 mr-2" />
              {t('courseEdit.addModule')}
            </Button>
          </div>

          {/* Modules List */}
          {course.modules && course.modules.length > 0 ? (
            <div className="space-y-4">
              {course.modules.map((module: Module, index: number) => (
                <Card key={module.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                        onClick={() => toggleModule(module.id)}
                      >
                        {expandedModules.includes(module.id) ? (
                          <ChevronDown className="h-5 w-5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-5 w-5 shrink-0" />
                        )}
                        <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                          {index + 1}
                        </span>
                        <CardTitle className="text-lg truncate">{module.title}</CardTitle>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('courseEdit.lessonsCount', { count: module.lessons?.length || 0 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModule(module)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setModulePendingDelete(module)}
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
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  {getLessonIcon(lesson.type)}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium truncate">{lesson.title}</p>
                                      {lesson.is_mandatory && (
                                        <Badge variant="secondary" className="shrink-0">{t('courseEdit.lessonDialog.mandatory')}</Badge>
                                      )}
                                    </div>
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
                                    {t('courseEdit.quizButton')}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openEditLesson(lesson)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLessonPendingDelete(lesson)}
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
                                      className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 rounded p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <HelpCircle className="h-4 w-4 text-primary" />
                                        <span className="text-sm">{quiz.title}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {t('courseEdit.passingScoreInfo', { score: quiz.passing_score, count: quiz.question_count || 0 })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openQuizQuestions(quiz)}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          {t('courseEdit.questionsButton')}
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
                                          onClick={() => setQuizPendingDelete(quiz)}
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
                            {t('courseEdit.noLessonsInModule')}
                          </p>
                        )}

                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => openAddLesson(module.id)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t('courseEdit.addLesson')}
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
                <h3 className="text-lg font-medium mb-2">{t('courseEdit.noModules.title')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('courseEdit.noModules.description')}
                </p>
                <Button onClick={openAddModule}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('courseEdit.addModule')}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>{t('courseEdit.settingsTab.title')}</CardTitle>
              <CardDescription>{t('courseEdit.settingsTab.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {t('courseEdit.settingsTab.hint')}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Module Dialog */}
      <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModule ? t('courseEdit.moduleDialog.editTitle') : t('courseEdit.moduleDialog.addTitle')}</DialogTitle>
            <DialogDescription>
              {editingModule ? t('courseEdit.moduleDialog.editDescription') : t('courseEdit.moduleDialog.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="module-title">{t('courseEdit.moduleDialog.titleLabel')}</Label>
              <Input
                id="module-title"
                value={moduleForm.title}
                onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                placeholder={t('courseEdit.moduleDialog.titlePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModuleDialogOpen(false)}>
              {t('courseEdit.moduleDialog.cancel')}
            </Button>
            <Button
              onClick={handleModuleSubmit}
              disabled={!moduleForm.title || createModuleMutation.isPending || updateModuleMutation.isPending}
            >
              {editingModule ? t('courseEdit.moduleDialog.update') : t('courseEdit.moduleDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Dialog */}
      <Dialog open={isLessonDialogOpen} onOpenChange={setIsLessonDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLesson ? t('courseEdit.lessonDialog.editTitle') : t('courseEdit.lessonDialog.addTitle')}</DialogTitle>
            <DialogDescription>
              {editingLesson ? t('courseEdit.lessonDialog.editDescription') : t('courseEdit.lessonDialog.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lesson-title">{t('courseEdit.lessonDialog.titleLabel')}</Label>
              <Input
                id="lesson-title"
                value={lessonForm.title}
                onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                placeholder={t('courseEdit.lessonDialog.titlePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="lesson-type">{t('courseEdit.lessonDialog.contentType')}</Label>
              <Select
                value={lessonForm.type}
                onValueChange={(value: string) => {
                  setLessonForm({ ...lessonForm, type: value, videoUrl: '', documentUrl: '', linkUrl: '' })
                  setLessonVideoSource('url')
                  setLessonUploadFile(null)
                  setLessonUploadProgress(0)
                }}
              >
                <SelectTrigger id="lesson-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      {t('courseEdit.lessonDialog.video')}
                    </div>
                  </SelectItem>
                  <SelectItem value="document">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('courseEdit.lessonDialog.document')}
                    </div>
                  </SelectItem>
                  <SelectItem value="link">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      {t('courseEdit.lessonDialog.link')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vidéo : lien externe ou fichier uploadé localement */}
            {lessonForm.type === 'video' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={lessonVideoSource === 'url' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setLessonVideoSource('url')}
                  >
                    {t('courseEdit.lessonDialog.videoSourceUrl')}
                  </Button>
                  <Button
                    type="button"
                    variant={lessonVideoSource === 'upload' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLessonVideoSource('upload')
                      setLessonForm({ ...lessonForm, videoUrl: '' })
                    }}
                  >
                    {t('courseEdit.lessonDialog.videoSourceUpload')}
                  </Button>
                </div>

                {lessonVideoSource === 'url' ? (
                  <div>
                    <Label htmlFor="lesson-video-url">{t('courseEdit.lessonDialog.videoUrl')}</Label>
                    <Input
                      id="lesson-video-url"
                      value={lessonForm.videoUrl}
                      onChange={(e) => setLessonForm({ ...lessonForm, videoUrl: e.target.value })}
                      placeholder={t('courseEdit.lessonDialog.videoUrlPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('courseEdit.lessonDialog.videoUrlHint')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>{t('courseEdit.lessonDialog.videoToUpload')}</Label>
                    <FileUpload
                      accept=".mp4,.webm"
                      multiple={false}
                      maxFiles={1}
                      maxSize={100 * 1024 * 1024}
                      disabled={lessonUploadUploading}
                      onFilesSelected={(files) => {
                        if (files.length > 0) {
                          setLessonUploadFile(files[0])
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('courseEdit.lessonDialog.videoToUploadHint')}
                    </p>

                    {lessonUploadFile && (
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          🎬 {lessonUploadFile.name}
                        </p>
                        {lessonUploadUploading && (
                          <div className="mt-2 space-y-2">
                            <Progress value={lessonUploadProgress} className="h-1" />
                            <p className="text-xs text-blue-600 dark:text-blue-300">
                              {t('courseEdit.lessonDialog.uploadProgress', { percent: lessonUploadProgress })}
                            </p>
                          </div>
                        )}
                        {!lessonUploadUploading && lessonUploadProgress === 100 && (
                          <p className="text-xs text-green-600 dark:text-green-300 mt-2">
                            {t('courseEdit.lessonDialog.uploadReady')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Champ Upload Document */}
            {lessonForm.type === 'document' && (
              <div className="space-y-3">
                <Label>{t('courseEdit.lessonDialog.documentToUpload')}</Label>
                <FileUpload
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.mp4"
                  multiple={false}
                  maxFiles={1}
                  maxSize={100 * 1024 * 1024}
                  disabled={lessonUploadUploading}
                  onFilesSelected={(files) => {
                    if (files.length > 0) {
                      setLessonUploadFile(files[0])
                    }
                  }}
                />
                
                {lessonUploadFile && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      📄 {lessonUploadFile.name}
                    </p>
                    {lessonUploadUploading && (
                      <div className="mt-2 space-y-2">
                        <Progress value={lessonUploadProgress} className="h-1" />
                        <p className="text-xs text-blue-600 dark:text-blue-300">
                          {t('courseEdit.lessonDialog.uploadProgress', { percent: lessonUploadProgress })}
                        </p>
                      </div>
                    )}
                    {!lessonUploadUploading && lessonUploadProgress === 100 && (
                      <p className="text-xs text-green-600 dark:text-green-300 mt-2">
                        {t('courseEdit.lessonDialog.uploadReady')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Champ URL Lien externe */}
            {lessonForm.type === 'link' && (
              <div>
                <Label htmlFor="lesson-link-url">{t('courseEdit.lessonDialog.linkUrl')}</Label>
                <Input
                  id="lesson-link-url"
                  value={lessonForm.linkUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, linkUrl: e.target.value })}
                  placeholder={t('courseEdit.lessonDialog.linkUrlPlaceholder')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('courseEdit.lessonDialog.linkUrlHint')}
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="lesson-duration">{t('courseEdit.lessonDialog.duration')}</Label>
              <Input
                id="lesson-duration"
                type="number"
                min="1"
                value={lessonForm.duration_min}
                onChange={(e) => setLessonForm({ ...lessonForm, duration_min: parseInt(e.target.value) || 10 })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lesson-mandatory"
                checked={lessonForm.is_mandatory}
                onChange={(e) => setLessonForm({ ...lessonForm, is_mandatory: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="lesson-mandatory">{t('courseEdit.lessonDialog.mandatory')}</Label>
            </div>

            <div>
              <Label htmlFor="lesson-presence-check">{t('courseEdit.lessonDialog.presenceCheckPercent')}</Label>
              <Input
                id="lesson-presence-check"
                type="number"
                min="0"
                max="100"
                value={lessonForm.presence_check_percent ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  setLessonForm({ ...lessonForm, presence_check_percent: value === '' ? null : Math.min(100, Math.max(0, parseInt(value) || 0)) })
                }}
                placeholder={t('courseEdit.lessonDialog.presenceCheckPercentPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('courseEdit.lessonDialog.presenceCheckPercentHint')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lesson-reset-time"
                checked={lessonForm.reset_time_on_reopen}
                onChange={(e) => setLessonForm({ ...lessonForm, reset_time_on_reopen: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="lesson-reset-time">{t('courseEdit.lessonDialog.resetTimeOnReopen')}</Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lesson-allow-download"
                checked={lessonForm.allow_document_download}
                onChange={(e) => setLessonForm({ ...lessonForm, allow_document_download: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="lesson-allow-download">{t('courseEdit.lessonDialog.allowDownload')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsLessonDialogOpen(false)
                setLessonUploadFile(null)
                setLessonUploadProgress(0)
              }}
            >
              {t('courseEdit.lessonDialog.cancel')}
            </Button>
            <Button
              onClick={handleLessonSubmit}
              disabled={!lessonForm.title || createLessonMutation.isPending || updateLessonMutation.isPending || lessonUploadUploading}
            >
              {lessonUploadUploading ? t('courseEdit.lessonDialog.uploading') : editingLesson ? t('courseEdit.lessonDialog.update') : t('courseEdit.lessonDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quiz Dialog */}
      <Dialog open={isQuizDialogOpen} onOpenChange={setIsQuizDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuiz ? t('courseEdit.quizDialog.editTitle') : t('courseEdit.quizDialog.addTitle')}</DialogTitle>
            <DialogDescription>
              {editingQuiz ? t('courseEdit.quizDialog.editDescription') : t('courseEdit.quizDialog.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="quiz-title">{t('courseEdit.quizDialog.titleLabel')}</Label>
              <Input
                id="quiz-title"
                value={quizForm.title}
                onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                placeholder={t('courseEdit.quizDialog.titlePlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="quiz-description">{t('courseEdit.quizDialog.description')}</Label>
              <Input
                id="quiz-description"
                value={quizForm.description}
                onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                placeholder={t('courseEdit.quizDialog.descriptionPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="quiz-instructions">{t('courseEdit.quizDialog.instructions')}</Label>
              <Input
                id="quiz-instructions"
                value={quizForm.instructions}
                onChange={(e) => setQuizForm({ ...quizForm, instructions: e.target.value })}
                placeholder={t('courseEdit.quizDialog.instructionsPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="quiz-passing-score">{t('courseEdit.quizDialog.passingScore')}</Label>
              <Input
                id="quiz-passing-score"
                type="number"
                min="0"
                max="100"
                value={quizForm.passing_score}
                onChange={(e) => {
                  const score = parseInt(e.target.value)
                  setQuizForm({ ...quizForm, passing_score: Number.isNaN(score) ? 0 : Math.min(100, Math.max(0, score)) })
                }}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="quiz-time-limit">{t('courseEdit.quizDialog.timeLimit')}</Label>
                <Input
                  id="quiz-time-limit"
                  type="number"
                  min="0"
                  value={quizForm.time_limit_minutes ?? ''}
                  onChange={(e) => setQuizForm({ ...quizForm, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder={t('courseEdit.quizDialog.timeLimitPlaceholder')}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="quiz-max-attempts">{t('courseEdit.quizDialog.maxAttempts')}</Label>
                <Input
                  id="quiz-max-attempts"
                  type="number"
                  min="0"
                  value={quizForm.max_attempts ?? 0}
                  onChange={(e) => setQuizForm({ ...quizForm, max_attempts: Math.max(0, parseInt(e.target.value) || 0) })}
                  placeholder={t('courseEdit.quizDialog.maxAttemptsPlaceholder')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="quiz-questions-to-draw">{t('courseEdit.quizDialog.questionsToDraw')}</Label>
              <Input
                id="quiz-questions-to-draw"
                type="number"
                min="1"
                value={quizForm.questions_to_draw ?? ''}
                onChange={(e) => setQuizForm({ ...quizForm, questions_to_draw: e.target.value ? parseInt(e.target.value) : null })}
                placeholder={t('courseEdit.quizDialog.questionsToDrawPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('courseEdit.quizDialog.questionsToDrawHint')}
              </p>
            </div>
            <div>
              <Label htmlFor="quiz-expires-at">{t('courseEdit.quizDialog.expiresAt')}</Label>
              <Input
                id="quiz-expires-at"
                type="date"
                value={quizForm.expires_at || ''}
                onChange={(e) => setQuizForm({ ...quizForm, expires_at: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="quiz-badge">{t('courseEdit.quizDialog.badge')}</Label>
              <select
                id="quiz-badge"
                className="w-full border rounded px-2 py-1"
                value={quizForm.badge_id ?? ''}
                onChange={(e) => setQuizForm({ ...quizForm, badge_id: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">{t('courseEdit.quizDialog.noBadge')}</option>
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
              <Label htmlFor="quiz-certificate-enabled">{t('courseEdit.quizDialog.certificateEnabled')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-show-correct-answers"
                checked={quizForm.show_correct_answers}
                onChange={(e) => setQuizForm({ ...quizForm, show_correct_answers: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-show-correct-answers">{t('courseEdit.quizDialog.showCorrectAnswers')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-shuffle-choices"
                checked={quizForm.shuffle_choices}
                onChange={(e) => setQuizForm({ ...quizForm, shuffle_choices: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-shuffle-choices">{t('courseEdit.quizDialog.shuffleChoices')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quiz-randomized"
                checked={quizForm.randomized}
                onChange={(e) => setQuizForm({ ...quizForm, randomized: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="quiz-randomized">{t('courseEdit.quizDialog.randomized')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuizDialogOpen(false)}>
              {t('courseEdit.quizDialog.cancel')}
            </Button>
            <Button
              onClick={handleQuizSubmit}
              disabled={!quizForm.title || createQuizMutation.isPending || updateQuizMutation.isPending}
            >
              {editingQuiz ? t('courseEdit.quizDialog.update') : t('courseEdit.quizDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quiz Questions Management Dialog */}
      <Dialog open={isQuizQuestionsOpen} onOpenChange={setIsQuizQuestionsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('courseEdit.quizQuestionsDialog.title', { title: selectedQuiz?.title })}</DialogTitle>
            <DialogDescription>
              {t('courseEdit.quizQuestionsDialog.description')}
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
                            {question.type === 'mcq' ? t('courseEdit.quizQuestionsDialog.types.mcq') :
                             question.type === 'true_false' ? t('courseEdit.quizQuestionsDialog.types.trueFalse') :
                             question.type === 'short_text' ? t('courseEdit.quizQuestionsDialog.types.shortText') : t('courseEdit.quizQuestionsDialog.types.essay')}
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
                          onClick={() => setQuestionPendingDelete(question)}
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
                {t('courseEdit.quizQuestionsDialog.noQuestions')}
              </div>
            )}

            <Button onClick={openAddQuestion} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              {t('courseEdit.quizQuestionsDialog.addQuestion')}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuizQuestionsOpen(false)}>
              {t('courseEdit.quizQuestionsDialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Question Dialog */}
      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? t('courseEdit.questionDialog.editTitle') : t('courseEdit.questionDialog.addTitle')}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? t('courseEdit.questionDialog.editDescription') : t('courseEdit.questionDialog.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="question-type">{t('courseEdit.questionDialog.questionType')}</Label>
              <Select
                value={questionForm.type}
                onValueChange={(value: 'mcq' | 'true_false' | 'short_text' | 'essay') => {
                  if (value === 'true_false') {
                    setQuestionForm({
                      ...questionForm,
                      type: value,
                      choices: [
                        { label: t('courseEdit.questionDialog.trueLabel'), isCorrect: true },
                        { label: t('courseEdit.questionDialog.falseLabel'), isCorrect: false },
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
                <SelectTrigger id="question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">{t('courseEdit.questionDialog.types.mcq')}</SelectItem>
                  <SelectItem value="true_false">{t('courseEdit.questionDialog.types.trueFalse')}</SelectItem>
                  <SelectItem value="short_text">{t('courseEdit.questionDialog.types.shortText')}</SelectItem>
                  <SelectItem value="essay">{t('courseEdit.questionDialog.types.essay')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="question-prompt">{t('courseEdit.questionDialog.question')}</Label>
              <Input
                id="question-prompt"
                value={questionForm.prompt}
                onChange={(e) => setQuestionForm({ ...questionForm, prompt: e.target.value })}
                placeholder={t('courseEdit.questionDialog.questionPlaceholder')}
              />
            </div>

            {/* Choices for MCQ */}
            {questionForm.type === 'mcq' && (
              <div className="space-y-3">
                <Label>{t('courseEdit.questionDialog.choicesLabel')}</Label>
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
                      placeholder={t('courseEdit.questionDialog.choicePlaceholder', { number: index + 1 })}
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
                  {t('courseEdit.questionDialog.addChoice')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('courseEdit.questionDialog.selectCorrectHint')}
                </p>
              </div>
            )}

            {/* Choices for True/False */}
            {questionForm.type === 'true_false' && (
              <div className="space-y-3">
                <Label>{t('courseEdit.questionDialog.correctAnswerLabel')}</Label>
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
              {t('courseEdit.questionDialog.cancel')}
            </Button>
            <Button
              onClick={handleQuestionSubmit}
              disabled={!questionForm.prompt || createQuestionMutation.isPending || updateQuestionMutation.isPending}
            >
              {editingQuestion ? t('courseEdit.questionDialog.update') : t('courseEdit.questionDialog.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!modulePendingDelete}
        onOpenChange={(open) => !open && setModulePendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('courseEdit.confirmDeleteModule')}
        onConfirm={() => {
          if (modulePendingDelete) {
            deleteModuleMutation.mutate(modulePendingDelete.id)
            setModulePendingDelete(null)
          }
        }}
      />
      <ConfirmDialog
        open={!!lessonPendingDelete}
        onOpenChange={(open) => !open && setLessonPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('courseEdit.confirmDeleteLesson')}
        onConfirm={() => {
          if (lessonPendingDelete) {
            deleteLessonMutation.mutate(lessonPendingDelete.id)
            setLessonPendingDelete(null)
          }
        }}
      />
      <ConfirmDialog
        open={!!quizPendingDelete}
        onOpenChange={(open) => !open && setQuizPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('courseEdit.confirmDeleteQuiz')}
        onConfirm={() => {
          if (quizPendingDelete) {
            deleteQuizMutation.mutate(quizPendingDelete.id)
            setQuizPendingDelete(null)
          }
        }}
      />
      <ConfirmDialog
        open={!!questionPendingDelete}
        onOpenChange={(open) => !open && setQuestionPendingDelete(null)}
        title={tCommon('actions.delete')}
        description={t('courseEdit.confirmDeleteQuestion')}
        onConfirm={() => {
          if (questionPendingDelete) {
            deleteQuestionMutation.mutate(questionPendingDelete.id)
            setQuestionPendingDelete(null)
          }
        }}
      />
    </div>
  )
}
