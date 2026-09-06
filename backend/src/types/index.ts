// User Types
export interface User {
  id: number;
  tenantId: number;
  enterpriseId?: number;
  directionId?: number;
  serviceId?: number;
  email: string;
  username?: string;
  passwordHash?: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export type UserRole = 'super_admin' | 'admin' | 'director' | 'manager' | 'supervisor' | 'agent' | 'externe' | 'stagiaire';

// Organization Types
export interface Tenant {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface Enterprise {
  id: number;
  tenantId: number;
  name: string;
  code?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Direction {
  id: number;
  tenantId: number;
  enterpriseId: number;
  name: string;
  code?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Service {
  id: number;
  tenantId: number;
  directionId: number;
  name: string;
  code?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Course Types
export interface Course {
  id: number;
  tenantId: number;
  title: string;
  description?: string;
  audienceScope?: AudienceScope;
  prerequisites?: Prerequisites;
  isPublished: boolean;
  createdBy?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudienceScope {
  level: 'general' | 'enterprise' | 'direction' | 'service' | 'role';
  ids?: number[];
  roles?: UserRole[];
}

export interface Prerequisites {
  courseIds?: number[];
  badgeIds?: number[];
}

export interface Module {
  id: number;
  tenantId: number;
  courseId: number;
  title: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lesson {
  id: number;
  tenantId: number;
  moduleId: number;
  title: string;
  type?: string;
  position: number;
  durationMin?: number;
  isMandatory?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Content {
  id: number;
  tenantId: number;
  lessonId: number;
  type: ContentType;
  title: string;
  body?: string;
  fileId?: number;
  url?: string;
  position: number;
  createdAt: Date;
}

export type ContentType = 'pdf' | 'docx' | 'image' | 'video_mp4' | 'youtube_link' | 'text';

// Quiz Types
export interface Quiz {
  id: number;
  tenantId: number;
  lessonId: number;
  title: string;
  passingScore: number;
  randomized: boolean;
  createdAt: Date;
}

export interface Question {
  id: number;
  tenantId: number;
  quizId: number;
  type: QuestionType;
  prompt: string;
  position: number;
  createdAt: Date;
}

export type QuestionType = 'mcq' | 'true_false' | 'short_text' | 'essay';

export interface Choice {
  id: number;
  tenantId: number;
  questionId: number;
  label: string;
  isCorrect: boolean;
  position: number;
}

export interface Attempt {
  id: number;
  tenantId: number;
  quizId: number;
  userId: number;
  startedAt: Date;
  submittedAt?: Date;
  score?: number;
  status: AttemptStatus;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface Answer {
  id: number;
  tenantId: number;
  attemptId: number;
  questionId: number;
  choiceId?: number;
  textAnswer?: string;
  isCorrect?: boolean;
  points: number;
}

// Badge & Certificate Types
export interface Badge {
  id: number;
  tenantId: number;
  code: string;
  name: string;
  description?: string;
  iconFileId?: number;
  criteria: BadgeCriteria;
}

export interface BadgeCriteria {
  minScore?: number;
  quizId?: number;
  courseId?: number;
  completionRequired?: boolean;
}

export interface UserBadge {
  id: number;
  tenantId: number;
  userId: number;
  badgeId: number;
  awardedAt: Date;
}

export interface Certificate {
  id: number;
  tenantId: number;
  userId: number;
  courseId: number;
  serial: string;
  issuedAt: Date;
  pdfFileId?: number;
}

// Chat Types
export interface ChatConversation {
  id: number;
  tenantId: number;
  scope: ChatScope;
  title?: string;
  createdBy?: number;
  createdAt: Date;
}

export type ChatScope = 'direct' | 'group' | 'course' | 'module';

export interface ChatParticipant {
  conversationId: number;
  userId: number;
  role?: 'owner' | 'member';
  joinedAt: Date;
}

export interface ChatMessage {
  id: number;
  tenantId: number;
  conversationId: number;
  senderId: number;
  body?: string;
  createdAt: Date;
  deletedAt?: Date;
}

export interface ChatAttachment {
  id: number;
  tenantId: number;
  messageId: number;
  fileId: number;
}

// Live Session Types
export interface LiveSession {
  id: number;
  tenantId: number;
  courseId?: number;
  moduleId?: number;
  title: string;
  status: LiveSessionStatus;
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  organizerId?: number;
  meetingProvider?: MeetingProvider;
  meetingLink?: string;
  createdAt: Date;
}

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended' | 'canceled';
export type MeetingProvider = 'webrtc' | 'zoom' | 'teams' | 'meet';

export interface LiveParticipant {
  sessionId: number;
  userId: number;
  role?: 'host' | 'speaker' | 'attendee';
  joinedAt?: Date;
  leftAt?: Date;
}

export interface LiveRecording {
  id: number;
  tenantId: number;
  sessionId: number;
  fileId?: number;
  durationSec?: number;
  createdAt: Date;
}

export interface BreakoutRoom {
  id: number;
  tenantId: number;
  sessionId: number;
  name: string;
  createdAt: Date;
}

export interface Whiteboard {
  id: number;
  tenantId: number;
  sessionId?: number;
  data?: any;
  createdAt: Date;
  updatedAt: Date;
}

// Notification Types
export interface NotificationTemplate {
  id: number;
  tenantId: number;
  code: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
}

export type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'push_web' | 'push_mobile';

export interface NotificationPreference {
  id: number;
  tenantId: number;
  userId: number;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  pushWeb: boolean;
  pushMobile: boolean;
  updatedAt: Date;
}

export interface Notification {
  id: number;
  tenantId: number;
  userId: number;
  templateId?: number;
  payload?: Record<string, any>;
  createdAt: Date;
}

export interface NotificationDelivery {
  id: number;
  tenantId: number;
  notificationId: number;
  channel: NotificationChannel;
  status: DeliveryStatus;
  providerMsgId?: string;
  sentAt?: Date;
  error?: string;
}

export type DeliveryStatus = 'queued' | 'sent' | 'failed' | 'opened' | 'clicked';

// Blog Types
export interface BlogPost {
  id: number;
  tenantId: number;
  authorId?: number;
  title: string;
  body: string;
  status: BlogStatus;
  createdAt: Date;
  publishedAt?: Date;
}

export type BlogStatus = 'draft' | 'published';

export interface Category {
  id: number;
  tenantId: number;
  name: string;
}

export interface Tag {
  id: number;
  tenantId: number;
  name: string;
}

export interface Comment {
  id: number;
  tenantId: number;
  postId: number;
  userId?: number;
  body: string;
  createdAt: Date;
}

// AI Types
export interface AIGeneratedContent {
  id: number;
  tenantId: number;
  sourceType: AISourceType;
  sourceId?: number;
  kind: AIContentKind;
  content?: string;
  metadata?: Record<string, any>;
  createdBy?: number;
  createdAt: Date;
}

export type AISourceType = 'course' | 'module' | 'lesson' | 'video' | 'document' | 'chat';
export type AIContentKind = 'summary' | 'quiz' | 'revision_sheet' | 'title' | 'description' | 'transcript';

export interface AIRecommendation {
  id: number;
  tenantId: number;
  userId: number;
  recommendation: {
    courseIds: number[];
    reason: string;
  };
  createdAt: Date;
}

export interface LearningAnalytic {
  id: number;
  tenantId: number;
  userId?: number;
  courseId?: number;
  metric: string;
  value?: number;
  context?: Record<string, any>;
  createdAt: Date;
}

// File Types
export interface FileAsset {
  id: number;
  tenantId: number;
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes?: number;
  checksum?: string;
  createdBy?: number;
  createdAt: Date;
}

// Search Types
export interface SearchIndex {
  id: number;
  tenantId: number;
  entity: string;
  entityId: number;
  text?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Webhook & API Types
export interface WebhookSubscription {
  id: number;
  tenantId: number;
  url: string;
  event: string;
  secret?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ApiKey {
  id: number;
  tenantId: number;
  name: string;
  key: string;
  scopes?: string[];
  isActive: boolean;
  createdAt: Date;
}

// Audit Types
export interface AuditLog {
  id: number;
  tenantId: number;
  userId?: number;
  action: string;
  entity?: string;
  entityId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface PrivacyConsent {
  id: number;
  tenantId: number;
  userId: number;
  policyCode: string;
  consented: boolean;
  consentedAt: Date;
}

export interface DataRetentionPolicy {
  id: number;
  tenantId: number;
  entity: string;
  retentionDays: number;
  createdAt: Date;
}

// Evaluation Types
export interface CourseEvaluation {
  id: number;
  tenantId: number;
  courseId: number;
  userId: number;
  rating: number;
  comment?: string;
  createdAt: Date;
}

// SSO Types
export interface SSOIdentity {
  id: number;
  tenantId: number;
  userId: number;
  provider: SSOProvider;
  externalId: string;
}

export type SSOProvider = 'azure_ad' | 'google' | 'saml';

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  [key: string]: any;
}
