import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { GlobalHelp } from '@/components/GlobalHelp';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { SessionTimeoutProvider } from '@/contexts/SessionTimeoutContext';

// Layouts
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';

// Auth Pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import SSOCallbackPage from '@/pages/auth/SSOCallbackPage';

// Main Pages
import DashboardPage from '@/pages/DashboardPage';
import CoursesPage from '@/pages/CoursesPage';
import CourseDetailPage from '@/pages/CourseDetailPage';
import BadgesPage from '@/pages/BadgesPage';
import ChatPage from '@/pages/ChatPage';
import LiveSessionsPage from '@/pages/LiveSessionsPage';
import BlogPage from '@/pages/BlogPage';
import ProfilePage from '@/pages/ProfilePage';
import AITutorPage from '@/pages/AITutorPage';
import CertificatesPage from '@/pages/CertificatesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import QuizPage from '@/pages/QuizPage';
import LessonPage from '@/pages/LessonPage';
import SearchPage from '@/pages/SearchPage';
import ContentUploadPage from '@/pages/ContentUploadPage';
import MyTeamPage from '@/pages/MyTeamPage';

// Admin Pages
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminCoursesPage from '@/pages/admin/AdminCoursesPage';
import AdminCourseEditPage from '@/pages/admin/AdminCourseEditPage';
import AdminAnalyticsPage from '@/pages/admin/AdminAnalyticsPage';
import AdminAssignmentsPage from '@/pages/admin/AdminAssignmentsPage';
import AdminBadgesPage from '@/pages/admin/AdminBadgesPage';
import AdminCertificatesPage from '@/pages/admin/AdminCertificatesPage';
import AdminLiveSessionsPage from '@/pages/admin/AdminLiveSessionsPage';
import AdminNotificationsPage from '@/pages/admin/AdminNotificationsPage';
import AdminBlogPage from '@/pages/admin/AdminBlogPage';
import AdminReportsPage from '@/pages/admin/AdminReportsPage';
import AdminOrganizationPage from '@/pages/admin/AdminOrganizationPage';
import AdminImportPage from '@/pages/admin/AdminImportPage';
import AdminEmailSettingsPage from '@/pages/admin/AdminEmailSettingsPage';
import AdminLogsPage from '@/pages/admin/AdminLogsPage';
import AdminPlatformPage from '@/pages/admin/AdminPlatformPage';

// Quiz Pages
import { LessonQuizzesPage } from '@/pages/LessonQuizzesPage';
import { QuizCreatePage } from '@/pages/QuizCreatePage';
import { QuizManageQuestionsPage } from '@/pages/QuizManageQuestionsPage';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
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
        <Routes>
          {/* Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/callback/:provider" element={<SSOCallbackPage />} />
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
            <Route path="/courses/:id" element={<CourseDetailPage />} />
            <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
            <Route path="/lessons/:lessonId/quizzes" element={<LessonQuizzesPage />} />
            <Route path="/lessons/:lessonId/quiz/create" element={<QuizCreatePage />} />
            <Route path="/quizzes/:quizId" element={<QuizPage />} />
            <Route path="/quizzes/:quizId/manage-questions" element={<QuizManageQuestionsPage />} />
            <Route path="/badges" element={<BadgesPage />} />
            <Route path="/certificates" element={<CertificatesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/live" element={<LiveSessionsPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/profile" element={<ProfilePage />} />
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
            <Route path="badges" element={<AdminBadgesPage />} />
            <Route path="certificates" element={<AdminCertificatesPage />} />
            <Route path="live-sessions" element={<AdminLiveSessionsPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="blog" element={<AdminBlogPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="organization" element={<AdminOrganizationPage />} />
            <Route path="import" element={<AdminImportPage />} />
            <Route path="email-settings" element={<AdminEmailSettingsPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="platform" element={<AdminPlatformPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster />
        <GlobalHelp />
      </SessionTimeoutProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
