/**
 * qualificationService.ts + qualificationRoutes.ts
 *
 * Backend for the staff qualification registry.
 *
 * DB table: Qualifications (migration SQL at bottom)
 *
 * Expiry check job:
 *   A daily cron (or scheduled event) calls checkExpiringQualifications()
 *   which emits qualifications.expiring / qualifications.expired events
 *   → emailWorker sends alerts to Admin users.
 *
 * Mount routes in app.ts:
 *   app.use("/api/qualifications", qualificationRoutes);
 */

// ════════════════════════════════════════════════════════════════════════════
// SERVICE
// ════════════════════════════════════════════════════════════════════════════

import { Op }        from "sequelize";
import { Router, Request, Response } from "express";
import crypto        from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Qualification, User, AuditLog } from "../models";
import { authenticate, authorize }       from "../auth/authMiddleware";
import { publishEvent }                  from "../events/rabbitMQ";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualificationInput {
  staffId:      string;
  type:         string;
  category:     string;
  certNumber:   string;
  issuingBody:  string;
  issuedAt:     string;
  expiresAt:    string | null;
  neverExpires: boolean;
  fileUrl:      string | null;
  notes:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 60;

function daysUntilExpiry(expiresAt: string | null, neverExpires: boolean): number | null {
  if (neverExpires || !expiresAt) return null;
  return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

function computeStatus(expiresAt: string | null, neverExpires: boolean): string {
  const days = daysUntilExpiry(expiresAt, neverExpires);
  if (days === null)                     return "valid";
  if (days < 0)                          return "expired";
  if (days <= EXPIRY_WARNING_DAYS)       return "expiring";
  return "valid";
}

async function logAudit(params: {
  userId: string; action: string; entityId: string; ipAddress: string; metadata?: object;
}) {
  await AuditLog.create({
    timestamp:  new Date(),
    entityType: "Qualification",
    ...params,
  });
}

function ip(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "unknown";
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function createQualification(
  input:     QualificationInput,
  createdBy: string,
  ipAddress: string
): Promise<any> {
  // Verify the staff member exists
  const user = await User.findByPk(input.staffId);
  if (!user) throw new Error("Staff member not found.");

  const qual = await Qualification.create({
    ...input,
    id:        crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await logAudit({
    userId: createdBy, action: "qualification.created",
    entityId: (qual as any).id, ipAddress,
    metadata: { type: input.type, staffId: input.staffId },
  });

  await publishEvent("riso.events", "qualification.created", {
    qualificationId: (qual as any).id,
    staffId:         input.staffId,
    type:            input.type,
    expiresAt:       input.expiresAt,
  });

  return qual;
}

export async function updateQualification(
  id:        string,
  input:     Partial<QualificationInput>,
  updatedBy: string,
  ipAddress: string
): Promise<any> {
  const qual = await Qualification.findByPk(id);
  if (!qual) throw new Error("Qualification not found.");

  const before = (qual as any).toJSON();
  await qual.update({ ...input, updatedAt: new Date() });

  await logAudit({
    userId: updatedBy, action: "qualification.updated",
    entityId: id, ipAddress,
    metadata: { before, after: input },
  });

  return qual;
}

export async function deleteQualification(
  id:        string,
  deletedBy: string,
  ipAddress: string
): Promise<void> {
  const qual = await Qualification.findByPk(id);
  if (!qual) throw new Error("Qualification not found.");

  const snapshot = (qual as any).toJSON();
  await qual.destroy();

  await logAudit({
    userId: deletedBy, action: "qualification.deleted",
    entityId: id, ipAddress,
    metadata: { snapshot },
  });
}

export async function listQualifications(staffId?: string): Promise<any[]> {
  const where: any = staffId ? { staffId } : {};
  const quals      = await Qualification.findAll({ where, order: [["expiresAt", "ASC"]] });

  return quals.map((q: any) => ({
    ...q.toJSON(),
    status:          computeStatus(q.expiresAt, q.neverExpires),
    daysUntilExpiry: daysUntilExpiry(q.expiresAt, q.neverExpires),
  }));
}

/**
 * Daily cron job — call this from a scheduled Lambda or node-cron.
 * Finds all qualifications expiring within 60 days or already expired
 * and emits events → emailWorker sends alerts.
 */
export async function checkExpiringQualifications(): Promise<{
  expiring: number; expired: number;
}> {
  const soon    = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);
  const now     = new Date();

  const expiring = await Qualification.findAll({
    where: {
      neverExpires: false,
      expiresAt:    { [Op.between]: [now, soon] },
    },
    include: [{ model: User, as: "staffMember", attributes: ["name", "email", "role"] }],
  });

  const expired = await Qualification.findAll({
    where: {
      neverExpires: false,
      expiresAt:    { [Op.lt]: now },
    },
    include: [{ model: User, as: "staffMember", attributes: ["name", "email", "role"] }],
  });

  // Emit per-qualification events — emailWorker aggregates and sends digest
  for (const q of expiring) {
    await publishEvent("riso.events", "qualification.expiring", {
      qualificationId: (q as any).id,
      staffId:         (q as any).staffId,
      staffName:       (q as any).staffMember?.name,
      type:            (q as any).type,
      expiresAt:       (q as any).expiresAt,
      daysRemaining:   daysUntilExpiry((q as any).expiresAt, false),
    });
  }

  for (const q of expired) {
    await publishEvent("riso.events", "qualification.expired", {
      qualificationId: (q as any).id,
      staffId:         (q as any).staffId,
      staffName:       (q as any).staffMember?.name,
      type:            (q as any).type,
      expiresAt:       (q as any).expiresAt,
    });
  }

  return { expiring: expiring.length, expired: expired.length };
}

// ─── S3 presign for cert uploads ──────────────────────────────────────────────

export async function presignCertUpload(
  fileName: string,
  mimeType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const s3     = new S3Client({ region: process.env.AWS_REGION });
  const key    = `qualifications/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bucket = process.env.S3_BUCKET!;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }),
    { expiresIn: 900 }
  );

  const publicUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl };
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

const router = Router();

// GET /api/qualifications?staffId=xxx
router.get(
  "/",
  authenticate,
  authorize("Admin", "Surveyor", "Auditor"),
  async (req: Request, res: Response) => {
    try {
      const quals = await listQualifications(req.query.staffId as string | undefined);
      res.json({ qualifications: quals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/qualifications/:id
router.get(
  "/:id",
  authenticate,
  authorize("Admin", "Surveyor", "Auditor"),
  async (req: Request, res: Response) => {
    try {
      const qual = await Qualification.findByPk(req.params.id);
      if (!qual) return res.status(404).json({ error: "Not found." });
      const q = (qual as any).toJSON();
      res.json({
        ...q,
        status:          computeStatus(q.expiresAt, q.neverExpires),
        daysUntilExpiry: daysUntilExpiry(q.expiresAt, q.neverExpires),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/qualifications
router.post(
  "/",
  authenticate,
  authorize("Admin"),
  async (req: Request, res: Response) => {
    try {
      const { staffId, type, category, certNumber, issuingBody,
              issuedAt, expiresAt, neverExpires, fileUrl, notes } = req.body;

      if (!staffId || !type || !issuedAt) {
        return res.status(400).json({ error: "staffId, type, and issuedAt are required." });
      }
      if (!neverExpires && !expiresAt) {
        return res.status(400).json({ error: "expiresAt required unless neverExpires is true." });
      }

      const qual = await createQualification(
        { staffId, type, category, certNumber, issuingBody, issuedAt,
          expiresAt: neverExpires ? null : expiresAt, neverExpires, fileUrl, notes },
        (req as any).user.id,
        ip(req)
      );
      res.status(201).json(qual);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// PATCH /api/qualifications/:id
router.patch(
  "/:id",
  authenticate,
  authorize("Admin"),
  async (req: Request, res: Response) => {
    try {
      const qual = await updateQualification(
        req.params.id,
        req.body,
        (req as any).user.id,
        ip(req)
      );
      res.json(qual);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// DELETE /api/qualifications/:id
router.delete(
  "/:id",
  authenticate,
  authorize("Admin"),
  async (req: Request, res: Response) => {
    try {
      await deleteQualification(req.params.id, (req as any).user.id, ip(req));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/qualifications/presign — S3 cert upload URL
router.post(
  "/presign",
  authenticate,
  authorize("Admin"),
  async (req: Request, res: Response) => {
    try {
      const { fileName, mimeType } = req.body;
      if (!fileName || !mimeType) return res.status(400).json({ error: "fileName and mimeType required." });
      const result = await presignCertUpload(fileName, mimeType);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/qualifications/check-expiry — trigger expiry scan (internal/cron)
router.post(
  "/check-expiry",
  authenticate,
  authorize("Admin"),
  async (_req: Request, res: Response) => {
    try {
      const result = await checkExpiringQualifications();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;

/*
 * ─── Sequelize Migration ───────────────────────────────────────────────────────
 *
 * CREATE TABLE "Qualifications" (
 *   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   "staffId"       UUID NOT NULL REFERENCES "Users"(id),
 *   type            TEXT NOT NULL,
 *   category        TEXT NOT NULL DEFAULT 'Other',
 *   "certNumber"    TEXT NOT NULL DEFAULT '',
 *   "issuingBody"   TEXT NOT NULL DEFAULT '',
 *   "issuedAt"      DATE NOT NULL,
 *   "expiresAt"     DATE,
 *   "neverExpires"  BOOLEAN NOT NULL DEFAULT FALSE,
 *   "fileUrl"       TEXT,
 *   notes           TEXT NOT NULL DEFAULT '',
 *   "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX ON "Qualifications"("staffId");
 * CREATE INDEX ON "Qualifications"("expiresAt");
 *
 * -- Sequelize model association (in User model):
 * User.hasMany(Qualification, { foreignKey: 'staffId', as: 'qualifications' });
 * Qualification.belongsTo(User, { foreignKey: 'staffId', as: 'staffMember' });
 */
