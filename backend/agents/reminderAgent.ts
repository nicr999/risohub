// ============================================================
// RISO HUB — agents/reminderAgent.ts
// Time-based reminder agent — runs as a standalone Node.js process.
//
// Schedule (all times UK local — node-cron uses server TZ):
//   08:00 daily  — main reminder sweep
//   12:00 daily  — emergency complaint re-check
//
// Reminder categories:
//   1. COMPLAINTS    — response deadline within 24h / overdue
//   2. QUALIFICATIONS — expiring within 60 days / already expired
//   3. CHECKLIST     — projects stale in current stage > threshold
//   4. SIGNATURES    — unsigned documents > 48h after generation
//   5. SCHEDULE      — jobs starting within 24h
//   6. PORTAL        — (future hook — token expiry warnings)
//
// Config (via Settings table, section = 'reminders'):
//   {
//     enabled: true,
//     staleProjectDays: 14,
//     qualExpiryWarningDays: 60,
//     signatureNudgeHours: 48,
//     scheduleWarningHours: 24
//   }
//
// Disabled by default — set Settings.reminders.enabled = true via
// Admin → Settings → Reminders to activate.
//
// Run via workerEntrypoint.ts with WORKER_TYPE=reminder
// Or standalone: npx ts-node agents/reminderAgent.ts
// ============================================================

import cron from 'node-cron';
import { Op } from 'sequelize';
import sequelize from '../config/database';

import {
  User,
  Project,
  ChecklistItem,
  Complaint,
  Qualification,
  Signature,
  Setting,
  Notification,
} from '../models/index';

import {
  Schedule,
} from '../models/newModels';

import {
  sendNotification,
  sendNotificationToMany,
} from '../services/notificationService';

import {
  sendOverdueComplaintSMS,
  sendQualificationExpirySMS,
  sendScheduleReminderSMS,
} from '../services/smsService';

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULTS = {
  enabled:                 false,
  staleProjectDays:        14,     // days without progress before alert
  qualExpiryWarningDays:   60,     // days before qual expiry to warn
  signatureNudgeHours:     48,     // hours after doc generation before nudge
  scheduleWarningHours:    24,     // hours before job start to remind
};

type ReminderConfig = typeof DEFAULTS;

// ─── Config loader ────────────────────────────────────────────────────────────

async function loadConfig(): Promise<ReminderConfig> {
  try {
    const row = await Setting.findOne({ where: { section: 'reminders' } });
    if (!row) return DEFAULTS;
    return { ...DEFAULTS, ...(row.config as Partial<ReminderConfig>) };
  } catch {
    return DEFAULTS;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

async function getAdminIds(): Promise<number[]> {
  const admins = await User.findAll({ where: { role: 'Admin', active: true }, attributes: ['id'] });
  return admins.map((a: any) => a.id);
}

// ─── 1. COMPLAINT REMINDERS ───────────────────────────────────────────────────
// Fires when a complaint's responseDeadline is within 24h or already passed.
// Emergency complaints: also send SMS to assignee.

async function checkComplaints(): Promise<void> {
  const now = new Date();
  const in24h = addHours(now, 24);

  const urgentComplaints = await Complaint.findAll({
    where: {
      status: { [Op.notIn]: ['resolved', 'closed'] },
      responseDeadline: { [Op.lte]: in24h },
    },
    include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
  });

  if (urgentComplaints.length === 0) return;
  console.log(`[Reminder] ${urgentComplaints.length} complaint(s) approaching or past deadline`);

  const adminIds = await getAdminIds();

  for (const complaint of urgentComplaints as any[]) {
    const isOverdue = complaint.responseDeadline < now;
    const deadline  = new Date(complaint.responseDeadline).toLocaleDateString('en-GB');
    const title     = isOverdue
      ? `⚠️ Complaint response OVERDUE — ${complaint.ref}`
      : `⏰ Complaint response due ${deadline} — ${complaint.ref}`;
    const body      = `${complaint.customerName} · ${complaint.priority === 'emergency' ? 'EMERGENCY' : 'Standard'} · ${complaint.category || 'General'}`;

    // Notify assignee + admins
    const notifyIds = new Set<number>(adminIds);
    if (complaint.assignedTo) notifyIds.add(complaint.assignedTo);

    await sendNotificationToMany(
      [...notifyIds],
      {
        type: 'complaint_overdue',
        title,
        body,
        meta: { complaintId: complaint.id, ref: complaint.ref },
      }
    );

    // SMS for emergency + overdue
    if (complaint.priority === 'emergency' && isOverdue && complaint.assignee) {
      const phone = (complaint.assignee as any).phone;
      if (phone) {
        await sendOverdueComplaintSMS(phone, complaint.assignee.name, complaint.ref, complaint.customerName);
      }
    }
  }
}

// ─── 2. QUALIFICATION REMINDERS ──────────────────────────────────────────────
// Warns when a qualification expires within config.qualExpiryWarningDays.
// Escalates when already expired.

async function checkQualifications(cfg: ReminderConfig): Promise<void> {
  const now      = new Date();
  const warnDate = addDays(now, cfg.qualExpiryWarningDays);

  const quals = await Qualification.findAll({
    where: {
      neverExpires: false,
      expiresAt: { [Op.lte]: warnDate },
    },
    include: [{ model: User, as: 'staff', attributes: ['id', 'name', 'email'] }],
  });

  if (quals.length === 0) return;
  console.log(`[Reminder] ${quals.length} qualification(s) expiring within ${cfg.qualExpiryWarningDays} days`);

  const adminIds = await getAdminIds();

  for (const qual of quals as any[]) {
    const daysLeft = daysUntil(qual.expiresAt);
    const isExpired = daysLeft <= 0;
    const staffName = qual.staff?.name || 'Staff member';

    const title = isExpired
      ? `❌ Qualification EXPIRED — ${staffName}`
      : `⚠️ Qualification expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ${staffName}`;
    const body = `${qual.type} · ${qual.certNumber || 'No cert number'} · ${qual.issuingBody || ''}`;

    // Notify the staff member themselves
    if (qual.staffId) {
      await sendNotification({
        userId: qual.staffId,
        type: isExpired ? 'qual_expired' : 'qual_expiring',
        title,
        body,
        meta: { qualificationId: qual.id, daysLeft },
      });
    }

    // Notify admins
    await sendNotificationToMany(adminIds, {
      type: isExpired ? 'qual_expired' : 'qual_expiring',
      title,
      body,
      meta: { qualificationId: qual.id, staffId: qual.staffId, daysLeft },
    });

    // SMS for expired or within 7 days
    if (daysLeft <= 7 && qual.staff) {
      const phone = qual.staff.phone;
      if (phone) {
        await sendQualificationExpirySMS(phone, staffName, qual.type, Math.max(daysLeft, 0));
      }
    }
  }
}

// ─── 3. STALE CHECKLIST / PROJECT REMINDERS ───────────────────────────────────
// Flags projects where the checklist hasn't been updated in > N days
// AND the project is in an active (non-complete) stage.

async function checkStaleProjects(cfg: ReminderConfig): Promise<void> {
  const cutoff = addDays(new Date(), -cfg.staleProjectDays);

  // Find active projects
  const activeProjects = await Project.findAll({
    where: {
      status: { [Op.notIn]: ['complete', 'audit'] },
    },
    include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }],
  });

  const adminIds = await getAdminIds();
  let staleCount = 0;

  for (const project of activeProjects as any[]) {
    // Find the most recently updated checklist item for this project
    const latestItem = await ChecklistItem.findOne({
      where: { projectId: project.id },
      order: [['updatedAt', 'DESC']],
      attributes: ['updatedAt'],
    });

    const lastActivity = (latestItem as any)?.updatedAt ?? project.createdAt;
    if (lastActivity > cutoff) continue; // recently active — skip

    staleCount++;
    const daysSince = Math.floor(hoursAgo(new Date(lastActivity)) / 24);
    const title = `📋 Project stale for ${daysSince} days — ${project.customerName}`;
    const body  = `${project.address} · Stage: ${project.status} · No checklist updates in ${daysSince} days`;

    const notifyIds = new Set<number>(adminIds);
    if (project.assignedTo) notifyIds.add(project.assignedTo);

    await sendNotificationToMany([...notifyIds], {
      type: 'checklist_issue',
      title,
      body,
      meta: { projectId: project.id, daysSinceActivity: daysSince },
    });
  }

  if (staleCount > 0) {
    console.log(`[Reminder] ${staleCount} stale project(s) flagged (>${cfg.staleProjectDays} days)`);
  }
}

// ─── 4. UNSIGNED DOCUMENT REMINDERS ──────────────────────────────────────────
// Nudges when a signature request has been pending > config.signatureNudgeHours.

async function checkUnsignedDocuments(cfg: ReminderConfig): Promise<void> {
  const cutoff = addHours(new Date(), -cfg.signatureNudgeHours);

  const pending = await Signature.findAll({
    where: {
      status: 'pending',
      createdAt: { [Op.lte]: cutoff },
    },
    include: [
      { model: Project, as: 'project', attributes: ['id', 'customerName', 'address'] },
      { model: User,    as: 'requester', attributes: ['id', 'name'] },
    ],
  });

  if (pending.length === 0) return;
  console.log(`[Reminder] ${pending.length} signature(s) pending > ${cfg.signatureNudgeHours}h`);

  const adminIds = await getAdminIds();

  for (const sig of pending as any[]) {
    const hoursWaiting = Math.floor(hoursAgo(sig.createdAt));
    const project      = sig.project;
    if (!project) continue;

    const title = `✍️ Awaiting customer signature — ${project.customerName}`;
    const body  = `${project.address} · Requested ${hoursWaiting}h ago · No response yet`;

    const notifyIds = new Set<number>(adminIds);
    if (sig.requestedBy) notifyIds.add(sig.requestedBy);

    await sendNotificationToMany([...notifyIds], {
      type: 'signature_received', // closest existing type
      title,
      body,
      meta: { signatureId: sig.id, projectId: project.id, hoursWaiting },
    });
  }
}

// ─── 5. SCHEDULE REMINDERS ────────────────────────────────────────────────────
// Alerts assignees about jobs starting within config.scheduleWarningHours.

async function checkSchedule(cfg: ReminderConfig): Promise<void> {
  const now   = new Date();
  const limit = addHours(now, cfg.scheduleWarningHours);

  const upcoming = await Schedule.findAll({
    where: {
      status: 'scheduled',
      scheduledDate: { [Op.between]: [now, limit] },
    },
    include: [
      { model: Project, as: 'project', attributes: ['id', 'customerName', 'address'] },
      { model: User,    as: 'assignee', attributes: ['id', 'name'] },
    ],
  });

  if (upcoming.length === 0) return;
  console.log(`[Reminder] ${upcoming.length} job(s) starting within ${cfg.scheduleWarningHours}h`);

  for (const job of upcoming as any[]) {
    const project   = job.project;
    const assignee  = job.assignee;
    if (!project || !assignee) continue;

    const dateStr = new Date(job.scheduledDate).toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short',
    });
    const timeStr = job.scheduledTime ?? '';

    const title = `📅 Job reminder: ${job.type} — ${project.customerName}`;
    const body  = `${project.address} · ${dateStr}${timeStr ? ` at ${timeStr}` : ''}`;

    await sendNotification({
      userId: assignee.id,
      type:   'system',
      title,
      body,
      meta: { scheduleId: job.id, projectId: project.id },
    });

    // SMS to assignee
    if (assignee.phone) {
      await sendScheduleReminderSMS(
        assignee.phone,
        assignee.name,
        job.type,
        project.customerName,
        project.address,
        `${dateStr}${timeStr ? ` at ${timeStr}` : ''}`,
      );
    }
  }
}

// ─── 6. EMERGENCY COMPLAINT RE-CHECK ─────────────────────────────────────────
// Separate midday sweep for active emergency complaints only.

async function checkEmergencyComplaints(): Promise<void> {
  const now = new Date();

  const emergencies = await Complaint.findAll({
    where: {
      priority: 'emergency',
      status: { [Op.notIn]: ['resolved', 'closed'] },
      inspectionDeadline: { [Op.lte]: addHours(now, 4) }, // within 4h
    },
    include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }],
  });

  if (emergencies.length === 0) return;

  const adminIds = await getAdminIds();
  console.log(`[Reminder] ${emergencies.length} emergency complaint(s) require immediate attention`);

  for (const c of emergencies as any[]) {
    const isOverdue = c.inspectionDeadline && c.inspectionDeadline < now;
    await sendNotificationToMany(adminIds, {
      type: 'complaint_emergency',
      title: `🚨 EMERGENCY: Inspection ${isOverdue ? 'OVERDUE' : 'due within 4h'} — ${c.ref}`,
      body:  `${c.customerName} · ${c.customerAddress || ''}`,
      meta:  { complaintId: c.id, ref: c.ref },
    });
  }
}

// ─── Main sweep ───────────────────────────────────────────────────────────────

async function runDailySweep(): Promise<void> {
  console.log(`[Reminder Agent] Daily sweep started — ${new Date().toISOString()}`);

  const cfg = await loadConfig();
  if (!cfg.enabled) {
    console.log('[Reminder Agent] Disabled (Settings.reminders.enabled = false). Skipping.');
    return;
  }

  const tasks: [string, () => Promise<void>][] = [
    ['complaints',           () => checkComplaints()],
    ['qualifications',       () => checkQualifications(cfg)],
    ['stale projects',       () => checkStaleProjects(cfg)],
    ['unsigned documents',   () => checkUnsignedDocuments(cfg)],
    ['schedule',             () => checkSchedule(cfg)],
  ];

  for (const [name, fn] of tasks) {
    try {
      await fn();
    } catch (err) {
      console.error(`[Reminder Agent] Error in ${name} check:`, err);
      // Continue — one failing check should not stop the others
    }
  }

  console.log(`[Reminder Agent] Daily sweep complete — ${new Date().toISOString()}`);
}

async function runEmergencySweep(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg.enabled) return;
  try {
    await checkEmergencyComplaints();
  } catch (err) {
    console.error('[Reminder Agent] Error in emergency sweep:', err);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await sequelize.authenticate();
  console.log('[Reminder Agent] DB connected');

  // ── Main sweep: 08:00 daily ───────────────────────────────────────────────
  cron.schedule('0 8 * * *', runDailySweep, {
    timezone: process.env.TZ || 'Europe/London',
  });

  // ── Emergency re-check: 12:00 daily ─────────────────────────────────────
  cron.schedule('0 12 * * *', runEmergencySweep, {
    timezone: process.env.TZ || 'Europe/London',
  });

  console.log('[Reminder Agent] Scheduled — 08:00 daily sweep, 12:00 emergency re-check');

  // Run immediately on startup if configured (useful for testing/dev)
  if (process.env.RUN_ON_START === 'true') {
    console.log('[Reminder Agent] RUN_ON_START=true — running sweep now');
    await runDailySweep();
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Reminder Agent] Shutting down...');
    await sequelize.close();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('[Reminder Agent] Fatal:', err);
  process.exit(1);
});
