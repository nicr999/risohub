// ============================================================
// RISO HUB — services/smsService.ts
// SMS notifications via Twilio.
// Env vars required:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER  (e.g. +441234567890 or messaging service SID)
//
// Used for time-sensitive alerts only — emergency complaints,
// signature requests, schedule notifications.
// ============================================================

import twilio from 'twilio';

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio credentials not configured');
  return twilio(sid, token);
}

const FROM = process.env.TWILIO_FROM_NUMBER!;

// ── Generic send ──────────────────────────────────────────────

export async function sendSMS(to: string, body: string): Promise<void> {
  // Silently skip if SMS not configured (avoids crashes in dev)
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_FROM_NUMBER) {
    console.log(`[SMS] Not configured — would send to ${to}: ${body}`);
    return;
  }
  // Normalise UK numbers
  const normalised = normaliseUKNumber(to);
  if (!normalised) {
    console.warn(`[SMS] Invalid phone number — skipping: ${to}`);
    return;
  }
  try {
    await getClient().messages.create({ to: normalised, from: FROM, body });
    console.log(`[SMS] Sent to ${normalised}`);
  } catch (err: any) {
    // Log but never throw — SMS failure should never break the main flow
    console.error(`[SMS] Failed to send to ${normalised}:`, err.message);
  }
}

// ── Typed message templates ───────────────────────────────────

export async function sendEmergencyComplaintSMS(to: string, staffName: string, customerName: string, address: string): Promise<void> {
  await sendSMS(to,
    `RISO HUB ⚠ URGENT: Emergency complaint received from ${customerName}, ${address}. No heating/hot water. Log in to RISO HUB immediately. — RISO HOME`
  );
}

export async function sendSignatureRequestSMS(to: string, customerName: string, signUrl: string): Promise<void> {
  await sendSMS(to,
    `Hi ${customerName}, your RISO HOME heat pump installation is complete. Please sign your handover document here: ${signUrl} — RISO HOME`
  );
}

export async function sendScheduleReminderSMS(to: string, staffName: string, jobType: string, customerName: string, address: string, dateStr: string): Promise<void> {
  await sendSMS(to,
    `RISO HUB: Reminder — ${jobType} visit tomorrow for ${customerName}, ${address} (${dateStr}). Log in for full details. — RISO HOME`
  );
}

export async function sendOverdueComplaintSMS(to: string, staffName: string, ref: string, customerName: string): Promise<void> {
  await sendSMS(to,
    `RISO HUB: Complaint ${ref} for ${customerName} is OVERDUE. Response deadline has passed. Log in to update. — RISO HOME`
  );
}

export async function sendQualificationExpirySMS(to: string, staffName: string, qualType: string, daysLeft: number): Promise<void> {
  await sendSMS(to,
    `RISO HUB: Your ${qualType} qualification expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Please renew and upload your certificate. — RISO HOME`
  );
}

// ── Helpers ───────────────────────────────────────────────────

function normaliseUKNumber(raw: string): string | null {
  if (!raw) return null;
  let n = raw.replace(/[\s\-().]/g, '');
  // Already E.164
  if (n.startsWith('+')) return n;
  // UK 07xxx → +447xxx
  if (n.startsWith('07') && n.length === 11) return '+44' + n.slice(1);
  // UK 447xxx
  if (n.startsWith('447') && n.length === 12) return '+' + n;
  // International without +
  if (n.length > 10) return '+' + n;
  return null;
}
