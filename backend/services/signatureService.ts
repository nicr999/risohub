/**
 * signatureService.ts
 *
 * Backend service for the full digital signature lifecycle:
 *   1. requestSignature  — generate one-time token, persist request, send email/SMS
 *   2. getSignatureInfo  — validate token, return document info for SignaturePage
 *   3. signDocument      — capture Base64 sig, embed in PDF, hash, upload, emit event
 *   4. declineSignature  — mark declined, notify team
 *   5. verifySignature   — Admin: verify hash integrity of a stored signature
 *   6. adminOverride     — Admin: mark a request signed without a capture (manual override)
 *
 * Assumes:
 *   - Sequelize models: Signature, Document, Project, User, AuditLog
 *   - signatureRoutes.ts registers these as Express handlers
 *   - documentService.ts exports: rebuildPdfWithSignature(docBuffer, sigData, metadata)
 *   - S3 upload utility: uploadToS3(buffer, key, contentType) → url
 *   - RabbitMQ publish: publishEvent(exchange, routingKey, payload)
 *   - Email/SMS: sendSignatureRequest(to, payload) / sendSMS(phone, message)
 */

import crypto from "crypto";
import { Op } from "sequelize";
import { Signature, Document, Project, User, AuditLog } from "../models";
import { uploadToS3 } from "../storage/s3";
import { publishEvent } from "../events/rabbitMQ";
import { rebuildPdfWithSignature } from "./documentService";
import { sendSignatureRequestEmail } from "../email/emailService";
import { sendSMS } from "../sms/smsService";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_HOURS = 72; // configurable via Settings
const TOKEN_BYTES        = 48; // 384-bit = unguessable

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryMethod = "email" | "sms" | "both";

export interface SignatureRequestPayload {
  projectId:      string;
  documentId:     string;
  recipientName:  string;
  recipientEmail: string;
  recipientPhone: string;
  role:           string;
  delivery:       DeliveryMethod;
  message:        string;
  requestedBy:    string; // userId of the requester
  ipAddress:      string;
}

export interface SignPayload {
  token:         string;
  signatureData: string; // Base64 PNG dataURL
  consent:       boolean;
  metadata: {
    userAgent:  string;
    timestamp:  string;
    gps?:       { lat: number; lng: number } | null;
  };
  ipAddress: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function logAudit(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  metadata?: object;
}) {
  await AuditLog.create({
    ...params,
    timestamp: new Date(),
  });
}

// ─── 1. requestSignature ─────────────────────────────────────────────────────

/**
 * Creates a Signature record with a hashed one-time token, then dispatches
 * email and/or SMS to the recipient containing the sign link.
 */
export async function requestSignature(
  payload: SignatureRequestPayload
): Promise<{ signatureId: string }> {
  const {
    projectId, documentId, recipientName, recipientEmail, recipientPhone,
    role, delivery, message, requestedBy, ipAddress,
  } = payload;

  // Validate document exists and belongs to the project
  const doc = await Document.findOne({ where: { id: documentId, projectId } });
  if (!doc) throw new Error("Document not found for this project.");

  const project = await Project.findByPk(projectId);
  if (!project) throw new Error("Project not found.");

  // Check for an existing pending request for this role on this document
  const existing = await Signature.findOne({
    where: { documentId, role, status: "pending" },
  });
  if (existing) {
    throw new Error(
      `A pending signature request for role '${role}' already exists. ` +
      "Revoke it before sending a new one."
    );
  }

  const rawToken  = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3_600_000);

  const sig = await Signature.create({
    projectId,
    documentId,
    requestedBy,
    signedBy:      recipientName,
    role,
    status:        "pending",
    signatureData: null,
    pdfUrl:        null,
    metadata: {
      recipientEmail,
      recipientPhone,
      delivery,
      tokenHash,   // stored — raw token is never persisted
      expiresAt:   expiresAt.toISOString(),
    },
    hash:      null,
    createdAt: new Date(),
  });

  const signLink = `${process.env.APP_URL}/sign?token=${rawToken}`;

  // Send email
  if (delivery === "email" || delivery === "both") {
    await sendSignatureRequestEmail({
      to:           recipientEmail,
      recipientName,
      customerName: project.customerName,
      address:      project.address,
      role,
      signLink,
      message,
      expiresAt,
    });
  }

  // Send SMS
  if (delivery === "sms" || delivery === "both") {
    await sendSMS({
      to:   recipientPhone,
      body: `${message}\n\nSign here: ${signLink}\n\nExpires: ${expiresAt.toLocaleDateString("en-GB")}`,
    });
  }

  await logAudit({
    userId:     requestedBy,
    action:     "signature.requested",
    entityType: "Signature",
    entityId:   sig.id,
    ipAddress,
    metadata:   { role, delivery, recipientEmail, recipientPhone },
  });

  await publishEvent("riso.events", "signature.requested", {
    signatureId: sig.id,
    projectId,
    documentId,
    role,
  });

  return { signatureId: sig.id };
}

// ─── 2. getSignatureInfo ─────────────────────────────────────────────────────

/**
 * Called by SignaturePage on mount.
 * Validates the raw one-time token and returns safe display info.
 * Throws specific errors that map to HTTP status codes in the route handler.
 */
export async function getSignatureInfo(rawToken: string): Promise<object> {
  const tokenHash = hashToken(rawToken);

  // Find all pending signatures and match by hash
  // (we can't query directly on tokenHash without a DB index — add one in migration)
  const sigs = await Signature.findAll({
    where: { status: "pending" },
    include: [{ model: Document }, { model: Project }],
  });

  const sig = sigs.find(
    (s: any) => s.metadata?.tokenHash === tokenHash
  );

  if (!sig) {
    // Could be already signed or truly invalid — check signed ones too
    const signedSig = (await Signature.findAll({ where: { status: "signed" } }))
      .find((s: any) => s.metadata?.tokenHash === tokenHash);

    if (signedSig) throw Object.assign(new Error("Already signed"), { code: "ALREADY_SIGNED" });
    throw Object.assign(new Error("Invalid token"), { code: "INVALID" });
  }

  const expiresAt = new Date(sig.metadata.expiresAt);
  if (expiresAt < new Date()) {
    throw Object.assign(new Error("Token expired"), { code: "EXPIRED" });
  }

  const doc     = (sig as any).Document;
  const project = (sig as any).Project;

  // Fetch settings for company name / MCS number
  // (Replace with actual Settings model lookup)
  const companyName = process.env.COMPANY_NAME ?? "RISO HOME";
  const mcsNumber   = process.env.MCS_NUMBER   ?? "";

  return {
    id:            sig.id,
    customerName:  project.customerName,
    address:       `${project.address}, ${project.postcode}`,
    projectType:   project.projectType,
    documentTitle: `${doc.docType.charAt(0).toUpperCase() + doc.docType.slice(1)} Document`,
    documentUrl:   doc.pdfUrl,  // Presigned S3 URL — generate fresh in route handler
    role:          sig.role,
    expiresAt:     sig.metadata.expiresAt,
    companyName,
    mcsNumber,
  };
}

// ─── 3. signDocument ─────────────────────────────────────────────────────────

/**
 * The heavy lifting:
 *   - Validates token + consent
 *   - Downloads original PDF from S3
 *   - Calls rebuildPdfWithSignature to embed the canvas image + metadata page
 *   - Uploads the new PDF back to S3
 *   - Stores SHA-256 hash in Signatures table
 *   - Emits signatures.captured event → Workflow Agent advances project stage
 */
export async function signDocument(payload: SignPayload): Promise<{ pdfUrl: string }> {
  const { token: rawToken, signatureData, consent, metadata, ipAddress } = payload;

  if (!consent) throw new Error("Consent must be given to sign.");
  if (!signatureData || !signatureData.startsWith("data:image/png;base64,")) {
    throw new Error("Invalid signature data.");
  }

  const tokenHash = hashToken(rawToken);

  const sigs = await Signature.findAll({
    where: { status: "pending" },
    include: [{ model: Document }, { model: Project }],
  });

  const sig = sigs.find((s: any) => s.metadata?.tokenHash === tokenHash);
  if (!sig) throw Object.assign(new Error("Invalid or used token"), { code: "INVALID" });

  const expiresAt = new Date(sig.metadata.expiresAt);
  if (expiresAt < new Date()) throw Object.assign(new Error("Token expired"), { code: "EXPIRED" });

  const doc     = (sig as any).Document;
  const project = (sig as any).Project;

  // ── Download original PDF from S3 ────────────────────────────────────────
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const s3Key = doc.pdfUrl.split(".amazonaws.com/")[1];

  const s3Res = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key:    s3Key,
  }));

  const chunks: Buffer[] = [];
  for await (const chunk of s3Res.Body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const originalPdfBuffer = Buffer.concat(chunks);

  // ── Embed signature into PDF ──────────────────────────────────────────────
  const signedPdfBuffer = await rebuildPdfWithSignature(originalPdfBuffer, {
    signatureDataUrl: signatureData,
    signerName:       sig.signedBy,
    role:             sig.role,
    timestamp:        metadata.timestamp,
    ipAddress,
    gps:              metadata.gps,
    userAgent:        metadata.userAgent,
    customerName:     project.customerName,
    address:          project.address,
  });

  // ── Hash the signed PDF ───────────────────────────────────────────────────
  const hash = sha256Buffer(signedPdfBuffer);

  // ── Upload signed PDF to S3 ───────────────────────────────────────────────
  const signedKey = `projects/${project.id}/documents/signed/${doc.id}-${sig.role}-${Date.now()}.pdf`;
  const signedPdfUrl = await uploadToS3(signedPdfBuffer, signedKey, "application/pdf");

  // ── Update Signature record ───────────────────────────────────────────────
  await sig.update({
    status:        "signed",
    signatureData,
    pdfUrl:        signedPdfUrl,
    hash,
    metadata: {
      ...sig.metadata,
      ip:        ipAddress,
      userAgent: metadata.userAgent,
      gps:       metadata.gps,
      timestamp: metadata.timestamp,
      // Wipe the token hash now that it's been used
      tokenHash: null,
    },
  });

  // ── Audit log ────────────────────────────────────────────────────────────
  await logAudit({
    userId:     sig.signedBy ?? "anonymous",
    action:     "signature.signed",
    entityType: "Signature",
    entityId:   sig.id,
    ipAddress,
    metadata:   { role: sig.role, hash, signedPdfUrl },
  });

  // ── Emit event → Workflow Agent ───────────────────────────────────────────
  await publishEvent("riso.events", "signatures.captured", {
    signatureId: sig.id,
    projectId:   project.id,
    documentId:  doc.id,
    role:        sig.role,
    hash,
  });

  // ── Check if all required signatures are now in place ────────────────────
  const allSigs = await Signature.findAll({ where: { documentId: doc.id } });
  const allSigned = allSigs.every((s: any) => s.status === "signed");

  if (allSigned) {
    await publishEvent("riso.events", "signatures.allCaptured", {
      projectId: project.id,
      documentId: doc.id,
    });
  }

  return { pdfUrl: signedPdfUrl };
}

// ─── 4. declineSignature ─────────────────────────────────────────────────────

export async function declineSignature(rawToken: string, ipAddress: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const sigs = await Signature.findAll({ where: { status: "pending" } });
  const sig  = sigs.find((s: any) => s.metadata?.tokenHash === tokenHash);
  if (!sig) throw new Error("Invalid token");

  await sig.update({
    status:   "declined",
    metadata: { ...sig.metadata, declinedAt: new Date().toISOString(), ip: ipAddress, tokenHash: null },
  });

  await logAudit({
    userId:     sig.signedBy ?? "anonymous",
    action:     "signature.declined",
    entityType: "Signature",
    entityId:   sig.id,
    ipAddress,
  });

  await publishEvent("riso.events", "signature.declined", {
    signatureId: sig.id,
    projectId:   sig.projectId,
    role:        sig.role,
  });
}

// ─── 5. verifySignature ───────────────────────────────────────────────────────

/**
 * Admin tool: download the signed PDF from S3 and re-hash it.
 * Returns whether the current hash matches the stored hash (tamper detection).
 */
export async function verifySignature(
  signatureId: string,
  requesterId:  string,
  ipAddress:    string
): Promise<{ valid: boolean; storedHash: string; computedHash: string }> {
  const sig = await Signature.findByPk(signatureId);
  if (!sig || sig.status !== "signed") throw new Error("Signed signature not found.");

  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3    = new S3Client({ region: process.env.AWS_REGION });
  const s3Key = sig.pdfUrl.split(".amazonaws.com/")[1];

  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: s3Key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const computedHash = sha256Buffer(Buffer.concat(chunks));
  const valid        = computedHash === sig.hash;

  await logAudit({
    userId:     requesterId,
    action:     "signature.verified",
    entityType: "Signature",
    entityId:   signatureId,
    ipAddress,
    metadata:   { valid, computedHash, storedHash: sig.hash },
  });

  return { valid, storedHash: sig.hash, computedHash };
}

// ─── 6. adminOverride ────────────────────────────────────────────────────────

/**
 * Admin-only: mark a pending/declined signature as signed without a canvas capture.
 * Recorded in AuditLog with override flag. Does NOT modify the PDF.
 */
export async function adminOverride(
  signatureId: string,
  adminId:     string,
  ipAddress:   string
): Promise<void> {
  const sig = await Signature.findByPk(signatureId);
  if (!sig) throw new Error("Signature not found.");
  if (sig.status === "signed") throw new Error("Already signed.");

  await sig.update({
    status:   "signed",
    metadata: {
      ...sig.metadata,
      adminOverride:   true,
      overriddenBy:    adminId,
      overriddenAt:    new Date().toISOString(),
      overrideIp:      ipAddress,
      tokenHash:       null,
    },
  });

  await logAudit({
    userId:     adminId,
    action:     "signature.adminOverride",
    entityType: "Signature",
    entityId:   signatureId,
    ipAddress,
    metadata:   { note: "Admin override — no canvas capture" },
  });

  await publishEvent("riso.events", "signatures.captured", {
    signatureId: sig.id,
    projectId:   sig.projectId,
    role:        sig.role,
    override:    true,
  });
}
