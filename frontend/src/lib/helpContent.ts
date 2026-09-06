export interface HelpTopic {
  /** react-router path pattern, matched against the current location */
  pattern: string
  /** i18next key under the 'help' namespace's 'topics' object (e.g. 'topics.<key>.title') */
  key: string
}

export const helpTopics: HelpTopic[] = [
  // --- Auth ---
  { pattern: '/login', key: 'login' },
  { pattern: '/register', key: 'register' },
  { pattern: '/forgot-password', key: 'forgotPassword' },
  { pattern: '/reset-password', key: 'resetPassword' },

  // --- Learner ---
  { pattern: '/dashboard', key: 'dashboard' },
  { pattern: '/courses', key: 'courses' },
  { pattern: '/courses/:id', key: 'courseDetail' },
  { pattern: '/lessons', key: 'lessons' },
  { pattern: '/courses/:courseId/lessons/:lessonId', key: 'lesson' },
  { pattern: '/lessons/:lessonId/quizzes', key: 'lessonQuizzes' },
  { pattern: '/lessons/:lessonId/quiz/create', key: 'quizCreate' },
  { pattern: '/quizzes/:quizId', key: 'quizTake' },
  { pattern: '/quizzes/:quizId/manage-questions', key: 'quizManageQuestions' },
  { pattern: '/badges', key: 'badges' },
  { pattern: '/certificates', key: 'certificates' },
  { pattern: '/notifications', key: 'notifications' },
  { pattern: '/search', key: 'search' },
  { pattern: '/chat', key: 'chat' },
  { pattern: '/chat/:conversationId', key: 'chatConversation' },
  { pattern: '/live', key: 'live' },
  { pattern: '/live/:id', key: 'liveDetail' },
  { pattern: '/blog', key: 'blog' },
  { pattern: '/blog/:id', key: 'blogPost' },
  { pattern: '/profile', key: 'profile' },
  { pattern: '/settings', key: 'settings' },
  { pattern: '/ai-tutor', key: 'aiTutor' },
  { pattern: '/content-upload', key: 'contentUpload' },
  { pattern: '/my-team', key: 'myTeam' },

  // --- Admin ---
  { pattern: '/admin', key: 'adminHome' },
  { pattern: '/admin/analytics', key: 'adminAnalytics' },
  { pattern: '/admin/users', key: 'adminUsers' },
  { pattern: '/admin/courses', key: 'adminCourses' },
  { pattern: '/admin/courses/:id/edit', key: 'adminCourseEdit' },
  { pattern: '/admin/assignments', key: 'adminAssignments' },
  { pattern: '/admin/teams', key: 'adminTeams' },
  { pattern: '/admin/badges', key: 'adminBadges' },
  { pattern: '/admin/certificates', key: 'adminCertificates' },
  { pattern: '/admin/live-sessions', key: 'adminLiveSessions' },
  { pattern: '/admin/notifications', key: 'adminNotifications' },
  { pattern: '/admin/email-queue', key: 'adminEmailQueue' },
  { pattern: '/admin/blog', key: 'adminBlog' },
  { pattern: '/admin/reports', key: 'adminReports' },
  { pattern: '/admin/organization', key: 'adminOrganization' },
  { pattern: '/admin/import', key: 'adminImport' },
  { pattern: '/admin/platform', key: 'adminPlatform' },
  { pattern: '/admin/email-settings', key: 'adminEmailSettings' },
  { pattern: '/admin/livekit-settings', key: 'adminLiveKitSettings' },
  { pattern: '/admin/recording-settings', key: 'adminRecordingSettings' },
  { pattern: '/admin/logs', key: 'adminLogs' },

  // --- Fallback ---
  { pattern: '*', key: 'fallback' },
]
