import axios, { AxiosInstance } from 'axios';

// Utilise le proxy Vite (chemin relatif) pour éviter les problèmes CORS
// En prod, définir VITE_API_URL=https://api.example.com/api/v1
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Extended API type with custom namespaces
interface ExtendedAPI extends AxiosInstance {
  courses: {
    list: (params?: any) => Promise<any>;
    get: (id: number) => Promise<any>;
    getCategories: () => Promise<any[]>;
    createCategory: (name: string) => Promise<any>;
    updateCategory: (code: string, name: string | null) => Promise<any>;
    deleteCategory: (code: string) => Promise<any>;
    enroll: (courseId: number) => Promise<any>;
    getMyEnrollments: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    publish: (id: number) => Promise<any>;
    unpublish: (id: number) => Promise<any>;
    clone: (id: number) => Promise<any>;
  };
  chat: {
    getConversations: () => Promise<any[]>;
    getConversation: (id: number | string) => Promise<any>;
    getMessages: (conversationId: number, params?: any) => Promise<any[]>;
    sendMessage: (conversationId: number, body: string, attachmentIds?: number[], replyToMessageId?: number) => Promise<any>;
    deleteMessage: (messageId: number) => Promise<any>;
    createConversation: (scope: string, participantIds: number[], title?: string) => Promise<any>;
  };
  analytics: {
    getDashboard: () => Promise<any>;
    getAdminDashboard: (timeRange?: string) => Promise<any>;
    getLeaderboard: (limit?: number) => Promise<any[]>;
    getMyCourses: () => Promise<any[]>;
  };
  notifications: {
    list: (params?: any) => Promise<any[]>;
    markRead: (id: number) => Promise<any>;
  };
  lessons: {
    catalog: (params?: { status?: string; courseId?: number; mandatory?: boolean; page?: number; limit?: number }) => Promise<{ data: any[]; meta: any }>;
  };
  favorites: {
    list: () => Promise<any[]>;
    add: (type: 'course' | 'lesson', id: number) => Promise<any>;
    remove: (type: 'course' | 'lesson', id: number) => Promise<any>;
  };
  liveSessions: {
    list: (params?: any) => Promise<any[]>;
    get: (id: number) => Promise<any>;
    join: (id: number) => Promise<any>;
    getLivekitToken: (id: number) => Promise<{ token: string; url: string; roomName: string }>;
    startRecording: (id: number) => Promise<any>;
    stopRecording: (id: number) => Promise<any>;
  };
  badges: {
    list: () => Promise<any[]>;
    getUserBadges: () => Promise<any[]>;
  };
  blog: {
    getPosts: (params?: any) => Promise<any>;
    getPost: (id: number) => Promise<any>;
    createPost: (data: any) => Promise<any>;
    updatePost: (id: number, data: any) => Promise<any>;
    deletePost: (id: number) => Promise<any>;
    getCategories: () => Promise<any[]>;
    createCategory: (name: string) => Promise<any>;
    getTags: () => Promise<any[]>;
    createTag: (name: string) => Promise<any>;
    getComments: (postId: number) => Promise<any[]>;
    addComment: (postId: number, body: string, parentId?: number) => Promise<any>;
    deleteComment: (commentId: number) => Promise<any>;
  };
  ai: {
    askTutor: (question: string, context?: any) => Promise<any>;
    getRecommendations: () => Promise<any[]>;
  };
  users: {
    search: (query: string) => Promise<any[]>;
    list: (params?: any) => Promise<any>;
    get: (id: number) => Promise<any>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  jobTitles: {
    list: () => Promise<any[]>;
    create: (label: string) => Promise<any>;
    update: (id: number, label: string) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  organizations: {
    getEnterprises: () => Promise<any[]>;
    getDirections: (enterpriseId?: number) => Promise<any[]>;
    getServices: (directionId?: number) => Promise<any[]>;
    getCurrent: () => Promise<any>;
    updateCurrent: (data: any) => Promise<any>;
    updateCurrentSettings: (data: any) => Promise<any>;
  };
  settings: {
    getEmail: () => Promise<any>;
    updateEmail: (data: any) => Promise<any>;
    testEmail: (to: string) => Promise<any>;
    getLiveKit: () => Promise<any>;
    updateLiveKit: (data: any) => Promise<any>;
    testLiveKit: () => Promise<any>;
    getRecordingStorage: () => Promise<any>;
    updateRecordingStorage: (data: any) => Promise<any>;
    getInactivityPolicies: () => Promise<any[]>;
    setInactivityPolicy: (role: string, maxInactiveDays: number | null) => Promise<any>;
  };
  logs: {
    list: (params?: any) => Promise<any>;
    getActions: () => Promise<{ actions: string[]; entities: string[] }>;
    export: (params?: any) => Promise<Blob>;
    training: (params?: any) => Promise<any>;
    trainingExport: (params?: any) => Promise<Blob>;
  };
  teams: {
    list: () => Promise<any[]>;
    get: (id: number) => Promise<any>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  assignments: {
    list: (courseId?: number) => Promise<any[]>;
    create: (data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    getUsers: (search?: string) => Promise<any[]>;
    getMyCourses: () => Promise<any[]>;
  };
  attempts: {
    getByUser: (userId?: number) => Promise<any[]>;
    get: (id: number) => Promise<any>;
    start: (quizId: number) => Promise<any>;
    submit: (attemptId: number) => Promise<any>;
    answerQuestion: (attemptId: number, questionId: number, answer: any) => Promise<any>;
  };
  files: {
    upload: (file: File, folder?: string) => Promise<any>;
    uploadMultiple: (files: File[], folder?: string) => Promise<any>;
    list: (params?: any) => Promise<any>;
    get: (id: number) => Promise<any>;
    delete: (id: number) => Promise<any>;
    download: (id: number) => Promise<any>;
  };
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // FIX: casse corrigée pour correspondre au middleware tenant backend
    'X-Tenant-Id': '1',
  },
  withCredentials: true,
}) as ExtendedAPI;

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Shared by the reactive 401 handler below and the proactive refresh triggered by
// user activity (useIdleTimeout) — a single in-flight promise so concurrent callers
// (e.g. several requests 401ing at once, or activity firing mid-request) reuse the
// same refresh instead of racing multiple /auth/refresh calls.
let refreshInFlight: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token');
    }

    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
    });

    // FIX: certains backends enveloppent dans data.data, d'autres non
    const newToken =
      response.data?.data?.accessToken ?? response.data?.accessToken;
    if (!newToken) throw new Error('No access token in refresh response');

    localStorage.setItem('accessToken', newToken);
    setAuthToken(newToken);
    return newToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Ne pas boucler sur /auth/refresh lui-même
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // So the next successful login lands back where the user was — read by
        // AuthContext's applySession(). This is a hard redirect (not React Router),
        // so window.location is still the current page's path at this point.
        sessionStorage.setItem('postLoginRedirect', window.location.pathname + window.location.search);
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export function setAuthToken(token: string) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function clearAuthToken() {
  delete api.defaults.headers.common['Authorization'];
}

// API helper functions
api.courses = {
  list: (params?: any) => api.get('/courses', { params }).then(r => r.data.data),
  get: (id: number) => api.get(`/courses/${id}`).then(r => r.data.data),
  getCategories: () => api.get('/courses/categories').then(r => r.data.data || []),
  createCategory: (name: string) => api.post('/courses/categories', { name }).then(r => r.data.data),
  updateCategory: (code: string, name: string | null) => api.put(`/courses/categories/${encodeURIComponent(code)}`, { name }).then(r => r.data.data),
  deleteCategory: (code: string) => api.delete(`/courses/categories/${encodeURIComponent(code)}`).then(r => r.data),
  enroll: (courseId: number) => api.post('/enrollments', { courseId }).then(r => r.data.data),
  getMyEnrollments: () => api.get('/enrollments/my').then(r => r.data.data || []),
  create: (data: any) => api.post('/courses', data).then(r => r.data.data),
  update: (id: number, data: any) => api.put(`/courses/${id}`, data).then(r => r.data.data),
  delete: (id: number) => api.delete(`/courses/${id}`).then(r => r.data),
  publish: (id: number) => api.post(`/courses/${id}/publish`).then(r => r.data.data),
  unpublish: (id: number) => api.post(`/courses/${id}/unpublish`).then(r => r.data.data),
  clone: (id: number) => api.post(`/courses/${id}/clone`).then(r => r.data.data),
};

api.chat = {
  getConversations: () => api.get('/chat/conversations').then(r => r.data.data || []),
  getConversation: (id: number | string) => api.get(`/chat/conversations/${id}`).then(r => r.data.data),
  getMessages: (conversationId: number, params?: any) => 
    api.get(`/chat/conversations/${conversationId}/messages`, { params }).then(r => r.data.data || []),
  sendMessage: (conversationId: number, body: string, attachmentIds?: number[], replyToMessageId?: number) =>
    api.post(`/chat/conversations/${conversationId}/messages`, { body, attachmentIds, replyToMessageId }).then(r => r.data.data),
  deleteMessage: (messageId: number) =>
    api.delete(`/chat/messages/${messageId}`).then(r => r.data),
  createConversation: (scope: string, participantIds: number[], title?: string) =>
    api.post('/chat/conversations', { scope, participantIds, title }).then(r => r.data.data),
};

api.analytics = {
  getDashboard: () => api.get('/analytics/my-stats').then(r => r.data.data),
  getAdminDashboard: (timeRange?: string) => api.get('/analytics/dashboard', { params: { timeRange } }).then(r => r.data.data),
  getLeaderboard: (limit?: number) => api.get('/analytics/leaderboard', { params: { limit } }).then(r => r.data.data || []),
  getMyCourses: () => api.get('/analytics/my-courses').then(r => r.data.data || []),
};

api.notifications = {
  list: (params?: any) => api.get('/notifications', { params }).then(r => r.data.data || []),
  markRead: (id: number) => api.put(`/notifications/${id}/read`).then(r => r.data),
};

api.lessons = {
  catalog: (params?: { status?: string; courseId?: number; page?: number; limit?: number }) =>
    api.get('/lessons/catalog', { params }).then(r => ({ data: r.data.data || [], meta: r.data.meta })),
};

api.favorites = {
  list: () => api.get('/favorites').then(r => r.data.data || []),
  add: (type: 'course' | 'lesson', id: number) => api.post('/favorites', { type, id }).then(r => r.data),
  remove: (type: 'course' | 'lesson', id: number) => api.delete(`/favorites/${type}/${id}`).then(r => r.data),
};

api.liveSessions = {
  list: (params?: any) => api.get('/live-sessions', { params }).then(r => r.data.data || []),
  get: (id: number) => api.get(`/live-sessions/${id}`).then(r => r.data.data),
  join: (id: number) => api.post(`/live-sessions/${id}/join`).then(r => r.data.data),
  getLivekitToken: (id: number) => api.post(`/live-sessions/${id}/livekit-token`).then(r => r.data.data),
  startRecording: (id: number) => api.post(`/live-sessions/${id}/recording/start`).then(r => r.data.data),
  stopRecording: (id: number) => api.post(`/live-sessions/${id}/recording/stop`).then(r => r.data),
};

api.badges = {
  list: () => api.get('/badges').then(r => r.data.data || []),
  getUserBadges: () => api.get('/users/me/badges').then(r => r.data.data || []),
};

api.blog = {
  getPosts: (params?: any) => api.get('/blog/posts', { params }).then(r => ({ data: r.data.data || [], meta: r.data.meta })),
  getPost: (id: number) => api.get(`/blog/posts/${id}`).then(r => r.data.data),
  createPost: (data: any) => api.post('/blog/posts', data).then(r => r.data.data),
  updatePost: (id: number, data: any) => api.put(`/blog/posts/${id}`, data).then(r => r.data.data),
  deletePost: (id: number) => api.delete(`/blog/posts/${id}`).then(r => r.data),
  getCategories: () => api.get('/blog/categories').then(r => r.data.data || []),
  createCategory: (name: string) => api.post('/blog/categories', { name }).then(r => r.data.data),
  getTags: () => api.get('/blog/tags').then(r => r.data.data || []),
  createTag: (name: string) => api.post('/blog/tags', { name }).then(r => r.data.data),
  getComments: (postId: number) => api.get(`/blog/posts/${postId}/comments`).then(r => r.data.data || []),
  addComment: (postId: number, body: string, parentId?: number) =>
    api.post(`/blog/posts/${postId}/comments`, { body, parentId }).then(r => r.data.data),
  deleteComment: (commentId: number) => api.delete(`/blog/comments/${commentId}`).then(r => r.data),
};

api.ai = {
  askTutor: (question: string, context?: any) => 
    api.post('/ai/tutor/ask', { question, ...context }).then(r => r.data.data),
  getRecommendations: () => api.get('/ai/recommendations/courses').then(r => r.data.data || []),
};

api.users = {
  search: (query: string) => api.get('/users/search', { params: { q: query } }).then(r => r.data.data || []),
  list: (params?: any) => api.get('/users', { params }).then(r => r.data),
  get: (id: number) => api.get(`/users/${id}`).then(r => r.data.data),
  create: (data: any) => api.post('/users', data).then(r => r.data.data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data).then(r => r.data.data),
  delete: (id: number) => api.delete(`/users/${id}`).then(r => r.data),
};

api.jobTitles = {
  list: () => api.get('/job-titles').then(r => r.data.data || []),
  create: (label: string) => api.post('/job-titles', { label }).then(r => r.data.data),
  update: (id: number, label: string) => api.put(`/job-titles/${id}`, { label }).then(r => r.data.data),
  delete: (id: number) => api.delete(`/job-titles/${id}`).then(r => r.data),
};

api.organizations = {
  getEnterprises: () => api.get('/organizations/enterprises').then(r => r.data.data || []),
  getDirections: (enterpriseId?: number) =>
    api.get('/organizations/directions', { params: enterpriseId ? { enterpriseId } : {} }).then(r => r.data.data || []),
  getServices: (directionId?: number) =>
    api.get('/organizations/services', { params: directionId ? { directionId } : {} }).then(r => r.data.data || []),
  getCurrent: () => api.get('/organizations/current').then(r => r.data.data),
  updateCurrent: (data: any) => api.put('/organizations/current', data).then(r => r.data),
  updateCurrentSettings: (data: any) => api.put('/organizations/current/settings', data).then(r => r.data),
};

api.settings = {
  getEmail: () => api.get('/settings/email').then(r => r.data.data),
  updateEmail: (data: any) => api.put('/settings/email', data).then(r => r.data),
  testEmail: (to: string) => api.post('/settings/email/test', { to }).then(r => r.data),
  getLiveKit: () => api.get('/settings/livekit').then(r => r.data.data),
  updateLiveKit: (data: any) => api.put('/settings/livekit', data).then(r => r.data),
  testLiveKit: () => api.post('/settings/livekit/test').then(r => r.data),
  getRecordingStorage: () => api.get('/settings/recording-storage').then(r => r.data.data),
  updateRecordingStorage: (data: any) => api.put('/settings/recording-storage', data).then(r => r.data),
  getInactivityPolicies: () => api.get('/settings/inactivity-policies').then(r => r.data.data),
  setInactivityPolicy: (role: string, maxInactiveDays: number | null) =>
    api.put('/settings/inactivity-policies', { role, maxInactiveDays }).then(r => r.data),
};

api.logs = {
  list: (params?: any) => api.get('/logs', { params }).then(r => r.data),
  getActions: () => api.get('/logs/actions').then(r => r.data.data),
  export: (params?: any) => api.get('/logs/export', { params, responseType: 'blob' }).then(r => r.data),
  training: (params?: any) => api.get('/logs/training', { params }).then(r => r.data),
  trainingExport: (params?: any) => api.get('/logs/training/export', { params, responseType: 'blob' }).then(r => r.data),
};

api.teams = {
  list: () => api.get('/teams').then(r => r.data.data || []),
  get: (id: number) => api.get(`/teams/${id}`).then(r => r.data.data),
  create: (data: any) => api.post('/teams', data).then(r => r.data.data),
  update: (id: number, data: any) => api.put(`/teams/${id}`, data).then(r => r.data.data),
  delete: (id: number) => api.delete(`/teams/${id}`).then(r => r.data),
};

api.assignments = {
  list: (courseId?: number) => api.get('/assignments', { params: courseId ? { courseId } : {} }).then(r => r.data.data || []),
  create: (data: any) => api.post('/assignments', data).then(r => r.data),
  delete: (id: number) => api.delete(`/assignments/${id}`).then(r => r.data),
  getUsers: (search?: string) => api.get('/assignments/users', { params: search ? { search } : {} }).then(r => r.data.data || []),
  getMyCourses: () => api.get('/assignments/my-courses').then(r => r.data.data || []),
};

api.attempts = {
  getByUser: (userId?: number) => {
    const endpoint = userId ? `/attempts/user/${userId}` : '/attempts/user/me';
    return api.get(endpoint).then(r => r.data.data || []);
  },
  get: (id: number) => api.get(`/attempts/${id}`).then(r => r.data.data),
  start: (quizId: number) => api.post('/attempts/start', { quizId }).then(r => r.data.data),
  submit: (attemptId: number) => api.post(`/attempts/${attemptId}/submit`).then(r => r.data.data),
  answerQuestion: (attemptId: number, questionId: number, answer: any) => 
    api.post(`/attempts/${attemptId}/answer`, { questionId, ...answer }).then(r => r.data.data),
};

api.files = {
  upload: (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) formData.append('folder', folder);
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },
  uploadMultiple: (files: File[], folder?: string) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (folder) formData.append('folder', folder);
    return api.post('/files/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },
  list: (params?: any) => api.get('/files', { params }).then(r => r.data.data || []),
  get: (id: number) => api.get(`/files/${id}`).then(r => r.data.data),
  delete: (id: number) => api.delete(`/files/${id}`).then(r => r.data),
  download: (id: number) => api.get(`/files/${id}/download`, { responseType: 'blob' }).then(r => r.data),
};

export const apiHelpers = {
  // Courses
  getCourses: (params?: any) => api.get('/courses', { params }),
  getCourse: (id: number) => api.get(`/courses/${id}`),
  enrollCourse: (courseId: number) => api.post('/enrollments', { courseId }),
  
  // Lessons
  getLesson: (lessonId: number) => api.get(`/lessons/${lessonId}`),
  completeLesson: (lessonId: number) => api.post(`/lessons/${lessonId}/complete`),
  
  // Quizzes
  getQuiz: (quizId: number) => api.get(`/quizzes/${quizId}`),
  startQuizAttempt: (quizId: number) => api.post(`/attempts/start`, { quizId }),
  submitAnswer: (attemptId: number, questionId: number, answer: any) => 
    api.post(`/attempts/${attemptId}/answer`, { questionId, ...answer }),
  submitQuiz: (attemptId: number) => api.post(`/attempts/${attemptId}/submit`),
  
  // User
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: any) => api.put('/users/me', data),
  getMyProgress: () => api.get('/users/me/progress'),
  getMyBadges: () => api.get('/users/me/badges'),
  getMyCertificates: () => api.get('/users/me/certificates'),
  
  // Notifications
  getNotifications: (params?: any) => api.get('/notifications', { params }),
  markNotificationRead: (id: number) => api.put(`/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put('/notifications/read-all'),
  
  // Chat
  getConversations: () => api.get('/chat/conversations'),
  getConversation: (id: number) => api.get(`/chat/conversations/${id}`),
  getMessages: (conversationId: number, params?: any) => 
    api.get(`/chat/conversations/${conversationId}/messages`, { params }),
  sendMessage: (conversationId: number, body: string, attachmentIds?: number[]) =>
    api.post(`/chat/conversations/${conversationId}/messages`, { body, attachmentIds }),
  createConversation: (scope: string, participantIds: number[], title?: string) =>
    api.post('/chat/conversations', { scope, participantIds, title }),
  
  // Live Sessions
  getLiveSessions: (params?: any) => api.get('/live-sessions', { params }),
  getLiveSession: (id: number) => api.get(`/live-sessions/${id}`),
  joinLiveSession: (id: number) => api.post(`/live-sessions/${id}/join`),
  leaveLiveSession: (id: number) => api.post(`/live-sessions/${id}/leave`),
  
  // Blog
  getBlogPosts: (params?: any) => api.get('/blog/posts', { params }),
  getBlogPost: (id: number) => api.get(`/blog/posts/${id}`),
  getBlogCategories: () => api.get('/blog/categories'),
  addComment: (postId: number, body: string, parentId?: number) =>
    api.post(`/blog/posts/${postId}/comments`, { body, parentId }),
  
  // Search
  search: (q: string, types?: string[]) => 
    api.get('/search', { params: { q, types: types?.join(',') } }),
  
  // Files
  uploadFile: (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) formData.append('folder', folder);
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  // AI
  askTutor: (question: string, courseId?: number, lessonId?: number) =>
    api.post('/ai/tutor/ask', { question, courseId, lessonId }),
  getRecommendations: () => api.get('/ai/recommendations/courses'),
  
  // Analytics (Admin)
  getDashboardAnalytics: (timeRange?: string) => 
    api.get('/analytics/dashboard', { params: { timeRange } }),
  
  // Reports (Admin)
  generateReport: (reportType: string, format: string, filters?: any) =>
    api.post('/reports/generate', { reportType, format, ...filters }, {
      responseType: format !== 'json' ? 'blob' : 'json',
    }),
};

export default api;
