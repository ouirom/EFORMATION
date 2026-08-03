"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const twilio_1 = __importDefault(require("twilio"));
const web_push_1 = __importDefault(require("web-push"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const config_1 = require("../config");
const database_service_1 = require("./database.service");
const logger_1 = require("../utils/logger");
// Email transporter
const emailTransporter = config_1.config.smtp.host ? nodemailer_1.default.createTransport({
    host: config_1.config.smtp.host,
    port: config_1.config.smtp.port,
    secure: config_1.config.smtp.port === 465,
    auth: config_1.config.smtp.user ? {
        user: config_1.config.smtp.user,
        pass: config_1.config.smtp.password,
    } : undefined,
}) : null;
// Twilio client for SMS and WhatsApp
const twilioClient = config_1.config.twilio.accountSid && config_1.config.twilio.authToken
    ? (0, twilio_1.default)(config_1.config.twilio.accountSid, config_1.config.twilio.authToken)
    : null;
// Configure web-push for VAPID (only if keys are configured)
if (config_1.config.webPush?.publicKey && config_1.config.webPush?.privateKey) {
    try {
        web_push_1.default.setVapidDetails(config_1.config.webPush.subject || 'mailto:admin@eformation.com', config_1.config.webPush.publicKey, config_1.config.webPush.privateKey);
    }
    catch (error) {
        logger_1.logger.warn('VAPID configuration failed', { error });
    }
}
// Initialize Firebase Admin for FCM
let firebaseApp = null;
if (config_1.config.firebase?.projectId && config_1.config.firebase?.clientEmail && config_1.config.firebase?.privateKey) {
    try {
        firebaseApp = firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert({
                projectId: config_1.config.firebase.projectId,
                clientEmail: config_1.config.firebase.clientEmail,
                privateKey: config_1.config.firebase.privateKey,
            }),
        });
    }
    catch (error) {
        logger_1.logger.warn('Firebase initialization failed', { error });
    }
}
class NotificationService {
    /**
     * Send a notification through the specified channel
     */
    static async send(payload) {
        const { tenantId, userId, channel, subject, body, actionUrl, metadata } = payload;
        // Check user preferences
        const preferences = await this.getUserPreferences(userId);
        const channelEnabled = this.isChannelEnabled(preferences, channel);
        if (!channelEnabled) {
            logger_1.logger.info('Notification channel disabled by user preferences', { userId, channel });
            return { id: 0, status: 'pending', channel };
        }
        // Get user info
        const users = await database_service_1.DatabaseService.query('SELECT email, phone FROM users WHERE id = @userId', { userId });
        if (users.length === 0) {
            throw new Error('User not found');
        }
        const user = users[0];
        // Create notification record
        const result = await database_service_1.DatabaseService.query(`INSERT INTO notifications (tenant_id, user_id, channel, subject, body, action_url, metadata)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @userId, @channel, @subject, @body, @actionUrl, @metadata)`, {
            tenantId,
            userId,
            channel,
            subject: subject || null,
            body,
            actionUrl: actionUrl || null,
            metadata: metadata ? JSON.stringify(metadata) : null,
        });
        const notificationId = result[0].id;
        try {
            let externalId;
            switch (channel) {
                case 'email':
                    externalId = await this.sendEmail(user.email, subject || 'Notification', body, actionUrl);
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
            // Update status to sent
            await database_service_1.DatabaseService.execute(`UPDATE notifications SET sent_at = SYSUTCDATETIME(), external_id = @externalId WHERE id = @id`, { id: notificationId, externalId });
            return { id: notificationId, status: 'sent', channel, externalId };
        }
        catch (error) {
            logger_1.logger.error('Failed to send notification', { notificationId, channel, error });
            await database_service_1.DatabaseService.execute(`UPDATE notifications SET failed_at = SYSUTCDATETIME(), error_message = @error WHERE id = @id`, { id: notificationId, error: error.message });
            return { id: notificationId, status: 'failed', channel };
        }
    }
    /**
     * Send email notification
     */
    static async sendEmail(to, subject, body, actionUrl) {
        const htmlBody = this.generateEmailHTML(subject, body, actionUrl);
        if (!emailTransporter) {
            throw new Error('Email transporter not configured');
        }
        const info = await emailTransporter.sendMail({
            from: config_1.config.smtp.from,
            to,
            subject,
            text: body,
            html: htmlBody,
        });
        return info.messageId;
    }
    /**
     * Send SMS notification via Twilio
     */
    static async sendSMS(to, body) {
        if (!twilioClient) {
            throw new Error('Twilio not configured');
        }
        if (!to) {
            throw new Error('Phone number not available');
        }
        const message = await twilioClient.messages.create({
            body,
            from: config_1.config.twilio.phoneNumber,
            to,
        });
        return message.sid;
    }
    /**
     * Send WhatsApp notification via Twilio
     */
    static async sendWhatsApp(to, body) {
        if (!twilioClient) {
            throw new Error('Twilio not configured');
        }
        if (!to) {
            throw new Error('Phone number not available');
        }
        const message = await twilioClient.messages.create({
            body,
            from: `whatsapp:${config_1.config.twilio.whatsappNumber}`,
            to: `whatsapp:${to}`,
        });
        return message.sid;
    }
    /**
     * Send push notification
     */
    static async sendPush(userId, title, body, actionUrl) {
        // Get user's push subscriptions
        const subscriptions = await database_service_1.DatabaseService.query('SELECT * FROM push_subscriptions WHERE user_id = @userId', { userId });
        const payload = JSON.stringify({
            title,
            body,
            icon: '/icon-192.png',
            badge: '/badge.png',
            data: { url: actionUrl },
        });
        // Send to web push (VAPID)
        const webPushPromises = subscriptions.map(async (sub) => {
            try {
                await web_push_1.default.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                }, payload);
            }
            catch (error) {
                if (error.statusCode === 410) {
                    // Subscription expired, remove it
                    await database_service_1.DatabaseService.execute('DELETE FROM push_subscriptions WHERE id = @id', { id: sub.id });
                }
                throw error;
            }
        });
        // Send to Firebase (FCM) if configured
        if (firebaseApp) {
            const fcmTokens = await database_service_1.DatabaseService.query('SELECT fcm_token FROM user_devices WHERE user_id = @userId AND fcm_token IS NOT NULL', { userId });
            const fcmPromises = fcmTokens.map(async (device) => {
                try {
                    await firebase_admin_1.default.messaging().send({
                        token: device.fcm_token,
                        notification: { title, body },
                        webpush: actionUrl ? {
                            fcmOptions: { link: actionUrl },
                        } : undefined,
                    });
                }
                catch (error) {
                    if (error.code === 'messaging/registration-token-not-registered') {
                        await database_service_1.DatabaseService.execute('UPDATE user_devices SET fcm_token = NULL WHERE fcm_token = @token', { token: device.fcm_token });
                    }
                    throw error;
                }
            });
            await Promise.allSettled([...webPushPromises, ...fcmPromises]);
        }
        else {
            await Promise.allSettled(webPushPromises);
        }
    }
    /**
     * Get user notification preferences
     */
    static async getUserPreferences(userId) {
        const prefs = await database_service_1.DatabaseService.query('SELECT * FROM notification_preferences WHERE user_id = @userId', { userId });
        return prefs[0] || {
            email_enabled: true,
            sms_enabled: false,
            whatsapp_enabled: false,
            push_enabled: true,
            in_app_enabled: true,
        };
    }
    /**
     * Check if channel is enabled in preferences
     */
    static isChannelEnabled(preferences, channel) {
        const channelMap = {
            email: 'email_enabled',
            sms: 'sms_enabled',
            whatsapp: 'whatsapp_enabled',
            push: 'push_enabled',
            in_app: 'in_app_enabled',
        };
        return preferences[channelMap[channel]] !== false;
    }
    /**
     * Generate HTML email template
     */
    static generateEmailHTML(title, body, actionUrl) {
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a365d; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; background: #f9f9f9; }
    .button { display: inline-block; background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      <p>${body.replace(/\n/g, '<br>')}</p>
      ${actionUrl ? `<a href="${actionUrl}" class="button">View Details</a>` : ''}
    </div>
    <div class="footer">
      <p>This is an automated notification. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
    `;
    }
    /**
     * Send bulk notifications
     */
    static async sendBulk(tenantId, userIds, channel, subject, body, actionUrl) {
        let sent = 0;
        let failed = 0;
        for (const userId of userIds) {
            try {
                await this.send({
                    tenantId,
                    userId,
                    channel: channel,
                    subject,
                    body,
                    actionUrl,
                });
                sent++;
            }
            catch (error) {
                failed++;
                logger_1.logger.error('Bulk notification failed', { userId, error });
            }
        }
        return { sent, failed };
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map