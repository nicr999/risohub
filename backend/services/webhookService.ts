// services/webhookService.ts
// Outbound webhook dispatch — notifies registered third-party endpoints
// on key RISO HUB events (project status, document signed, complaint opened, etc.)
import crypto from 'crypto';
import { WebhookEndpoint, WebhookDelivery } from '../models';

export type WebhookEventType =
  | 'project.status_changed'
  | 'project.created'
  | 'document.signed'
  | 'document.uploaded'
  | 'complaint.opened'
  | 'complaint.resolved'
  | 'qualification.expiring'
  | 'portal.viewed'
  | 'partner.access_granted';

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [0, 60_000, 300_000, 1_800_000, 7_200_000]; // immediate, 1m, 5m, 30m, 2h

function sign(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

async function dispatch(endpoint: any, payload: WebhookPayload): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const sig = sign(endpoint.secret, body);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RisoHub-Signature': sig,
        'X-RisoHub-Event': payload.event,
        'X-RisoHub-Delivery': crypto.randomUUID(),
        'User-Agent': 'RisoHub-Webhook/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Request failed' };
  }
}

export async function fireWebhook(event: WebhookEventType, data: Record<string, unknown>): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Find all active endpoints subscribed to this event
  const endpoints = await WebhookEndpoint.findAll({
    where: { active: true },
  });

  const subscribed = endpoints.filter(ep => {
    const events: string[] = JSON.parse(ep.events ?? '[]');
    return events.includes(event) || events.includes('*');
  });

  await Promise.allSettled(subscribed.map(ep => attemptDelivery(ep, payload, 0)));
}

async function attemptDelivery(endpoint: any, payload: WebhookPayload, attempt: number): Promise<void> {
  const result = await dispatch(endpoint, payload);

  // Log delivery
  const delivery = await WebhookDelivery.create({
    endpointId: endpoint.id,
    event: payload.event,
    payload: JSON.stringify(payload),
    attempt: attempt + 1,
    responseStatus: result.status ?? null,
    success: result.ok,
    errorMessage: result.error ?? null,
    deliveredAt: new Date(),
  });

  if (result.ok) {
    console.log(`[Webhook] ✓ ${payload.event} → ${endpoint.url} (attempt ${attempt + 1})`);
    return;
  }

  console.warn(`[Webhook] ✗ ${payload.event} → ${endpoint.url} (attempt ${attempt + 1}): ${result.status ?? result.error}`);

  // Schedule retry if under max attempts and not a permanent failure
  if (attempt + 1 < MAX_ATTEMPTS && result.status !== 410) {
    const delay = RETRY_DELAYS_MS[attempt + 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    setTimeout(() => attemptDelivery(endpoint, payload, attempt + 1), delay);
  }
}

export async function verifySignature(secret: string, body: string, signature: string): Promise<boolean> {
  const expected = sign(secret, body);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
