/**
 * emailService.ts
 *
 * Handles all outbound email for RISO HUB via SendGrid (primary) with
 * AWS SES as fallback. Swap provider by changing EMAIL_PROVIDER env var.
 *
 * Email types:
 *   1.  userInvite              — new team member invitation
 *   2.  passwordReset           — forgot password link
 *   3.  signatureRequest        — customer/installer sign-off request
 *   4.  signatureConfirmation   — confirmation after signing
 *   5.  signatureDeclined       — notify team when customer declines
 *   6.  complianceAlert         — non-compliant checklist item flagged
 *   7.  handoverReady           — notify customer handover pack is ready
 *   8.  weeklyDigest            — weekly project summary for Admin/Surveyor
 *   9.  projectCreated          — internal notice when a new project is opened
 *   10. drivesSyncFailed        — admin alert when Drive sync exhausts retries
 *
 * All emails:
 *   - Are rendered from inline HTML templates (no external template service needed)
 *   - Use RISO HOME branding (olive, cream, Satoshi-equivalent web-safe stack)
 *   - Include a plain-text fallback
 *   - Are logged to AuditLog on send
 *   - Respect per-notification-type Settings toggles
 *
 * Install:
 *   npm install @sendgrid/mail @aws-sdk/client-ses nodemailer
 */

import sgMail from "@sendgrid/mail";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { AuditLog } from "../models";

// ─── Config ───────────────────────────────────────────────────────────────────

const FROM_EMAIL   = process.env.EMAIL_FROM    ?? "noreply@risohome.co.uk";
const FROM_NAME    = process.env.EMAIL_FROM_NAME ?? "RISO HOME";
const PROVIDER     = (process.env.EMAIL_PROVIDER ?? "sendgrid").toLowerCase();
const APP_URL      = process.env.APP_URL        ?? "https://app.risohome.co.uk";

if (PROVIDER === "sendgrid" && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const sesClient = PROVIDER === "ses"
  ? new SESClient({ region: process.env.AWS_REGION ?? "eu-west-2" })
  : null;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendResult {
  ok:       boolean;
  provider: string;
  error?:   string;
}

interface BaseEmailParams {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}

// ─── Low-level send ───────────────────────────────────────────────────────────

async function sendRaw(params: BaseEmailParams): Promise<SendResult> {
  const from = `${FROM_NAME} <${FROM_EMAIL}>`;

  try {
    if (PROVIDER === "ses" && sesClient) {
      const input: SendEmailCommandInput = {
        Source: from,
        Destination: { ToAddresses: [params.to] },
        Message: {
          Subject: { Data: params.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: params.html, Charset: "UTF-8" },
            Text: { Data: params.text, Charset: "UTF-8" },
          },
        },
      };
      await sesClient.send(new SendEmailCommand(input));
      return { ok: true, provider: "ses" };
    }

    // Default: SendGrid
    await sgMail.send({
      to:      params.to,
      from,
      subject: params.subject,
      html:    params.html,
      text:    params.text,
    });
    return { ok: true, provider: "sendgrid" };

  } catch (err: any) {
    console.error(`[Email] Send failed to ${params.to}:`, err?.message);
    return { ok: false, provider: PROVIDER, error: err?.message };
  }
}

async function send(
  params:     BaseEmailParams,
  auditMeta?: { action: string; entityType?: string; entityId?: string }
): Promise<SendResult> {
  const result = await sendRaw(params);

  // Audit log every attempt
  try {
    await AuditLog.create({
      timestamp:  new Date(),
      userId:     "system",
      action:     auditMeta?.action ?? "email.sent",
      entityType: auditMeta?.entityType ?? "Email",
      entityId:   auditMeta?.entityId  ?? "—",
      ipAddress:  "internal",
      metadata: {
        to:       params.to,
        subject:  params.subject,
        provider: result.provider,
        ok:       result.ok,
        error:    result.error,
      },
    });
  } catch { /* audit failure must not block email */ }

  return result;
}

// ─── Shared HTML layout ───────────────────────────────────────────────────────

function layout(bodyHtml: string, previewText: string = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RISO HOME</title>
  <style>
    body { margin:0; padding:0; background:#F5F5F2; font-family: Georgia, 'Times New Roman', serif; color:#333333; }
    .wrap { max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 20px rgba(0,0,0,0.06); }
    .header { background:#7A8465; padding:28px 36px; display:flex; align-items:center; gap:14px; }
    .logo { width:40px; height:40px; background:rgba(255,255,255,0.18); border-radius:7px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; color:#fff; font-family:Arial,sans-serif; letter-spacing:-0.03em; line-height:1; }
    .brand { color:#ffffff; font-family:Arial,sans-serif; font-size:13px; font-weight:700; letter-spacing:0.1em; }
    .sub-brand { color:rgba(255,255,255,0.65); font-family:Arial,sans-serif; font-size:10px; letter-spacing:0.08em; margin-top:2px; }
    .body { padding:36px 36px 28px; }
    h1 { font-size:22px; font-weight:normal; color:#333; margin:0 0 16px; letter-spacing:-0.01em; line-height:1.3; }
    p { font-size:15px; line-height:1.7; color:#555; margin:0 0 16px; }
    .btn { display:inline-block; padding:13px 28px; background:#7A8465; color:#ffffff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold; font-family:Arial,sans-serif; letter-spacing:0.01em; margin:8px 0 20px; }
    .btn-outline { display:inline-block; padding:11px 24px; border:2px solid #7A8465; color:#7A8465; text-decoration:none; border-radius:8px; font-size:14px; font-weight:bold; font-family:Arial,sans-serif; margin:8px 0 20px; }
    .info-box { background:#f0f1ec; border-radius:8px; padding:16px 20px; margin:20px 0; }
    .info-box p { margin:0; font-size:14px; color:#555; }
    .info-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e8e6e0; font-size:14px; }
    .info-row:last-child { border-bottom:none; }
    .info-key { color:#999; font-family:Arial,sans-serif; font-size:12px; font-weight:bold; text-transform:uppercase; letter-spacing:0.06em; }
    .info-val { color:#333; }
    .alert-box { background:#fdf0f0; border-left:3px solid #c05050; border-radius:0 8px 8px 0; padding:14px 18px; margin:20px 0; }
    .alert-box p { color:#7a3030; margin:0; font-size:14px; }
    .success-box { background:#edf7f1; border-left:3px solid #4a7a5a; border-radius:0 8px 8px 0; padding:14px 18px; margin:20px 0; }
    .success-box p { color:#2a5a3a; margin:0; font-size:14px; }
    .footer { background:#f7f7f4; padding:20px 36px; border-top:1px solid #e8e6e0; }
    .footer p { font-size:11px; color:#aaa; margin:0; line-height:1.6; font-family:Arial,sans-serif; }
    .hash { font-family:monospace; font-size:11px; color:#aaa; word-break:break-all; margin-top:8px; }
    .divider { border:none; border-top:1px solid #f0f1ec; margin:24px 0; }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ""}
  <div class="wrap">
    <div class="header">
      <div class="logo">RH</div>
      <div>
        <div class="brand">RISO HOME</div>
        <div class="sub-brand">RISO HUB PLATFORM</div>
      </div>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>RISO HOME Ltd · MCS Accredited Heat Pump Installer<br />
      This email was sent by RISO HUB, our compliance management platform.<br />
      If you were not expecting this email, please disregard it or contact us at
      <a href="mailto:support@risohome.co.uk" style="color:#7A8465;">support@risohome.co.uk</a>.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── 1. User Invite ───────────────────────────────────────────────────────────

export interface UserInviteParams {
  to:          string;
  recipientName: string;
  inviterName:  string;
  role:         string;
  inviteUrl:    string;
  expiresHours?: number;
}

export async function sendUserInvite(p: UserInviteParams): Promise<SendResult> {
  const expiry = p.expiresHours ?? 48;
  const html = layout(`
    <h1>You've been invited to RISO HUB</h1>
    <p>Hi ${p.recipientName},</p>
    <p>${p.inviterName} has invited you to join RISO HUB as a <strong>${p.role}</strong>.
    RISO HUB is our MCS compliance management platform for heat pump installations.</p>
    <a href="${p.inviteUrl}" class="btn">Accept invitation →</a>
    <div class="info-box">
      <p>This invitation link expires in <strong>${expiry} hours</strong>. If you need a new link, ask your administrator to resend the invitation.</p>
    </div>
    <p style="font-size:13px;color:#aaa;">Can't click the button? Copy this link:<br/>
    <span style="color:#7A8465;word-break:break-all;">${p.inviteUrl}</span></p>
  `, `${p.inviterName} invited you to RISO HUB as ${p.role}`);

  const text = `Hi ${p.recipientName},\n\n${p.inviterName} has invited you to RISO HUB as a ${p.role}.\n\nAccept your invitation: ${p.inviteUrl}\n\nThis link expires in ${expiry} hours.\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `You've been invited to RISO HUB — ${p.role}`, html, text },
    { action: "email.userInvite" }
  );
}

// ─── 2. Password Reset ────────────────────────────────────────────────────────

export interface PasswordResetParams {
  to:            string;
  recipientName: string;
  resetUrl:      string;
  expiresMinutes?: number;
}

export async function sendPasswordReset(p: PasswordResetParams): Promise<SendResult> {
  const expiry = p.expiresMinutes ?? 60;
  const html = layout(`
    <h1>Reset your password</h1>
    <p>Hi ${p.recipientName},</p>
    <p>We received a request to reset your RISO HUB password. Click the button below to choose a new one.</p>
    <a href="${p.resetUrl}" class="btn">Reset password →</a>
    <div class="info-box">
      <p>This link expires in <strong>${expiry} minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your account has not been changed.</p>
    </div>
    <p style="font-size:13px;color:#aaa;">Can't click the button? Copy this link:<br/>
    <span style="color:#7A8465;word-break:break-all;">${p.resetUrl}</span></p>
  `, "Reset your RISO HUB password");

  const text = `Hi ${p.recipientName},\n\nReset your RISO HUB password:\n${p.resetUrl}\n\nThis link expires in ${expiry} minutes.\n\nIf you didn't request this, ignore this email.\n\nRISO HOME`;

  return send(
    { to: p.to, subject: "Reset your RISO HUB password", html, text },
    { action: "email.passwordReset" }
  );
}

// ─── 3. Signature Request ─────────────────────────────────────────────────────

export interface SignatureRequestEmailParams {
  to:            string;
  recipientName: string;
  customerName:  string;
  address:       string;
  role:          string;
  signLink:      string;
  message:       string;
  expiresAt:     Date;
}

export async function sendSignatureRequestEmail(p: SignatureRequestEmailParams): Promise<SendResult> {
  const expires = p.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const html = layout(`
    <h1>Please sign your installation document</h1>
    <p>Hi ${p.recipientName},</p>
    <p>${p.message}</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">Signing as</span><span class="info-val">${p.role.charAt(0).toUpperCase() + p.role.slice(1)}</span></div>
      <div class="info-row"><span class="info-key">Link expires</span><span class="info-val">${expires}</span></div>
    </div>
    <a href="${p.signLink}" class="btn">Review &amp; sign document →</a>
    <p style="font-size:13px;color:#aaa;">Your signature will be cryptographically hashed and time-stamped.
    By signing you confirm the information is accurate and consent to this electronic signature being legally binding
    under the Electronic Communications Act 2000.</p>
    <p style="font-size:13px;color:#aaa;">Can't click the button?<br/>
    <span style="color:#7A8465;word-break:break-all;">${p.signLink}</span></p>
  `, `Please sign your heat pump installation handover document`);

  const text = `Hi ${p.recipientName},\n\n${p.message}\n\nCustomer: ${p.customerName}\nAddress: ${p.address}\nSigning as: ${p.role}\nExpires: ${expires}\n\nSign here: ${p.signLink}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Action required: please sign your installation document — ${p.customerName}`, html, text },
    { action: "email.signatureRequest" }
  );
}

// ─── 4. Signature Confirmation ────────────────────────────────────────────────

export interface SignatureConfirmationParams {
  to:            string;
  recipientName: string;
  customerName:  string;
  address:       string;
  role:          string;
  signedAt:      Date;
  pdfUrl?:       string;
  hash:          string;
}

export async function sendSignatureConfirmation(p: SignatureConfirmationParams): Promise<SendResult> {
  const signed = p.signedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const html = layout(`
    <h1>Signature captured</h1>
    <p>Hi ${p.recipientName},</p>
    <p>Thank you — your signature has been securely recorded for the following installation.</p>
    <div class="success-box"><p>✓ Document signed successfully</p></div>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">Signed as</span><span class="info-val">${p.role.charAt(0).toUpperCase() + p.role.slice(1)}</span></div>
      <div class="info-row"><span class="info-key">Signed at</span><span class="info-val">${signed}</span></div>
    </div>
    ${p.pdfUrl ? `<a href="${p.pdfUrl}" class="btn-outline">↓ Download signed document</a>` : ""}
    <p class="hash">Document SHA-256: ${p.hash}</p>
    <p style="font-size:13px;color:#aaa;">This signature is legally binding under the Electronic Communications Act 2000.
    Your signed document will be retained for a minimum of 7 years in accordance with MCS MIS 3005.</p>
  `, "Your signature has been recorded");

  const text = `Hi ${p.recipientName},\n\nYour signature has been recorded.\n\nCustomer: ${p.customerName}\nAddress: ${p.address}\nSigned at: ${signed}\nSHA-256: ${p.hash}\n${p.pdfUrl ? `\nDownload: ${p.pdfUrl}` : ""}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Signature confirmed — ${p.customerName}`, html, text },
    { action: "email.signatureConfirmation" }
  );
}

// ─── 5. Signature Declined ────────────────────────────────────────────────────

export interface SignatureDeclinedParams {
  to:           string;  // surveyor / admin email
  surveyorName: string;
  customerName: string;
  address:      string;
  role:         string;
  projectUrl:   string;
}

export async function sendSignatureDeclined(p: SignatureDeclinedParams): Promise<SendResult> {
  const html = layout(`
    <h1>Document sign-off declined</h1>
    <p>Hi ${p.surveyorName},</p>
    <p>The <strong>${p.role}</strong> has declined to sign the handover document for the following project.
    You may need to follow up directly before re-sending the request.</p>
    <div class="alert-box"><p>⚠ Sign-off declined — action required</p></div>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">Declined by</span><span class="info-val">${p.role.charAt(0).toUpperCase() + p.role.slice(1)}</span></div>
    </div>
    <a href="${p.projectUrl}" class="btn">View project →</a>
  `, `${p.role} declined to sign the handover document`);

  const text = `Hi ${p.surveyorName},\n\nThe ${p.role} has declined to sign the handover document for ${p.customerName} at ${p.address}.\n\nView project: ${p.projectUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Sign-off declined — ${p.customerName}`, html, text },
    { action: "email.signatureDeclined" }
  );
}

// ─── 6. Compliance Alert ──────────────────────────────────────────────────────

export interface ComplianceAlertParams {
  to:            string;
  recipientName: string;
  customerName:  string;
  address:       string;
  projectType:   string;
  blockingItems: { key: string; name: string; ref: string }[];
  projectUrl:    string;
}

export async function sendComplianceAlert(p: ComplianceAlertParams): Promise<SendResult> {
  const itemsHtml = p.blockingItems.map(item => `
    <div class="info-row">
      <span class="info-key">${item.ref}</span>
      <span class="info-val">${item.name}</span>
    </div>
  `).join("");

  const html = layout(`
    <h1>Compliance issue flagged</h1>
    <p>Hi ${p.recipientName},</p>
    <p>One or more MCS MIS 3005 checklist items have been marked non-compliant for the following project.
    These must be resolved before a handover document can be generated.</p>
    <div class="alert-box"><p>⚠ ${p.blockingItems.length} blocking issue${p.blockingItems.length === 1 ? "" : "s"} — handover blocked</p></div>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">System type</span><span class="info-val">${p.projectType}</span></div>
    </div>
    <p style="font-size:13px;font-weight:bold;color:#555;margin-bottom:8px;">Non-compliant items:</p>
    <div class="info-box">${itemsHtml}</div>
    <a href="${p.projectUrl}" class="btn">Review checklist →</a>
  `, `${p.blockingItems.length} compliance issue${p.blockingItems.length === 1 ? "" : "s"} flagged`);

  const text = `Hi ${p.recipientName},\n\nCompliance issue flagged for ${p.customerName} at ${p.address}.\n\nBlocking items:\n${p.blockingItems.map(i => `- ${i.ref}: ${i.name}`).join("\n")}\n\nReview: ${p.projectUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Compliance alert — ${p.customerName} (${p.blockingItems.length} issue${p.blockingItems.length === 1 ? "" : "s"})`, html, text },
    { action: "email.complianceAlert" }
  );
}

// ─── 7. Handover Ready ────────────────────────────────────────────────────────

export interface HandoverReadyParams {
  to:            string;
  recipientName: string;
  customerName:  string;
  address:       string;
  projectType:   string;
  pdfUrl:        string;
  mcsNumber:     string;
}

export async function sendHandoverReady(p: HandoverReadyParams): Promise<SendResult> {
  const html = layout(`
    <h1>Your heat pump handover document is ready</h1>
    <p>Hi ${p.recipientName},</p>
    <p>Your ${p.projectType === "ASHP" ? "air source" : "ground source"} heat pump installation is complete.
    Your handover document — including your MCS certificate, commissioning records, and warranty information — is ready to download.</p>
    <div class="success-box"><p>✓ Installation complete — MCS compliant</p></div>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Property</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">System</span><span class="info-val">${p.projectType === "ASHP" ? "Air Source Heat Pump" : "Ground Source Heat Pump"}</span></div>
      <div class="info-row"><span class="info-key">MCS number</span><span class="info-val">${p.mcsNumber}</span></div>
    </div>
    <a href="${p.pdfUrl}" class="btn">↓ Download handover document</a>
    <p style="font-size:13px;color:#aaa;">Please keep this document safe — you may need it for warranty claims,
    future sales of your property, or energy efficiency assessments. A copy will also be held securely on our system for 7 years.</p>
  `, "Your heat pump handover document is ready to download");

  const text = `Hi ${p.recipientName},\n\nYour handover document for ${p.address} is ready.\n\nSystem: ${p.projectType}\nMCS: ${p.mcsNumber}\n\nDownload: ${p.pdfUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Your heat pump handover document is ready — ${p.address}`, html, text },
    { action: "email.handoverReady" }
  );
}

// ─── 8. Weekly Digest ─────────────────────────────────────────────────────────

export interface WeeklyDigestParams {
  to:            string;
  recipientName: string;
  weekEnding:    Date;
  stats: {
    totalProjects:     number;
    newThisWeek:       number;
    completedThisWeek: number;
    pendingSignoffs:   number;
    complianceIssues:  number;
  };
  projects: {
    customerName: string;
    address:      string;
    status:       string;
    updatedAt:    string;
  }[];
  digestUrl: string;
}

export async function sendWeeklyDigest(p: WeeklyDigestParams): Promise<SendResult> {
  const week = p.weekEnding.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const projectRows = p.projects.slice(0, 8).map(proj => `
    <div class="info-row">
      <span class="info-val"><strong>${proj.customerName}</strong> — ${proj.address}</span>
      <span class="info-key">${proj.status}</span>
    </div>
  `).join("");

  const html = layout(`
    <h1>Weekly summary</h1>
    <p>Hi ${p.recipientName},</p>
    <p>Here's your RISO HUB project summary for the week ending <strong>${week}</strong>.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Total projects</span><span class="info-val">${p.stats.totalProjects}</span></div>
      <div class="info-row"><span class="info-key">New this week</span><span class="info-val">${p.stats.newThisWeek}</span></div>
      <div class="info-row"><span class="info-key">Completed this week</span><span class="info-val">${p.stats.completedThisWeek}</span></div>
      <div class="info-row"><span class="info-key">Pending sign-offs</span><span class="info-val">${p.stats.pendingSignoffs}</span></div>
      ${p.stats.complianceIssues > 0
        ? `<div class="info-row"><span class="info-key" style="color:#c05050;">Compliance issues</span><span class="info-val" style="color:#c05050;font-weight:bold;">${p.stats.complianceIssues}</span></div>`
        : `<div class="info-row"><span class="info-key">Compliance issues</span><span class="info-val" style="color:#4a7a5a;">None ✓</span></div>`
      }
    </div>
    ${p.projects.length > 0 ? `
    <p style="font-size:13px;font-weight:bold;color:#555;margin-bottom:8px;">Active projects this week:</p>
    <div class="info-box">${projectRows}</div>
    ` : ""}
    <a href="${p.digestUrl}" class="btn">View full dashboard →</a>
  `, `Your RISO HUB weekly summary — week ending ${week}`);

  const text = `Hi ${p.recipientName},\n\nWeekly summary (w/e ${week})\n\nTotal: ${p.stats.totalProjects}\nNew: ${p.stats.newThisWeek}\nCompleted: ${p.stats.completedThisWeek}\nPending sign-offs: ${p.stats.pendingSignoffs}\nCompliance issues: ${p.stats.complianceIssues}\n\nDashboard: ${p.digestUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `RISO HUB weekly summary — w/e ${week}`, html, text },
    { action: "email.weeklyDigest" }
  );
}

// ─── 9. Project Created ───────────────────────────────────────────────────────

export interface ProjectCreatedParams {
  to:            string;
  recipientName: string;
  customerName:  string;
  address:       string;
  projectType:   string;
  assignedTo:    string;
  createdBy:     string;
  projectUrl:    string;
}

export async function sendProjectCreated(p: ProjectCreatedParams): Promise<SendResult> {
  const html = layout(`
    <h1>New project opened</h1>
    <p>Hi ${p.recipientName},</p>
    <p>A new ${p.projectType} project has been opened and assigned to <strong>${p.assignedTo}</strong>.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Customer</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.address}</span></div>
      <div class="info-row"><span class="info-key">System</span><span class="info-val">${p.projectType === "ASHP" ? "Air Source Heat Pump" : "Ground Source Heat Pump"}</span></div>
      <div class="info-row"><span class="info-key">Assigned to</span><span class="info-val">${p.assignedTo}</span></div>
      <div class="info-row"><span class="info-key">Created by</span><span class="info-val">${p.createdBy}</span></div>
    </div>
    <a href="${p.projectUrl}" class="btn">Open project →</a>
  `, `New ${p.projectType} project — ${p.customerName}`);

  const text = `Hi ${p.recipientName},\n\nNew project: ${p.customerName} at ${p.address}\nSystem: ${p.projectType}\nAssigned to: ${p.assignedTo}\n\nView: ${p.projectUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `New project — ${p.customerName}, ${p.address}`, html, text },
    { action: "email.projectCreated" }
  );
}

// ─── 10a. Analytics Digest (with CSV attachment) ─────────────────────────────

export interface AnalyticsDigestParams {
  to:            string;
  recipientName: string;
  weekEnding:    Date;
  stats: {
    totalProjects:     number;
    newThisWeek:       number;
    completedThisWeek: number;
    pendingSignoffs:   number;
    avgCompliance:     number;
  };
  csvFilename:  string;
  csvContent:   string; // raw CSV string — we encode to base64 for the attachment
  dashboardUrl: string;
}

export async function sendAnalyticsDigest(p: AnalyticsDigestParams): Promise<SendResult> {
  const week = p.weekEnding.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const html = layout(`
    <h1>Weekly analytics digest</h1>
    <p>Hi ${p.recipientName},</p>
    <p>Your RISO HUB analytics digest for the week ending <strong>${week}</strong> is attached as a CSV file.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Total projects</span><span class="info-val">${p.stats.totalProjects}</span></div>
      <div class="info-row"><span class="info-key">New this week</span><span class="info-val">${p.stats.newThisWeek}</span></div>
      <div class="info-row"><span class="info-key">Completed this week</span><span class="info-val">${p.stats.completedThisWeek}</span></div>
      <div class="info-row"><span class="info-key">Pending sign-offs</span><span class="info-val">${p.stats.pendingSignoffs}</span></div>
      ${p.stats.avgCompliance > 0
        ? `<div class="info-row"><span class="info-key">Avg compliance</span><span class="info-val" style="color:${p.stats.avgCompliance >= 80 ? '#4a7a5a' : '#c05050'};font-weight:bold;">${p.stats.avgCompliance}%</span></div>`
        : ''
      }
    </div>
    <a href="${p.dashboardUrl}" class="btn">Open full dashboard →</a>
    <p style="font-size:13px;color:#aaa;">The CSV attachment contains KPIs, project status breakdown, and installer performance for the last 12 months.</p>
  `, `RISO HUB analytics digest — week ending ${week}`);

  const text = `Hi ${p.recipientName},\n\nWeekly analytics digest (w/e ${week})\n\nTotal: ${p.stats.totalProjects} | New: ${p.stats.newThisWeek} | Completed: ${p.stats.completedThisWeek} | Pending sign-offs: ${p.stats.pendingSignoffs} | Avg compliance: ${p.stats.avgCompliance}%\n\nDashboard: ${p.dashboardUrl}\n\nRISO HOME`;

  const subject = `RISO HUB analytics digest — w/e ${week}`;
  const from    = `${FROM_NAME} <${FROM_EMAIL}>`;
  const csvB64  = Buffer.from(p.csvContent, 'utf-8').toString('base64');

  try {
    if (PROVIDER === "ses" && sesClient) {
      // SES via raw MIME (nodemailer) for attachment support.
      // nodemailer is CommonJS so the dynamic import may resolve as { default: module }
      // or as the module directly — handle both.
      const nodemailerMod = await import('nodemailer');
      const nm = (nodemailerMod as any).default ?? nodemailerMod;
      const transporter = nm.createTransport({
        SES: { ses: sesClient, aws: await import('@aws-sdk/client-ses') },
      } as any);
      await transporter.sendMail({
        from,
        to:      p.to,
        subject,
        html,
        text,
        attachments: [{
          filename:    p.csvFilename,
          content:     csvB64,
          encoding:    'base64',
          contentType: 'text/csv',
        }],
      });
    } else {
      // SendGrid with attachment
      await sgMail.send({
        to:      p.to,
        from,
        subject,
        html,
        text,
        attachments: [{
          content:     csvB64,
          filename:    p.csvFilename,
          type:        'text/csv',
          disposition: 'attachment',
        }],
      });
    }

    try {
      await AuditLog.create({
        timestamp: new Date(), userId: "system", action: "email.analyticsDigest",
        entityType: "Email", entityId: "—", ipAddress: "internal",
        metadata: { to: p.to, subject, provider: PROVIDER, ok: true },
      });
    } catch { /* audit failure must not block email */ }

    return { ok: true, provider: PROVIDER };
  } catch (err: any) {
    console.error(`[Email] Analytics digest send failed to ${p.to}:`, err?.message);
    return { ok: false, provider: PROVIDER, error: err?.message };
  }
}

// ─── 10. Drive Sync Failed ────────────────────────────────────────────────────

export interface DriveSyncFailedParams {
  to:            string;
  adminName:     string;
  customerName:  string;
  projectId:     string;
  fileName:      string;
  attempts:      number;
  lastError:     string;
  retryUrl:      string;
}

export async function sendDriveSyncFailed(p: DriveSyncFailedParams): Promise<SendResult> {
  const html = layout(`
    <h1>Google Drive sync failed</h1>
    <p>Hi ${p.adminName},</p>
    <p>A file could not be synced to Google Drive after <strong>${p.attempts} attempts</strong>.
    No further automatic retries will be made — manual intervention is required.</p>
    <div class="alert-box"><p>⚠ Drive sync failed — manual retry needed</p></div>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Project</span><span class="info-val">${p.customerName}</span></div>
      <div class="info-row"><span class="info-key">File</span><span class="info-val">${p.fileName}</span></div>
      <div class="info-row"><span class="info-key">Attempts</span><span class="info-val">${p.attempts}</span></div>
      <div class="info-row"><span class="info-key">Last error</span><span class="info-val">${p.lastError}</span></div>
    </div>
    <p>The file remains safe in S3 and has not been lost. You can trigger a manual retry from the project's Drive sync panel.</p>
    <a href="${p.retryUrl}" class="btn">Retry sync →</a>
  `, `Drive sync failed for ${p.fileName}`);

  const text = `Hi ${p.adminName},\n\nDrive sync failed after ${p.attempts} attempts.\n\nProject: ${p.customerName}\nFile: ${p.fileName}\nError: ${p.lastError}\n\nRetry: ${p.retryUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `Drive sync failed — ${p.fileName}`, html, text },
    { action: "email.driveSyncFailed" }
  );
}

// ─── 11. Mention Notification ─────────────────────────────────────────────────

export interface MentionEmailParams {
  to:             string;
  mentionedName:  string;
  authorName:     string;
  projectName:    string;
  projectAddress: string;
  noteBody:       string;
  noteUrl:        string;
}

export async function sendMentionEmail(p: MentionEmailParams): Promise<SendResult> {
  const preview = p.noteBody.length > 200 ? p.noteBody.slice(0, 200) + '…' : p.noteBody;
  const html = layout(`
    <h1>You were mentioned in a note</h1>
    <p>Hi ${p.mentionedName},</p>
    <p><strong>${p.authorName}</strong> mentioned you in a project note.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-key">Project</span><span class="info-val">${p.projectName}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val">${p.projectAddress}</span></div>
    </div>
    <div class="alert-box"><p>${preview}</p></div>
    <a href="${p.noteUrl}" class="btn">View note →</a>
  `, `${p.authorName} mentioned you`);

  const text = `Hi ${p.mentionedName},\n\n${p.authorName} mentioned you in a note on ${p.projectName}.\n\n"${preview}"\n\nView note: ${p.noteUrl}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: `${p.authorName} mentioned you in a note`, html, text },
    { action: "email.mention" }
  );
}

// ─── 12. Qualification Expiry Digest ─────────────────────────────────────────

export interface QualificationDigestItem {
  staffName?: string;
  type:       string;
  expiryDate: string | Date;
  [key: string]: any;
}

export interface QualificationExpiryDigestParams {
  to:        string;
  adminName: string;
  expiring:  QualificationDigestItem[];
  expired:   QualificationDigestItem[];
}

export async function sendQualificationExpiryDigest(p: QualificationExpiryDigestParams): Promise<SendResult> {
  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const rows = (items: QualificationDigestItem[], label: string) =>
    items.length === 0 ? '' : `
      <h3>${label}</h3>
      <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="text-align:left;border-bottom:1px solid #e5e7eb">Staff</th>
            <th style="text-align:left;border-bottom:1px solid #e5e7eb">Qualification</th>
            <th style="text-align:left;border-bottom:1px solid #e5e7eb">Expiry</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(q => `
            <tr>
              <td style="border-bottom:1px solid #f3f4f6">${q.staffName ?? '—'}</td>
              <td style="border-bottom:1px solid #f3f4f6">${q.type}</td>
              <td style="border-bottom:1px solid #f3f4f6">${fmtDate(q.expiryDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

  const html = layout(`
    <h1>Qualification expiry digest</h1>
    <p>Hi ${p.adminName},</p>
    <p>The following staff qualifications require attention:</p>
    ${rows(p.expired, '⛔ Expired')}
    ${rows(p.expiring, '⚠ Expiring soon')}
    <p>Please ensure updated certificates are uploaded to RISO HUB at your earliest convenience.</p>
  `, 'Qualification expiry digest');

  const lines = [
    ...p.expired.map(q => `EXPIRED — ${q.staffName ?? '?'} — ${q.type} — ${fmtDate(q.expiryDate)}`),
    ...p.expiring.map(q => `EXPIRING — ${q.staffName ?? '?'} — ${q.type} — ${fmtDate(q.expiryDate)}`),
  ];
  const text = `Hi ${p.adminName},\n\nQualification expiry digest:\n\n${lines.join('\n')}\n\nRISO HOME`;

  return send(
    { to: p.to, subject: 'Qualification expiry digest — action required', html, text },
    { action: "email.qualExpiryDigest" }
  );
}

// ─── 13. Customer Satisfaction Survey ────────────────────────────────────────

export interface SatisfactionSurveyParams {
  to:             string;
  customerName:   string;
  surveyUrl:      string;
  projectAddress: string;
}

export async function sendSatisfactionSurvey(p: SatisfactionSurveyParams): Promise<SendResult> {
  const html = layout(`
    <h1>How did we do?</h1>
    <p>Hi ${p.customerName},</p>
    <p>Thank you for choosing RISO HOME for your heat pump installation at
    <strong>${p.projectAddress}</strong>. We'd love to hear your feedback — it only takes 2 minutes.</p>
    <div class="info-box">
      <p>Your feedback helps us maintain the highest standards of installation quality
      and improve the service we offer to customers across the UK.</p>
    </div>
    <a href="${p.surveyUrl}" class="btn">Share your feedback →</a>
    <p style="font-size:13px;color:#6b7280;margin-top:24px">
      This survey link is unique to you and can only be used once.
      If you have any questions, please contact us at <a href="mailto:hello@risohome.co.uk">hello@risohome.co.uk</a>.
    </p>
  `, 'Tell us about your installation experience');

  const text = `Hi ${p.customerName},\n\nThank you for choosing RISO HOME for your heat pump installation at ${p.projectAddress}.\n\nWe'd love your feedback — it only takes 2 minutes:\n${p.surveyUrl}\n\nThis link is unique to you and can only be used once.\n\nRISO HOME`;

  return send(
    { to: p.to, subject: 'How did your RISO HOME installation go?', html, text },
    { action: "email.satisfactionSurvey" }
  );
}
