import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { GlobalHelp } from '@/components/GlobalHelp';
import { PageLoading } from '@/components/ui/loading';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { SessionTimeoutProvider } from '@/contexts/SessionTimeoutContext';

// Layouts
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';

// Auth Pages -- kept eager: small, and needed immediately for unauthenticated users
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ExternalLoginPage from '@/pages/auth/ExternalLoginPage';
import ExternalRegisterPage from '@/pages/auth/ExternalRegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import NotMePage from '@/pages/auth/NotMePage';
import { FeatureGate } from '@/components/FeatureGate';
import SSOCallbackPage from '@/pages/auth/SSOCallbackPage'
const VerifyCertificatePage = lazy(() => import('@/pages/auth/VerifyCertificatePage'));

// Main Pages -- lazy: each becomes its own chunk, only fetched when visited
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const CoursesPage = lazy(() => import('@/pages/CoursesPage'));
const LessonsPage = lazy(() => import('@/pages/LessonsPage'));
const CourseDetailPage = lazy(() => import('@/pages/CourseDetailPage'));
const BadgesPage = lazy(() => import('@/pages/BadgesPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const LiveSessionsPage = lazy(() => import('@/pages/LiveSessionsPage'));
const LiveSessionDetailPage = lazy(() => import('@/pages/LiveSessionDetailPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AITutorPage = lazy(() => import('@/pages/AITutorPage'));
const CertificatesPage = lazy(() => import('@/pages/CertificatesPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const QuizPage = lazy(() => import('@/pages/QuizPage'));
const LessonPage = lazy(() => import('@/pages/LessonPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const ContentUploadPage = lazy(() => import('@/pages/ContentUploadPage'));
const MyTeamPage = lazy(() => import('@/pages/MyTeamPage'));

// Admin Pages -- lazy: never fetched by learners, who never hit these routes
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminCoursesPage = lazy(() => import('@/pages/admin/AdminCoursesPage'));
const AdminCourseEditPage = lazy(() => import('@/pages/admin/AdminCourseEditPage'));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage'));
const AdminAssignmentsPage = lazy(() => import('@/pages/admin/AdminAssignmentsPage'));
const AdminTeamsPage = lazy(() => import('@/pages/admin/AdminTeamsPage'));
const AdminBadgesPage = lazy(() => import('@/pages/admin/AdminBadgesPage'));
const AdminCertificatesPage = lazy(() => import('@/pages/admin/AdminCertificatesPage'));
const AdminLiveSessionsPage = lazy(() => import('@/pages/admin/AdminLiveSessionsPage'));
const AdminNotificationsPage = lazy(() => import('@/pages/admin/AdminNotificationsPage'));
const AdminEmailQueuePage = lazy(() => import('@/pages/admin/AdminEmailQueuePage'));
const AdminBlogPage = lazy(() => import('@/pages/admin/AdminBlogPage'));
const AdminReportsPage = lazy(() => import('@/pages/admin/AdminReportsPage'));
const AdminOrganizationPage = lazy(() => import('@/pages/admin/AdminOrganizationPage'));
const AdminImportPage = lazy(() => import('@/pages/admin/AdminImportPage'));
const AdminEmailSettingsPage = lazy(() => import('@/pages/admin/AdminEmailSettingsPage'));
const AdminSsoSettingsPage = lazy(() => import('@/pages/admin/AdminSsoSettingsPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const AdminLiveKitSettingsPage = lazy(() => import('@/pages/admin/AdminLiveKitSettingsPage'));
const AdminRecordingSettingsPage = lazy(() => import('@/pages/admin/AdminRecordingSettingsPage'));
const AdminLogsPage = lazy(() => import('@/pages/admin/AdminLogsPage'));
const AdminConnectionsPage = lazy(() => import('@/pages/admin/AdminConnectionsPage'));
const AdminPlatformPage = lazy(() => import('@/pages/admin/AdminPlatformPage'));

// Quiz Pages (named exports)
const LessonQuizzesPage = lazy(() => import('@/pages/LessonQuizzesPage').then((m) => ({ default: m.LessonQuizzesPage })));
const QuizCreatePage = lazy(() => import('@/pages/QuizCreatePage').then((m) => ({ default: m.QuizCreatePage })));
const QuizManageQuestionsPage = lazy(() => import('@/pages/QuizManageQuestionsPage').then((m) => ({ default: m.QuizManageQuestionsPage })));

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // So the next successful login lands back on the page the user originally
    // requested (e.g. an email notification link) instead of the dashboard --
    // read by AuthContext's applySession(), same convention as api.ts's 401
    // interceptor and MainLayout's idle-timeout handler.
    sessionStorage.setItem('postLoginRedirect', location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
      <SessionTimeoutProvider>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Login has its own full-page two-column layout, not the shared AuthLayout */}
          <Route path="/login" element={<LoginPage />} />
          {/* External participants (role 'externe') have their own sign-in and access request */}
          <Route path="/external/login" element={<ExternalLoginPage />} />
          <Route path="/external/register" element={<ExternalRegisterPage />} />

          {/* Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/security/not-me" element={<NotMePage />} />
            <Route path="/auth/callback/:provider" element={<SSOCallbackPage />} />
            <Route path="/verify-certificate/:serial" element={<VerifyCertificatePage />} />
            <Route path="/legal" element={<LegalPage />} />
          </Route>

          {/* Main App Routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/lessons" element={<LessonsPage />} />
            <Route path="/courses/:id" element={<CourseDetailPage />} />
            <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
            <Route path="/lessons/:lessonId/quizzes" element={<LessonQuizzesPage />} />
            <Route path="/lessons/:lessonId/quiz/create" element={<QuizCreatePage />} />
            <Route path="/quizzes/:quizId" element={<QuizPage />} />
            <Route path="/quizzes/:quizId/manage-questions" element={<QuizManageQuestionsPage />} />
            <Route path="/badges" element={<FeatureGate feature="badges"><BadgesPage /></FeatureGate>} />
            <Route path="/certificates" element={<CertificatesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/chat" element={<FeatureGate feature="chat"><ChatPage /></FeatureGate>} />
            <Route path="/chat/:conversationId" element={<FeatureGate feature="chat"><ChatPage /></FeatureGate>} />
            <Route path="/live" element={<FeatureGate feature="liveSessions"><LiveSessionsPage /></FeatureGate>} />
            <Route path="/live/:id" element={<FeatureGate feature="liveSessions"><LiveSessionDetailPage /></FeatureGate>} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:id" element={<BlogPostPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/ai-tutor" element={<AITutorPage />} />
            <Route path="/content-upload" element={<ContentUploadPage />} />
            <Route path="/my-team" element={<MyTeamPage />} />
          </Route>

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['super_admin', 'admin', 'director', 'manager']}>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminAnalyticsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="courses/:id/edit" element={<AdminCourseEditPage />} />
            <Route path="assignments" element={<AdminAssignmentsPage />} />
            <Route path="teams" element={<AdminTeamsPage />} />
            <Route path="badges" element={<AdminBadgesPage />} />
            <Route path="certificates" element={<AdminCertificatesPage />} />
            <Route path="live-sessions" element={<FeatureGate feature="liveSessions"><AdminLiveSessionsPage /></FeatureGate>} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="email-queue" element={<AdminEmailQueuePage />} />
            <Route path="blog" element={<AdminBlogPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="organization" element={<AdminOrganizationPage />} />
            <Route path="import" element={<AdminImportPage />} />
            <Route path="email-settings" element={<AdminEmailSettingsPage />} />
            <Route path="sso-settings" element={<AdminSsoSettingsPage />} />
            <Route path="livekit-settings" element={<AdminLiveKitSettingsPage />} />
            <Route path="recording-settings" element={<AdminRecordingSettingsPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="connections" element={<ProtectedRoute roles={['super_admin', 'admin']}><AdminConnectionsPage /></ProtectedRoute>} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="platform" element={<AdminPlatformPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
        <Toaster />
        <GlobalHelp />
      </SessionTimeoutProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
