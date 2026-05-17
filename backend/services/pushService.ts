// ============================================================
// RISO HUB — services/pushService.ts
// Firebase Cloud Messaging (FCM) push notifications.
// Works for both iOS (via APNs) and Android.
//
// Env vars required:
//   FIREBASE_SERVICE_ACCOUNT — JSON string of the Firebase service account key
//
// Usage:
//   await sendPushToUser(userId, { title: 'Status updated', body: '...' });
// ============================================================

import admin from 'firebase-admin';
import { DeviceToken } from '../models/index';

let firebaseApp: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (!firebaseApp) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
    const serviceAccount = JSON.parse(raw);
    firebaseApp = admin.apps.length
      ? admin.apps[0]!
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return firebaseApp;
}

export interface PushPayload {
  title: string;
  body:  string;
  data?: Record<string, string>;
}

/** Send a push notification to a single FCM device token */
export async function sendPush(token: string, payload: PushPayload): Promise<void> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return; // No-op in dev without Firebase
  try {
    await getApp().messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data:         payload.data ?? {},
      apns:         { payload: { aps: { sound: 'default' } } },
      android:      { notification: { sound: 'default' } },
    });
  } catch (err: any) {
    if (err?.errorInfo?.code === 'messaging/registration-token-not-registered') {
      // Token expired — clean it up
      await DeviceToken.destroy({ where: { token } }).catch(() => {});
    } else {
      console.error('[Push] send failed:', err?.errorInfo?.code ?? err);
    }
  }
}

/** Send to multiple FCM tokens (batched, max 500 per call) */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length || !process.env.FIREBASE_SERVICE_ACCOUNT) return;
  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const messages: admin.messaging.Message[] = batch.map(token => ({
      token,
      notification: { title: payload.title, body: payload.body },
      data:         payload.data ?? {},
      apns:         { payload: { aps: { sound: 'default' } } },
      android:      { notification: { sound: 'default' } },
    }));
    try {
      const result = await getApp().messaging().sendEach(messages);
      // Clean up any tokens that are no longer registered
      const stale: string[] = [];
      result.responses.forEach((r, idx) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          stale.push(batch[idx]);
        }
      });
      if (stale.length) {
        await DeviceToken.destroy({ where: { token: stale } }).catch(() => {});
      }
    } catch (err) {
      console.error('[Push] sendEach failed:', err);
    }
  }
}

/** Look up all device tokens for a user and send them a push notification */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const rows = await DeviceToken.findAll({ where: { userId } });
  const tokens = rows.map((r: any) => r.token as string);
  await sendPushToTokens(tokens, payload);
}

/** Look up device tokens for multiple users and send them a push notification */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds.length) return;
  const rows = await DeviceToken.findAll({ where: { userId: userIds } });
  const tokens = rows.map((r: any) => r.token as string);
  await sendPushToTokens(tokens, payload);
}
