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
     * Send email notification
     */
    private static sendEmail;
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