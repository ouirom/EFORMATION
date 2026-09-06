import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './env.schema';
validateEnv(process.env);

const DEFAULT_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const DEFAULT_JWT_REFRESH_SECRET = 'your-refresh-secret-key-change-in-production';

// Refuse to boot with a missing/placeholder JWT secret in any environment that
// isn't explicitly local dev/test — those values are committed in this repo's
// history, so leaving the fallback in place on any publicly reachable deployment
// (prod, staging, or anything else) would let anyone forge valid auth tokens.
// Opt-in allowlist rather than an opt-out blocklist, so an unset/misspelled
// NODE_ENV (e.g. "staging") fails closed instead of silently booting insecure.
const LOCAL_ENVS = ['development', 'test'];
if (!LOCAL_ENVS.includes(process.env.NODE_ENV || '')) {
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret === DEFAULT_JWT_SECRET || !refreshSecret || refreshSecret === DEFAULT_JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_SECRET and JWT_REFRESH_SECRET must be set to unique, non-default values when NODE_ENV is not development/test'
    );
  }
}

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',

  // Database — client selects which backend DatabaseService uses under the hood.
  // 'pg' (default): the live deployment runs on PostgreSQL via Knex. 'mssql' is kept
  // as a fallback for the native mssql/msnodesqlv8 Windows-auth driver, for SQL Server
  // instances configured Windows-Auth-only (see SERVERPROPERTY('IsIntegratedSecurityOnly'))
  // that can't use the SQL-login auth Knex's tedious-based mssql client requires.
  database: {
    client: process.env.DB_CLIENT || 'pg',
    server: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'db_eformation',
    port: parseInt(process.env.DB_PORT || '', 10) || undefined,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      enableArithAbort: true,
    },
    ssl: process.env.DB_SSL === 'true',
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // File uploads
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10), // 100MB default

  // Email
  smtp: {
    // No fallback host: an empty value lets NotificationService.getEmailConfig
    // detect "SMTP not configured" and fail fast/log, instead of silently
    // attempting a real connection to Gmail with no credentials.
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'noreply@eformation.com',
    fromName: process.env.SMTP_FROM_NAME || 'EFormation',
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '',
  },

  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },

  // Web Push
  webPush: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@eformation.com',
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },

  // Azure AD
  azureAd: {
    tenantId: process.env.AZURE_AD_TENANT_ID || '',
    clientId: process.env.AZURE_AD_CLIENT_ID || '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  // LDAP / Active Directory
  ldap: {
    url: process.env.LDAP_URL || '',
    bindDN: process.env.LDAP_BIND_DN || '',
    bindPassword: process.env.LDAP_BIND_PASSWORD || '',
    searchBase: process.env.LDAP_SEARCH_BASE || '',
    // {{username}} is replaced with the submitted login (escaped against filter injection)
    searchFilter: process.env.LDAP_SEARCH_FILTER || '(|(sAMAccountName={{username}})(mail={{username}}))',
    emailAttribute: process.env.LDAP_EMAIL_ATTRIBUTE || 'mail',
    nameAttribute: process.env.LDAP_NAME_ATTRIBUTE || 'displayName',
  },

  // LiveKit (embedded video for live sessions -- see live-session.routes.ts's
  // POST /:id/livekit-token). url is the project's wss:// endpoint (LiveKit
  // Cloud or self-hosted); apiKey/apiSecret sign the per-participant access
  // token server-side and are never sent to the client.
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },

  // Zoom
  zoom: {
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    accountId: process.env.ZOOM_ACCOUNT_ID || '',
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  // Security
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1500', 10),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3000,http://localhost:3001').split(','),

  // Default tenant for development
  defaultTenantId: parseInt(process.env.DEFAULT_TENANT_ID || '1', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Certificate
  certificateVerifyUrl: process.env.CERTIFICATE_VERIFY_URL || 'https://eformation.com/verify',

  // Error monitoring (Sentry). Unset by default -- reporting only turns on once a real
  // DSN is configured, so local dev never sends events anywhere.
  sentryDsn: process.env.SENTRY_DSN || '',
};
