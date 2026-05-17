/**
 * emailWorker.ts
 *
 * Standalone worker that consumes RabbitMQ events and dispatches emails.
 * Respects per-notification-type Settings toggles fetched from DB.
 *
 * Run alongside driveSyncWorker.ts as a separate process / Docker service:
 *
 *   email-worker:
 *     build: .
 *     command: node -r ts-node/register src/workers/emailWorker.ts
 *     environment:
 *       - RABBITMQ_URL
 *       - SENDGRID_API_KEY   (or AWS_REGION + EMAIL_PROVIDER=ses)
 *       - EMAIL_FROM
 *       - APP_URL
 *       - DATABASE_URL
 *
 * Events consumed → email sent:
 *   user.invited              → sendUserInvite
 *   auth.passwordResetRequest → sendPasswordReset
 *   signature.requested       → sendSignatureRequestEmail
 *   signature.signed          → sendSignatureConfirmation  (to signer)
 *                             → sendHandoverReady          (if allSigned)
 *   signature.declined        → sendSignatureDeclined      (to surveyor)
 *   checklist.nonCompliant    → sendComplianceAlert        (if enabled)
 *   handover.generated        → sendHandoverReady          (to customer)
 *   project.created           → sendProjectCreated         (if enabled)
 *   drive.syncFailed          → sendDriveSyncFailed        (admin only)
 *   email.weeklyDigest        → sendWeeklyDigest           (scheduled, see below)
 *
 * Weekly digest scheduling:
 *   A cron job (or scheduled Lambda) publishes email.weeklyDigest on Monday 08:00.
 *   The worker assembles stats from DB and sends to all Admin/Surveyor users.
 */

import amqp, { Channel, Connection, ConsumeMessage } from "amqplib";
import { Op } from "sequelize";
import {
  sendUserInvite,
  sendPasswordReset,
  sendSignatureRequestEmail,
  sendSignatureConfirmation,
  sendSignatureDeclined,
  sendComplianceAlert,
  sendHandoverReady,
  sendWeeklyDigest,
  sendProjectCreated,
  sendDriveSyncFailed,
} from "./emailService";
import { sendWeeklyAnalyticsDigest } from "./analyticsDigestService";
import { User, Project, Signature, Document, Settings } from "../models";
import sequelize from "../db";

// ─── Config ───────────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://localhost";
const EXCHANGE     = "riso.events";
const QUEUE        = "email-worker";
const APP_URL      = process.env.APP_URL ?? "https://app.risohome.co.uk";
const PREFETCH     = 5;

const ROUTING_KEYS = [
  "user.invited",
  "auth.passwordResetRequest",
  "signature.requested",
  "signature.signed",
  "signatures.allCaptured",
  "signature.declined",
  "checklist.nonCompliant",
  "handover.generated",
  "project.created",
  "drive.syncFailed",
  "email.weeklyDigest",
  "analytics.weeklyDigest",
];

// ─── Settings cache (refresh every 5 min) ────────────────────────────────────

let _settings: Record<string, any> | null = null;
let _settingsLoadedAt = 0;

async function getSettings(): Promise<Record<string, any>> {
  if (_settings && Date.now() - _settingsLoadedAt < 5 * 60_000) return _settings;
  try {
    const rows = await Settings.findAll();
    _settings = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    _settingsLoadedAt = Date.now();
  } catch {
    _settings = _settings ?? {};
  }
  return _settings!;
}

async function isEnabled(key: string): Promise<boolean> {
  const s = await getSettings();
  // key format: "notifications.complianceAlerts" etc.
  return s[key] !== false && s[key] !== "false";
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function onUserInvited(payload: any) {
  const { userId, inviteToken, inviterName } = payload;
  const user = await User.findByPk(userId);
  if (!user) return;

  await sendUserInvite({
    to:            (user as any).email,
    recipientName: (user as any).name,
    inviterName:   inviterName ?? "The RISO HOME team",
    role:          (user as any).role,
    inviteUrl:     `${APP_URL}/accept-invite?token=${inviteToken}`,
    expiresHours:  48,
  });
}

async function onPasswordResetRequest(payload: any) {
  const { userId, resetToken } = payload;
  const user = await User.findByPk(userId);
  if (!user) return;

  await sendPasswordReset({
    to:            (user as any).email,
    recipientName: (user as any).name,
    resetUrl:      `${APP_URL}/reset-password?token=${resetToken}`,
    expiresMinutes: 60,
  });
}

async function onSignatureRequested(payload: any) {
  // signatureService already calls sendSignatureRequestEmail directly —
  // this handler is a safety net if you switch to fully event-driven delivery.
  // Check if it was already sent to avoid duplicates.
  const { signatureId } = payload;
  const sig = await Signature.findByPk(signatureId);
  if (!sig || (sig as any).status !== "pending") return;
  // No-op: signatureService.requestSignature sends the email inline.
}

async function onSignatureSigned(payload: any) {
  const { signatureId, projectId, role } = payload;
  const sig     = await Signature.findByPk(signatureId);
  const project = await Project.findByPk(projectId);
  if (!sig || !project) return;

  // Send confirmation to the signer
  const signerEmail = (sig as any).metadata?.recipientEmail;
  if (signerEmail) {
    await sendSignatureConfirmation({
      to:            signerEmail,
      recipientName: (sig as any).signedBy ?? "Customer",
      customerName:  (project as any).customerName,
      address:       `${(project as any).address}, ${(project as any).postcode}`,
      role,
      signedAt:      new Date((sig as any).metadata?.timestamp ?? Date.now()),
      pdfUrl:        (sig as any).pdfUrl ?? undefined,
      hash:          (sig as any).hash ?? "",
    });
  }

  // Notify assigned surveyor
  if (await isEnabled("notifications.signatureAlerts")) {
    const surveyor = await User.findByPk((project as any).assignedTo);
    if (surveyor) {
      await sendSignatureConfirmation({
        to:            (surveyor as any).email,
        recipientName: (surveyor as any).name,
        customerName:  (project as any).customerName,
        address:       `${(project as any).address}, ${(project as any).postcode}`,
        role,
        signedAt:      new Date((sig as any).metadata?.timestamp ?? Date.now()),
        pdfUrl:        (sig as any).pdfUrl ?? undefined,
        hash:          (sig as any).hash ?? "",
      });
    }
  }
}

async function onAllSignaturesCaptured(payload: any) {
  const { projectId, documentId } = payload;
  const project = await Project.findByPk(projectId);
  const doc     = await Document.findByPk(documentId);
  if (!project || !doc) return;

  // Find the customer email from the customer signature record
  const customerSig = await Signature.findOne({
    where: { documentId, role: "customer" },
  });
  const customerEmail = (customerSig as any)?.metadata?.recipientEmail;
  if (!customerEmail) return;

  const settings = await getSettings();

  await sendHandoverReady({
    to:            customerEmail,
    recipientName: (project as any).customerName,
    customerName:  (project as any).customerName,
    address:       `${(project as any).address}, ${(project as any).postcode}`,
    projectType:   (project as any).projectType,
    pdfUrl:        (doc as any).pdfUrl,
    mcsNumber:     settings["branding.mcsNumber"] ?? "",
  });
}

async function onSignatureDeclined(payload: any) {
  const { signatureId, projectId, role } = payload;
  const project = await Project.findByPk(projectId, {
    include: [{ model: User, as: "assignedUser" }],
  });
  if (!project) return;

  const surveyor = await User.findByPk((project as any).assignedTo);
  if (!surveyor) return;

  await sendSignatureDeclined({
    to:           (surveyor as any).email,
    surveyorName: (surveyor as any).name,
    customerName: (project as any).customerName,
    address:      `${(project as any).address}, ${(project as any).postcode}`,
    role,
    projectUrl:   `${APP_URL}/projects/${projectId}`,
  });
}

async function onChecklistNonCompliant(payload: any) {
  if (!(await isEnabled("notifications.complianceAlerts"))) return;

  const { projectId, blockingItems } = payload;
  const project = await Project.findByPk(projectId);
  if (!project) return;

  // Notify assigned surveyor + all admins
  const recipients = await User.findAll({
    where: {
      active: true,
      // @ts-ignore
      role: ["Admin", "Surveyor"],
    },
  });

  for (const user of recipients) {
    // Surveyor: only if this is their project
    if ((user as any).role === "Surveyor" && (user as any).id !== (project as any).assignedTo) continue;

    await sendComplianceAlert({
      to:            (user as any).email,
      recipientName: (user as any).name,
      customerName:  (project as any).customerName,
      address:       `${(project as any).address}, ${(project as any).postcode}`,
      projectType:   (project as any).projectType,
      blockingItems: blockingItems ?? [],
      projectUrl:    `${APP_URL}/projects/${projectId}`,
    });
  }
}

async function onHandoverGenerated(payload: any) {
  // handoverReady email is sent by onAllSignaturesCaptured.
  // This handler sends an internal notice to the assigned surveyor.
  if (!(await isEnabled("notifications.handoverAlerts"))) return;

  const { projectId, documentId } = payload;
  const project = await Project.findByPk(projectId);
  const doc     = await Document.findByPk(documentId);
  if (!project || !doc) return;

  const surveyor = await User.findByPk((project as any).assignedTo);
  if (!surveyor) return;

  const settings = await getSettings();

  await sendHandoverReady({
    to:            (surveyor as any).email,
    recipientName: (surveyor as any).name,
    customerName:  (project as any).customerName,
    address:       `${(project as any).address}, ${(project as any).postcode}`,
    projectType:   (project as any).projectType,
    pdfUrl:        (doc as any).pdfUrl,
    mcsNumber:     settings["branding.mcsNumber"] ?? "",
  });
}

async function onProjectCreated(payload: any) {
  if (!(await isEnabled("notifications.projectCreated"))) return;

  const { projectId, createdBy } = payload;
  const project = await Project.findByPk(projectId);
  if (!project) return;

  const creator  = await User.findByPk(createdBy);
  const assignee = await User.findByPk((project as any).assignedTo);

  // Notify all admins
  const admins = await User.findAll({ where: { role: "Admin", active: true } });
  for (const admin of admins) {
    await sendProjectCreated({
      to:            (admin as any).email,
      recipientName: (admin as any).name,
      customerName:  (project as any).customerName,
      address:       `${(project as any).address}, ${(project as any).postcode}`,
      projectType:   (project as any).projectType,
      assignedTo:    assignee ? (assignee as any).name : "Unassigned",
      createdBy:     creator ? (creator as any).name : "Unknown",
      projectUrl:    `${APP_URL}/projects/${projectId}`,
    });
  }
}

async function onDriveSyncFailed(payload: any) {
  const { projectId, entityId, error, attempts } = payload;
  const project = await Project.findByPk(projectId);
  const admins  = await User.findAll({ where: { role: "Admin", active: true } });
  if (!project || admins.length === 0) return;

  for (const admin of admins) {
    await sendDriveSyncFailed({
      to:          (admin as any).email,
      adminName:   (admin as any).name,
      customerName: (project as any).customerName,
      projectId,
      fileName:    payload.fileName ?? entityId,
      attempts:    attempts ?? 5,
      lastError:   error ?? "Unknown error",
      retryUrl:    `${APP_URL}/settings/integrations`,
    });
  }
}

async function onWeeklyDigest() {
  if (!(await isEnabled("notifications.weeklyDigest"))) return;

  const weekEnding = new Date();
  const weekAgo    = new Date(Date.now() - 7 * 86_400_000);

  const [allProjects, newProjects, pendingSigs, complianceIssues] = await Promise.all([
    Project.count(),
    Project.count({ where: { createdAt: { [Op.gte]: weekAgo } } }),
    Signature.count({ where: { status: "pending" } }),
    // Count projects with any non-compliant checklist items — adjust to your Checklist model
    0, // replace: Checklist.count({ where: { status: "noncompliant" } })
  ]);

  const recentProjects = await Project.findAll({
    order:  [["updatedAt", "DESC"]],
    limit:  8,
    attributes: ["customerName", "address", "postcode", "status", "updatedAt"],
  });

  const recipients = await User.findAll({
    where: { role: ["Admin", "Surveyor"] as any, active: true },
  });

  for (const user of recipients) {
    await sendWeeklyDigest({
      to:            (user as any).email,
      recipientName: (user as any).name,
      weekEnding,
      stats: {
        totalProjects:     allProjects,
        newThisWeek:       newProjects,
        completedThisWeek: 0, // fill from your project status history
        pendingSignoffs:   pendingSigs,
        complianceIssues:  complianceIssues as number,
      },
      projects: recentProjects.map((p: any) => ({
        customerName: p.customerName,
        address:      `${p.address}, ${p.postcode}`,
        status:       p.status,
        updatedAt:    p.updatedAt,
      })),
      digestUrl: APP_URL,
    });
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

async function handleMessage(routingKey: string, payload: any): Promise<void> {
  console.log(`[EmailWorker] ← ${routingKey}`);
  switch (routingKey) {
    case "user.invited":              await onUserInvited(payload);           break;
    case "auth.passwordResetRequest": await onPasswordResetRequest(payload);  break;
    case "signature.requested":       await onSignatureRequested(payload);    break;
    case "signature.signed":          await onSignatureSigned(payload);       break;
    case "signatures.allCaptured":    await onAllSignaturesCaptured(payload); break;
    case "signature.declined":        await onSignatureDeclined(payload);     break;
    case "checklist.nonCompliant":    await onChecklistNonCompliant(payload); break;
    case "handover.generated":        await onHandoverGenerated(payload);     break;
    case "project.created":           await onProjectCreated(payload);        break;
    case "drive.syncFailed":          await onDriveSyncFailed(payload);       break;
    case "email.weeklyDigest":        await onWeeklyDigest();                         break;
    case "analytics.weeklyDigest":    await sendWeeklyAnalyticsDigest();              break;
    default: console.warn(`[EmailWorker] Unhandled: ${routingKey}`);
  }
}

// ─── Worker boot ──────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await sequelize.authenticate();
  console.log("[EmailWorker] DB connected.");

  let connection: Connection;
  let channel: Channel;

  const connect = async () => {
    connection = await amqp.connect(RABBITMQ_URL);
    channel    = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await channel.assertQueue(QUEUE, {
      durable:   true,
      arguments: { "x-dead-letter-exchange": `${EXCHANGE}.dlx` },
    });

    for (const key of ROUTING_KEYS) {
      await channel.bindQueue(QUEUE, EXCHANGE, key);
    }

    channel.prefetch(PREFETCH);
    console.log(`[EmailWorker] Ready. Listening on queue: ${QUEUE}`);

    channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      const routingKey = msg.fields.routingKey;
      let payload: any = {};

      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        channel.nack(msg, false, false);
        return;
      }

      try {
        await handleMessage(routingKey, payload);
        channel.ack(msg);
      } catch (err) {
        console.error(`[EmailWorker] Error on ${routingKey}:`, err);
        channel.nack(msg, false, !msg.fields.redelivered);
      }
    });

    connection.on("close", () => {
      console.warn("[EmailWorker] RabbitMQ closed. Reconnecting in 5s…");
      setTimeout(connect, 5_000);
    });
  };

  await connect();
}

process.on("SIGTERM", () => { console.log("[EmailWorker] Shutting down."); process.exit(0); });
process.on("SIGINT",  () => { console.log("[EmailWorker] Shutting down."); process.exit(0); });

start().catch(err => { console.error("[EmailWorker] Fatal:", err); process.exit(1); });
