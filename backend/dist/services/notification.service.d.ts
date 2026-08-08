interface NotificationPayload {
    tenantId: number;
    userId: number;
    channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app';
    subject?: string;
    body: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
}
interface NotificationResult {
    id: number;
    status: 'sent' | 'failed' | 'pending';
    channel: string;
    externalId?: string;
}
export declare class NotificationService {
    /**
     * Send a notification through the specified channel
     */
    static send(payload: NotificationPayload): Promise<NotificationResult>;
    /**
     * Resolve the SMTP transporter for a tenant: its own configured settings if
     * present and enabled, otherwise the env-configured defaults. Cached per
     * tenant until invalidateEmailSettingsCache() is called.
     */
    private static getEmailConfig;
    /**
     * Drop the cached transporter for a tenant so the next send re-reads its settings from the DB.
     */
    static invalidateEmailSettingsCache(tenantId: number): void;
    /**
     * Send email notification
     */
    private static sendEmail;
    /**
     * Send a test email to verify the tenant's SMTP settings work.
     */
    static sendTestEmail(tenantId: number, to: string): Promise<void>;
    /**
     * Send SMS notification via Twilio
     */
    private static sendSMS;
    /**
     * Send WhatsApp notification via Twilio
     */
    private static sendWhatsApp;
    /**
     * Send push notification
     */
    private static sendPush;
    /**
     * Get user notification preferences
     */
    private static getUserPreferences;
    /**
     * Check if channel is enabled in preferences
     */
    private static isChannelEnabled;
    /**
     * Generate HTML email template
     */
    private static generateEmailHTML;
    /**
     * Send bulk notifications
     */
    static sendBulk(tenantId: number, userIds: number[], channel: string, subject: string, body: string, actionUrl?: string): Promise<{
        sent: number;
        failed: number;
    }>;
}
export {};
//# sourceMappingURL=notification.service.d.ts.map