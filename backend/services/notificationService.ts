// ============================================================
// RISO HUB — services/notificationService.ts
// Creates in-app notifications. Used by routes and agents.
// ============================================================

import { Notification } from '../models';

export type NotificationType =
  | 'mention'
  | 'complaint_new'
  | 'complaint_overdue'
  | 'complaint_emergency'
  | 'complaint_escalated'
  | 'qual_expiring'
  | 'qual_expired'
  | 'checklist_issue'
  | 'handover_ready'
  | 'signature_received'
  | 'action_assigned'
  | 'system';

interface CreateNotificationOptions {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  meta?: object;
}

export async function sendNotification(opts: CreateNotificationOptions): Promise<void> {
  try {
    await Notification.create({
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      read: false,
      meta: opts.meta || {},
    });
  } catch (err) {
    // Never let notification failures crash the calling request
    console.error('[NotificationService] Failed to create notification:', err);
  }
}

export async function sendNotificationToMany(
  userIds: number[],
  opts: Omit<CreateNotificationOptions, 'userId'>
): Promise<void> {
  await Promise.allSettled(
    userIds.map(userId => sendNotification({ ...opts, userId }))
  );
}

export async function sendSystemNotification(
  userIds: number[],
  title: string,
  body: string,
  meta?: object
): Promise<void> {
  await sendNotificationToMany(userIds, { type: 'system', title, body, meta });
}
