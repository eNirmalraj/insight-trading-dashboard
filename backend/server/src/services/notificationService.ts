// backend/server/src/services/notificationService.ts

/**
 * Notification Service
 * Handles pushing alerts to external channels (Push, Email, Webhook).
 * This service is called after an alert is persisted in Supabase.
 */

export interface NotificationPayload {
    userId?: string | null;
    title: string;
    message: string;
    type: string;
    symbol?: string;
    data?: any;
}

export class NotificationService {

    /**
     * Send an alert notification
     */
    public static async sendAlert(payload: NotificationPayload): Promise<void> {
        console.log(`[NotificationService] Preparing to send alert: ${payload.title}`);

        // 1. In-App Notification (Supabase Realtime handles this automatically for connected clients)

        // 2. Email Notification (Integration with SendGrid/AWS SES)
        await this.sendEmail(payload);

        // 3. Web Push Notification (FCM/WebPush)
        await this.sendPush(payload);

        // 4. Webhook (Discord/Telegram/Custom)
        await this.sendWebhook(payload);
    }

    private static async sendEmail(payload: NotificationPayload) {
        // TODO: Implement actual Email logic (e.g. SendGrid)
        // console.log(`[NotificationService] Email stub for ${payload.userId}`);
    }

    private static async sendPush(payload: NotificationPayload) {
        // TODO: Implement WebPush/FCM logic
        // console.log(`[NotificationService] Push stub for ${payload.userId}`);
    }

    private static async sendWebhook(payload: NotificationPayload) {
        // TODO: Implement Webhook logic
        // console.log(`[NotificationService] Webhook stub for ${payload.userId}`);
    }
}
