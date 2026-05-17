/**
 * qualificationEmailHandlers.ts
 *
 * Additions to emailService.ts and emailWorker.ts for qualification expiry alerts.
 *
 * HOW TO INTEGRATE:
 *
 * 1. Copy sendQualificationExpiryDigest() into emailService.ts
 * 2. Add the two routing keys and handlers into emailWorker.ts's ROUTING_KEYS
 *    array and handleMessage() switch statement.
 * 3. Schedule checkExpiringQualifications() daily (node-cron or Lambda):
 *
 *    // In a node-cron setup inside your main server or a dedicated cron worker:
 *    import cron from 'node-cron';
 *    import { checkExpiringQualifications } from './qualificationService';
 *    cron.schedule('0 8 * * *', checkExpiringQualifications); // 08:00 daily
 */

import { SendResult } from "./emailService";

// ─── Email: Qualification Expiry Digest ───────────────────────────────────────
// Add this function to emailService.ts

export interface QualExpiryDigestParams {
  to:            string;
  adminName:     string;
  expiring: {
    staffName:    string;
    type:         string;
    expiresAt:    string;
    daysRemaining: number;
  }[];
  expired: {
    staffName: string;
    type:      string;
    expiresAt: string;
  }[];
  dashboardUrl: string;
}

// Copy this into emailService.ts alongside the other send functions:
export async function sendQualificationExpiryDigest(
  p: QualExpiryDigestParams
): Promise<SendResult> {
  // Inline layout function — replace with the shared layout() from emailService.ts
  const layout = (body: string) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#F5F5F2;font-family:Georgia,serif;color:#333}
  .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.06)}
  .hdr{background:#7A8465;padding:28px 36px;display:flex;align-items:center;gap:14px}
  .logo{width:40px;height:40px;background:rgba(255,255,255,.18);border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;font-family:Arial,sans-serif;letter-spacing:-.03em}
  .brand{color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:.1em}
  .body{padding:36px 36px 28px}
  h1{font-size:22px;font-weight:normal;color:#333;margin:0 0 16px;letter-spacing:-.01em}
  p{font-size:15px;line-height:1.7;color:#555;margin:0 0 16px}
  .btn{display:inline-block;padding:13px 28px;background:#7A8465;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;font-family:Arial,sans-serif}
  .section{margin:20px 0}
  .section-title{font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#999;font-family:Arial,sans-serif;margin:0 0 10px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:8px;margin-bottom:6px;font-size:14px}
  .expired-row{background:#fdf0f0;border-left:3px solid #c05050}
  .expiring-row{background:#fdf6e3;border-left:3px solid #d4a828}
  .staff{font-weight:600;color:#333}
  .qual{color:#555;font-size:13px}
  .date{font-size:12px;color:#999;font-family:Arial,sans-serif}
  .days{font-size:12px;font-weight:bold;color:#8a7a50}
  .footer{background:#f7f7f4;padding:20px 36px;border-top:1px solid #e8e6e0}
  .footer p{font-size:11px;color:#aaa;margin:0;line-height:1.6;font-family:Arial,sans-serif}
</style></head><body>
<div class="wrap">
  <div class="hdr"><div class="logo">RH</div><div><div class="brand">RISO HOME</div></div></div>
  <div class="body">${body}</div>
  <div class="footer"><p>RISO HOME Ltd · MCS Accredited Heat Pump Installer<br/>This is an automated qualification compliance alert from RISO HUB.</p></div>
</div></body></html>`;

  const expiredRows = p.expired.map(e => `
    <div class="row expired-row">
      <div><div class="staff">${e.staffName}</div><div class="qual">${e.type}</div></div>
      <div class="date">Expired ${new Date(e.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
    </div>
  `).join("");

  const expiringRows = p.expiring.map(e => `
    <div class="row expiring-row">
      <div><div class="staff">${e.staffName}</div><div class="qual">${e.type}</div></div>
      <div><div class="days">${e.daysRemaining}d remaining</div><div class="date">Expires ${new Date(e.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div></div>
    </div>
  `).join("");

  const totalIssues = p.expired.length + p.expiring.length;

  const html = layout(`
    <h1>Qualification compliance alert</h1>
    <p>Hi ${p.adminName},</p>
    <p>Your daily qualification review has flagged <strong>${totalIssues} issue${totalIssues === 1 ? "" : "s"}</strong>
    that require attention before your next MCS audit.</p>

    ${p.expired.length > 0 ? `
    <div class="section">
      <div class="section-title">⚠ Expired (${p.expired.length}) — action required</div>
      ${expiredRows}
    </div>` : ""}

    ${p.expiring.length > 0 ? `
    <div class="section">
      <div class="section-title">Expiring within 60 days (${p.expiring.length})</div>
      ${expiringRows}
    </div>` : ""}

    <a href="${p.dashboardUrl}/qualifications" class="btn">Review qualifications →</a>
    <p style="font-size:13px;color:#aaa;margin-top:20px">
      MCS MIS 3005 requires all installers to hold valid, current qualifications.
      Expired qualifications may result in non-compliance during audit.
    </p>
  `);

  const text = [
    `Hi ${p.adminName},`,
    ``,
    `Qualification compliance alert — ${totalIssues} issue${totalIssues === 1 ? "" : "s"} found.`,
    ``,
    p.expired.length > 0 ? `EXPIRED:\n${p.expired.map(e => `  - ${e.staffName}: ${e.type} (expired ${e.expiresAt})`).join("\n")}` : "",
    p.expiring.length > 0 ? `EXPIRING SOON:\n${p.expiring.map(e => `  - ${e.staffName}: ${e.type} (${e.daysRemaining}d remaining)`).join("\n")}` : "",
    ``,
    `Review: ${p.dashboardUrl}/qualifications`,
    ``,
    `RISO HOME`,
  ].filter(Boolean).join("\n");

  // Use the shared send() from emailService.ts — shown here for clarity:
  const { default: sgMail } = await import("@sendgrid/mail");
  const FROM_EMAIL  = process.env.EMAIL_FROM      ?? "noreply@risohome.co.uk";
  const FROM_NAME   = process.env.EMAIL_FROM_NAME ?? "RISO HOME";

  try {
    await sgMail.send({
      to:      p.to,
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      subject: `Qualification alert — ${p.expired.length} expired, ${p.expiring.length} expiring`,
      html,
      text,
    });
    return { ok: true, provider: "sendgrid" };
  } catch (err: any) {
    return { ok: false, provider: "sendgrid", error: err?.message };
  }
}

// ─── emailWorker.ts additions ─────────────────────────────────────────────────
// Add these to your emailWorker.ts:

/*

// Add to ROUTING_KEYS array:
"qualification.expiring",
"qualification.expired",

// Add handlers:

// Batching: accumulate events within a 5-minute window then send a digest.
// Simple approach: send one email per event (fine for small teams).

const _qualExpiryBuffer: {
  expiring: any[];
  expired:  any[];
  timer:    ReturnType<typeof setTimeout> | null;
} = { expiring: [], expired: [], timer: null };

async function flushQualExpiryDigest() {
  if (_qualExpiryBuffer.expiring.length === 0 && _qualExpiryBuffer.expired.length === 0) return;

  const expiring = [..._qualExpiryBuffer.expiring];
  const expired  = [..._qualExpiryBuffer.expired];
  _qualExpiryBuffer.expiring = [];
  _qualExpiryBuffer.expired  = [];
  _qualExpiryBuffer.timer    = null;

  const admins = await User.findAll({ where: { role: "Admin", active: true } });
  for (const admin of admins) {
    await sendQualificationExpiryDigest({
      to:          admin.email,
      adminName:   admin.name,
      expiring,
      expired,
      dashboardUrl: APP_URL,
    });
  }
}

async function onQualificationExpiring(payload: any) {
  _qualExpiryBuffer.expiring.push(payload);
  if (!_qualExpiryBuffer.timer) {
    _qualExpiryBuffer.timer = setTimeout(flushQualExpiryDigest, 5 * 60_000);
  }
}

async function onQualificationExpired(payload: any) {
  _qualExpiryBuffer.expired.push(payload);
  if (!_qualExpiryBuffer.timer) {
    _qualExpiryBuffer.timer = setTimeout(flushQualExpiryDigest, 5 * 60_000);
  }
}

// Add to handleMessage switch:
case "qualification.expiring": await onQualificationExpiring(payload); break;
case "qualification.expired":  await onQualificationExpired(payload);  break;

*/

// ─── RisoHub.jsx wiring ───────────────────────────────────────────────────────
/*

// Add to NAV_ITEMS in RisoHub.jsx:
{ view: "qualifications", label: "Qualifications", icon: "🎓", roles: ["Admin", "Auditor"], dividerBefore: false },

// Add to View type:
type View = ... | "qualifications";

// Add to AppShell render:
{activeView === "qualifications" && (
  <StaffQualifications token={token!} userRole={user?.role ?? "Auditor"} />
)}

// Import at top:
import StaffQualifications from "./StaffQualifications";

*/

// ─── Qualification Sequelize Model ────────────────────────────────────────────
/*
// src/models/Qualification.ts

import { DataTypes, Model } from "sequelize";
import sequelize from "../db";

class Qualification extends Model {}

Qualification.init({
  id:           { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  staffId:      { type: DataTypes.UUID, allowNull: false },
  type:         { type: DataTypes.TEXT, allowNull: false },
  category:     { type: DataTypes.TEXT, allowNull: false, defaultValue: "Other" },
  certNumber:   { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  issuingBody:  { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  issuedAt:     { type: DataTypes.DATEONLY, allowNull: false },
  expiresAt:    { type: DataTypes.DATEONLY, allowNull: true },
  neverExpires: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  fileUrl:      { type: DataTypes.TEXT, allowNull: true },
  notes:        { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
}, {
  sequelize,
  modelName:  "Qualification",
  tableName:  "Qualifications",
  timestamps: true,
});

export default Qualification;
*/
