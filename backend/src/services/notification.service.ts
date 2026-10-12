import nodemailer from 'nodemailer';
import twilio from 'twilio';
import webPush from 'web-push';
import admin from 'firebase-admin';
import { config } from '../config';
import { DatabaseService } from './database.service';
import { db, IS_PG } from '../database/db-helpers';
import { logger } from '../utils/logger';
import { TenantSettingsService } from './tenant-settings.service';

interface NotificationPayload {
  tenantId: number;
  userId: number;
  channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app';
  subject?: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  /**
   * Account and security messages (account created/activated/suspended, password
   * reset...) that must go out even when the organization turned notifications off
   * in Administration > Organisation.
   */
  essential?: boolean;
}

interface NotificationResult {
  id: number;
  status: 'sent' | 'failed' | 'pending' | 'skipped';
  channel: string;
  externalId?: string;
}

interface ResolvedEmailConfig {
  transporter: nodemailer.Transporter;
  from: string;
}

interface TenantBranding {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

// Per-tenant SMTP transporters, built from DB settings (or env fallback) and cached until invalidated.
const emailTransporterCache = new Map<number, ResolvedEmailConfig | null>();

// Twilio client for SMS and WhatsApp
const twilioClient = config.twilio.accountSid && config.twilio.authToken
  ? twilio(config.twilio.accountSid, config.twilio.authToken)
  : null;

// Configure web-push for VAPID (only if keys are configured)
if (config.webPush?.publicKey && config.webPush?.privateKey) {
  try {
    webPush.setVapidDetails(
      config.webPush.subject || 'mailto:admin@eformation.com',
      config.webPush.publicKey,
      config.webPush.privateKey
    );
  } catch (error) {
    logger.warn('VAPID configuration failed', { error });
  }
}

// Initialize Firebase Admin for FCM
let firebaseApp: admin.app.App | null = null;
if (config.firebase?.projectId && config.firebase?.clientEmail && config.firebase?.privateKey) {
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
  } catch (error) {
    logger.warn('Firebase initialization failed', { error });
  }
}

export class NotificationService {
  /**
   * Send a notification through the specified channel
   */
  static async send(payload: NotificationPayload): Promise<NotificationResult> {
    const { tenantId, userId, channel, subject, body, actionUrl, metadata } = payload;

    if (!payload.essential && !(await TenantSettingsService.get(tenantId)).enableNotifications) {
      logger.info('Notification skipped: notifications are disabled for this organization', { tenantId, userId, channel });
      return { id: 0, status: 'skipped', channel };
    }

    // Check user preferences
    const preferences = await this.getUserPreferences(userId);
    const channelEnabled = this.isChannelEnabled(preferences, channel);

    if (!channelEnabled) {
      logger.info('Notification channel disabled by user preferences', { userId, channel });
      return { id: 0, status: 'pending', channel };
    }

    // Get user info
    const users = await DatabaseService.query<any>(
      'SELECT email, phone FROM users WHERE id = @userId',
      { userId }
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Create notification record
    const result = await DatabaseService.query<{ id: number }>(
      IS_PG
        ? `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, action_url, metadata)
           VALUES (@tenantId, @userId, @channel, @subject, @body, @actionUrl, @metadata)
           RETURNING id`
        : `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, action_url, metadata)
           OUTPUT INSERTED.id
           VALUES (@tenantId, @userId, @channel, @subject, @body, @actionUrl, @metadata)`,
      {
        tenantId,
        userId,
        channel,
        subject: subject || null,
        body,
        actionUrl: actionUrl || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      }
    );

    const notificationId = result[0].id;

    try {
      let externalId: string | undefined;

      switch (channel) {
        case 'email':
          externalId = await this.sendEmail(tenantId, user.email, subject || 'Notification', body, actionUrl);
          break;
        case 'sms':
          externalId = await this.sendSMS(user.phone, body);
          break;
        case 'whatsapp':
          externalId = await this.sendWhatsApp(user.phone, body);
          break;
        case 'push':
          await this.sendPush(userId, subject || 'Notification', body, actionUrl);
          break;
        case 'in_app':
          // Already created in database
          break;
      }

      // Update status to sent -- externalId is undefined for in_app/push (no external
      // provider involved), and Knex's raw query binding rejects undefined outright
      // (must be null for SQL NULL), which was making every in_app/push send fail here.
      await DatabaseService.execute(
        `UPDATE notifications SET sent_at = ${db.now()}, external_id = @externalId WHERE id = @id`,
        { id: notificationId, externalId: externalId ?? null }
      );

      return { id: notificationId, status: 'sent', channel, externalId };
    } catch (error) {
      logger.error('Failed to send notification', { notificationId, channel, error });

      await DatabaseService.execute(
        `UPDATE notifications SET failed_at = ${db.now()}, error_message = @error WHERE id = @id`,
        { id: notificationId, error: (error as Error).message }
      );

      return { id: notificationId, status: 'failed', channel };
    }
  }

  /**
   * Resolve the SMTP transporter for a tenant: its own configured settings if
   * present and enabled, otherwise the env-configured defaults. Cached per
   * tenant until invalidateEmailSettingsCache() is called.
   */
  private static async getEmailConfig(tenantId: number): Promise<ResolvedEmailConfig | null> {
    if (emailTransporterCache.has(tenantId)) {
      return emailTransporterCache.get(tenantId)!;
    }

    const rows = await DatabaseService.query<any>(
      'SELECT * FROM email_settings WHERE tenant_id = @tenantId',
      { tenantId }
    );
    const settings = rows[0];

    let resolved: ResolvedEmailConfig | null = null;

    if (settings?.enabled && settings.smtp_host) {
      resolved = {
        transporter: nodemailer.createTransport({
          host: settings.smtp_host,
          port: settings.smtp_port,
          secure: !!settings.smtp_secure,
          auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_password } : undefined,
        }),
        from: settings.from_name
          ? `"${settings.from_name}" <${settings.from_email || settings.smtp_user}>`
          : settings.from_email || settings.smtp_user,
      };
    } else if (config.smtp.host) {
      resolved = {
        transporter: nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
        }),
        from: `"${config.smtp.fromName}" <${config.smtp.from}>`,
      };
    }

    emailTransporterCache.set(tenantId, resolved);
    return resolved;
  }

  /**
   * Drop the cached transporter for a tenant so the next send re-reads its settings from the DB.
   */
  static invalidateEmailSettingsCache(tenantId: number): void {
    emailTransporterCache.delete(tenantId);
  }

  /**
   * Resolve the tenant's display name, logo and colors for use in outgoing emails.
   * Falls back to the app's default navy/blue look when the tenant hasn't
   * configured tenant_settings yet (row may not exist until an admin edits it).
   */
  private static async getTenantBranding(tenantId: number): Promise<TenantBranding> {
    const rows = await DatabaseService.query<any>(
      `SELECT t.name AS tenant_name, ts.logo_url, ts.primary_color, ts.secondary_color
       FROM tenants t
       LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
       WHERE t.id = @tenantId`,
      { tenantId }
    );
    const row = rows[0];
    return {
      name: row?.tenant_name || 'E-Formation',
      logoUrl: row?.logo_url || null,
      primaryColor: row?.primary_color || '#1a365d',
      secondaryColor: row?.secondary_color || '#3182ce',
    };
  }

  /**
   * Send email notification
   */
  private static async sendEmail(
    tenantId: number,
    to: string,
    subject: string,
    body: string,
    actionUrl?: string
  ): Promise<string> {
    const branding = await this.getTenantBranding(tenantId);
    const htmlBody = this.generateEmailHTML(subject, body, branding, actionUrl);

    const emailConfig = await this.getEmailConfig(tenantId);
    if (!emailConfig) {
      throw new Error('Email transporter not configured');
    }

    const info = await emailConfig.transporter.sendMail({
      from: emailConfig.from,
      to,
      subject,
      text: body,
      html: htmlBody,
    });

    return info.messageId;
  }

  /**
   * Send a test email to verify the tenant's SMTP settings work.
   */
  static async sendTestEmail(tenantId: number, to: string): Promise<void> {
    this.invalidateEmailSettingsCache(tenantId);
    await this.sendEmail(
      tenantId,
      to,
      'Email de test - E-Formation',
      "Ceci est un email de test envoyé depuis la configuration des notifications de E-Formation. Si vous recevez ce message, votre configuration SMTP fonctionne correctement."
    );
  }

  /**
   * Security email (sign-in code, new sign-in alert, account locked) sent straight
   * to `to`: whatever the user's notification preferences, and never stored in
   * the notifications table -- its body can hold a one-time code or a link that
   * acts on the account. Throws when no SMTP transport is configured.
   */
  static async sendSecurityEmail(
    tenantId: number,
    to: string,
    subject: string,
    body: string,
    actionUrl?: string
  ): Promise<string> {
    return this.sendEmail(tenantId, to, subject, body, actionUrl);
  }

  /**
   * Send SMS notification via Twilio
   */
  private static async sendSMS(to: string, body: string): Promise<string> {
    if (!twilioClient) {
      throw new Error('Twilio not configured');
    }

    if (!to) {
      throw new Error('Phone number not available');
    }

    const message = await twilioClient.messages.create({
      body,
      from: config.twilio.phoneNumber,
      to,
    });

    return message.sid;
  }

  /**
   * Send WhatsApp notification via Twilio
   */
  private static async sendWhatsApp(to: string, body: string): Promise<string> {
    if (!twilioClient) {
      throw new Error('Twilio not configured');
    }

    if (!to) {
      throw new Error('Phone number not available');
    }

    const message = await twilioClient.messages.create({
      body,
      from: `whatsapp:${config.twilio.whatsappNumber}`,
      to: `whatsapp:${to}`,
    });

    return message.sid;
  }

  /**
   * Send push notification
   */
  private static async sendPush(
    userId: number,
    title: string,
    body: string,
    actionUrl?: string
  ): Promise<void> {
    // Get user's push subscriptions
    const subscriptions = await DatabaseService.query<any>(
      'SELECT * FROM push_subscriptions WHERE user_id = @userId',
      { userId }
    );

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge.png',
      data: { url: actionUrl },
    });

    // Send to web push (VAPID)
    const webPushPromises = subscriptions.map(async (sub: any) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (error: any) {
        if (error.statusCode === 410) {
          // Subscription expired, remove it
          await DatabaseService.execute(
            'DELETE FROM push_subscriptions WHERE id = @id',
            { id: sub.id }
          );
        }
        throw error;
      }
    });

    // Send to Firebase (FCM) if configured
    if (firebaseApp) {
      const fcmTokens = await DatabaseService.query<any>(
        'SELECT fcm_token FROM user_devices WHERE user_id = @userId AND fcm_token IS NOT NULL',
        { userId }
      );

      const fcmPromises = fcmTokens.map(async (device: any) => {
        try {
          await admin.messaging().send({
            token: device.fcm_token,
            notification: { title, body },
            webpush: actionUrl ? {
              fcmOptions: { link: actionUrl },
            } : undefined,
          });
        } catch (error: any) {
          if (error.code === 'messaging/registration-token-not-registered') {
            await DatabaseService.execute(
              'UPDATE user_devices SET fcm_token = NULL WHERE fcm_token = @token',
              { token: device.fcm_token }
            );
          }
          throw error;
        }
      });

      await Promise.allSettled([...webPushPromises, ...fcmPromises]);
    } else {
      await Promise.allSettled(webPushPromises);
    }
  }

  /**
   * Get user notification preferences
   */
  private static async getUserPreferences(userId: number): Promise<any> {
    const prefs = await DatabaseService.query<any>(
      'SELECT * FROM notification_preferences WHERE user_id = @userId',
      { userId }
    );

    return prefs[0] || {
      email: true,
      sms: false,
      whatsapp: false,
      push_web: true,
      push_mobile: true,
    };
  }

  /**
   * Check if channel is enabled in preferences. Matches notification_preferences' real
   * columns (email, sms, whatsapp, push_web, push_mobile) -- this used to look up
   * *_enabled keys that don't exist on the real row, so preferences[undefined] was
   * always undefined and `!== false` made every channel silently always "enabled"
   * regardless of what the user actually saved.
   */
  private static isChannelEnabled(preferences: any, channel: string): boolean {
    if (channel === 'in_app') return true; // no column for this -- can't be disabled
    const channelMap: Record<string, string> = {
      email: 'email',
      sms: 'sms',
      whatsapp: 'whatsapp',
      push: 'push_web',
    };

    return preferences[channelMap[channel]] !== false;
  }

  /**
   * Generate HTML email template, branded with the tenant's logo/name/colors
   * (falls back to the default E-Formation navy look when unconfigured).
   */
  private static generateEmailHTML(title: string, body: string, branding: TenantBranding, actionUrl?: string): string {
    const initial = (branding.name || 'E').trim().charAt(0).toUpperCase() || 'E';
    const logoSrc = branding.logoUrl
      ? (branding.logoUrl.startsWith('http') ? branding.logoUrl : `${config.frontendUrl}${branding.logoUrl}`)
      : null;
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" alt="${branding.name}" style="height:44px;max-width:200px;object-fit:contain;">`
      : `<div style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:10px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:22px;font-weight:bold;text-align:center;font-family:Arial,sans-serif;">${initial}</div>`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #2d3748; margin: 0; padding: 0; background: #eef1f5; }
    .wrapper { padding: 32px 16px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .header { background: ${branding.primaryColor}; color: #ffffff; padding: 28px 24px; text-align: center; }
    .header-brand { font-size: 15px; font-weight: 600; opacity: 0.9; margin-top: 10px; letter-spacing: 0.3px; }
    .header h1 { margin: 14px 0 0; font-size: 20px; }
    .content { padding: 32px 28px; }
    .content p { margin: 0 0 16px; }
    .button { display: inline-block; background: ${branding.secondaryColor}; color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin-top: 8px; font-weight: 600; }
    .footer { padding: 20px 24px; text-align: center; font-size: 12px; color: #a0aec0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        ${logoHtml}
        <div class="header-brand">${branding.name}</div>
        <h1>${title}</h1>
      </div>
      <div class="content">
        <p>${body.replace(/\n/g, '<br>')}</p>
        ${actionUrl ? `<a href="${actionUrl}" class="button">Voir les détails</a>` : ''}
      </div>
      <div class="footer">
        <p>Ceci est une notification automatique. Merci de ne pas répondre directement à cet email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send bulk notifications
   */
  static async sendBulk(
    tenantId: number,
    userIds: number[],
    channel: string,
    subject: string,
    body: string,
    actionUrl?: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.send({
          tenantId,
          userId,
          channel: channel as any,
          subject,
          body,
          actionUrl,
        });
        sent++;
      } catch (error) {
        failed++;
        logger.error('Bulk notification failed', { userId, error });
      }
    }

    return { sent, failed };
  }
}
