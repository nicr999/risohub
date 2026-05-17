// ============================================================
// RISO HUB — routes/portalRoutes.ts
// Customer Portal — token-based, no login required.
//
// Flow:
//   1. Staff: POST /api/portal/:projectId/invite
//        → generates a 384-bit one-time token (SHA256 hashed in DB)
//        → stores in Settings JSONB under key "portal:{projectId}"
//        → sends email to customer with /portal?token=... link
//        → returns { portalUrl }
//
//   2. Customer: GET /api/portal/view/:token   (public)
//        → validates token, returns full handover pack data
//        → no JWT required
//
//   3. Staff: DELETE /api/portal/:projectId/revoke
//        → removes the stored token hash, invalidating the link
//
// Token lifetime: configurable via env PORTAL_TOKEN_DAYS (default 90)
//
// Add to app.ts:
//   import portalRoutes from './routes/portalRoutes';
//   app.use('/api/portal', portalRoutes);
//
// Add to main.tsx router (outside AuthGuard):
//   <Route path="/portal" element={<CustomerPortalPage />} />
// ============================================================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { sendPortalInvite } from '../services/emailService';

import {
  Project,
  Document,
  Signature,
  ChecklistItem,
  Setting,
  User,
} from '../models/index';

import {
  MCSRegistration,
  HeatLossSummary,
} from '../models/newModels';

import { EPCRecord } from '../models/EPCAndBUSModels';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET            = process.env.AWS_S3_BUCKET!;
const PORTAL_TOKEN_DAYS = parseInt(process.env.PORTAL_TOKEN_DAYS ?? '90', 10);
const PRESIGN_EXPIRES   = 60 * 60; // 1-hour S3 presigned URLs

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRawToken(): string {
  return crypto.randomBytes(48).toString('base64url'); // 384-bit, URL-safe
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function portalSettingKey(projectId: string): string {
  return `portal:${projectId}`;
}

/** Extract S3 key from a full S3 URL or return the value as-is if it's already a key */
function s3KeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip leading slash
    return u.pathname.replace(/^\//, '');
  } catch {
    return url;
  }
}

/** Generate a short-lived presigned GET URL for an S3 object */
async function presign(s3Url: string): Promise<string> {
  const key     = s3KeyFromUrl(s3Url);
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });
}

// ─── POST /api/portal/:projectId/invite ──────────────────────────────────────
// Staff-only: generates a portal token and emails the customer.
// Surveyor+ required; re-invoking rotates the token.

router.post(
  '/:projectId/invite',
  authenticate,
  authorize('Admin', 'Surveyor'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      const project = await Project.findByPk(projectId, {
        include: [{ model: User, as: 'assignee', attributes: ['name', 'email'] }],
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check at least one signed handover document exists
      const signedDoc = await Signature.findOne({
        where: { projectId, status: 'signed' },
      });

      if (!signedDoc) {
        return res.status(409).json({
          error: 'No signed documents found. The customer portal is available once at least one document has been signed.',
        });
      }

      // Generate and store token
      const rawToken  = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + PORTAL_TOKEN_DAYS * 24 * 60 * 60 * 1000);
      const settingKey = portalSettingKey(projectId);

      // Upsert into Settings table as JSONB config
      await Setting.upsert({
        section:   settingKey,
        config:    { tokenHash, expiresAt: expiresAt.toISOString(), projectId },
        updatedBy: (req as any).user.id,
        updatedAt: new Date(),
      });

      const portalUrl = `${process.env.FRONTEND_URL}/portal?token=${rawToken}`;

      // Send email to customer
      if (project.customerEmail) {
        await sendPortalInvite({
          to:           project.customerEmail,
          customerName: project.customerName,
          address:      `${project.address}, ${project.postcode}`,
          portalUrl,
          expiryDays:   PORTAL_TOKEN_DAYS,
        });
      }

      await logAudit({
        userId:     (req as any).user.id,
        action:     'portal.invite_sent',
        entityType: 'Project',
        entityId:   projectId,
        newValue:   { portalUrl, expiresAt },
        ipAddress:  req.ip,
        metadata:   { recipient: project.customerEmail },
      });

      return res.json({ portalUrl, expiresAt });
    } catch (err) {
      console.error('Portal invite error:', err);
      return res.status(500).json({ error: 'Failed to generate portal link' });
    }
  }
);

// ─── GET /api/portal/view/:token ─────────────────────────────────────────────
// Public — no JWT. Returns full handover pack for the portal page.

router.get('/view/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const tokenHash = hashToken(token);

    // Find the matching setting row
    const settings = await Setting.findAll();
    const portalSetting = settings.find(
      (s: any) =>
        s.section.startsWith('portal:') &&
        s.config?.tokenHash === tokenHash
    );

    if (!portalSetting) {
      return res.status(404).json({ error: 'Portal link not found or has been revoked' });
    }

    const config = portalSetting.config as any;

    if (new Date(config.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'This portal link has expired. Please contact your installer for a new link.' });
    }

    const { projectId } = config;

    // Load project
    const project = await Project.findByPk(projectId, {
      include: [{ model: User, as: 'assignee', attributes: ['name', 'email'] }],
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Load documents (signed ones get presigned S3 URLs)
    const documents = await Document.findAll({
      where: { projectId },
      order: [['generatedAt', 'DESC']],
    });

    const docsWithUrls = await Promise.all(
      documents.map(async (doc: any) => {
        // Check if this doc has a signed version
        const sig = await Signature.findOne({
          where: { documentId: doc.id, status: 'signed' },
        });

        const pdfToPresign = sig?.pdfUrl || doc.pdfUrl;
        let presignedUrl: string | null = null;
        try {
          presignedUrl = await presign(pdfToPresign);
        } catch {
          // Non-fatal — URL may be expired or key missing
        }

        return {
          id:          doc.id,
          docType:     doc.docType,
          version:     doc.version,
          generatedAt: doc.generatedAt,
          sha256Hash:  doc.sha256Hash,
          signed:      !!sig,
          signedAt:    sig?.createdAt ?? null,
          presignedUrl,
        };
      })
    );

    // Load checklist summary (counts only — not individual items for privacy)
    const checklistItems = await ChecklistItem.findAll({ where: { projectId } });
    const checklistSummary = {
      total:        checklistItems.length,
      complete:     checklistItems.filter((i: any) => i.status === 'complete').length,
      noncompliant: checklistItems.filter((i: any) => i.status === 'noncompliant').length,
      na:           checklistItems.filter((i: any) => i.status === 'na').length,
      pending:      checklistItems.filter((i: any) => i.status === 'pending').length,
    };

    // MCS registration
    const mcs = await MCSRegistration.findOne({ where: { projectId } });

    // Heat loss summary
    const heatLoss = await HeatLossSummary.findOne({
      where: { projectId },
      order: [['createdAt', 'DESC']],
    });

    // EPC
    const epc = await EPCRecord.findOne({
      where: { projectId },
      order: [['fetchedAt', 'DESC']],
    });

    // Company settings for branding
    const companySetting = await Setting.findOne({ where: { section: 'company' } });
    const company        = (companySetting?.config as any) ?? {};

    return res.json({
      project: {
        id:           project.id,
        customerName: project.customerName,
        address:      project.address,
        postcode:     project.postcode,
        projectType:  project.projectType,
        status:       project.status,
        assignee:     (project as any).assignee?.name ?? null,
      },
      documents:        docsWithUrls,
      checklistSummary,
      mcsRegistration:  mcs
        ? { mcsNumber: mcs.mcsNumber, registeredAt: mcs.registeredAt }
        : null,
      heatLoss: heatLoss
        ? {
            softwareUsed:     heatLoss.softwareUsed,
            heatDemandKW:     heatLoss.heatDemandKW,
            heatLossKW:       heatLoss.heatLossKW,
            designFlowTemp:   heatLoss.designFlowTemp,
            designReturnTemp: heatLoss.designReturnTemp,
          }
        : null,
      epc: epc
        ? {
            currentEnergyRating:    epc.currentEnergyRating,
            potentialEnergyRating:  epc.potentialEnergyRating,
            currentEnergyEfficiency: epc.currentEnergyEfficiency,
            propertyType:           epc.propertyType,
          }
        : null,
      company: {
        name:       company.name       ?? 'RISO HOME',
        phone:      company.phone      ?? '',
        email:      company.email      ?? '',
        address:    company.address    ?? '',
        mcsNumber:  company.mcsNumber  ?? '',
        reccNumber: company.reccNumber ?? '',
        logoUrl:    company.logoUrl    ?? null,
      },
      portalExpiresAt: config.expiresAt,
    });
  } catch (err) {
    console.error('Portal view error:', err);
    return res.status(500).json({ error: 'Failed to load portal data' });
  }
});

// ─── GET /api/portal/documents/:documentId/download ──────────────────────────
// Public (no JWT). Portal token must be provided as ?token=<rawToken>
// Returns a redirect to a presigned S3 URL with Content-Disposition: attachment.

router.get('/documents/:documentId/download', async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const rawToken = (req.query.token as string) ?? '';

  if (!rawToken) {
    return res.status(400).json({ error: 'Portal token is required.' });
  }

  try {
    const tokenHash = hashToken(rawToken);

    const settings = await Setting.findAll();
    const portalSetting = settings.find(
      (s: any) => s.section.startsWith('portal:') && s.config?.tokenHash === tokenHash
    );

    if (!portalSetting) {
      return res.status(404).json({ error: 'Portal link not found or has been revoked.' });
    }

    const config = portalSetting.config as any;
    if (new Date(config.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'This portal link has expired.' });
    }

    // Verify the document belongs to this project
    const doc = await Document.findOne({ where: { id: documentId, projectId: config.projectId } });
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Prefer the signed version if available
    const sig = await Signature.findOne({ where: { documentId: doc.id, status: 'signed' } });
    const s3Url = (sig as any)?.pdfUrl || (doc as any).pdfUrl;

    if (!s3Url) {
      return res.status(404).json({ error: 'Document file not available.' });
    }

    const key      = s3KeyFromUrl(s3Url);
    const filename = `RISO-${(doc as any).docType ?? 'document'}-${documentId.slice(0, 8)}.pdf`;
    const command  = new GetObjectCommand({
      Bucket:                        BUCKET,
      Key:                           key,
      ResponseContentDisposition:    `attachment; filename="${filename}"`,
      ResponseContentType:           'application/pdf',
    });
    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

    return res.redirect(302, downloadUrl);
  } catch (err) {
    console.error('Portal document download error:', err);
    return res.status(500).json({ error: 'Failed to generate download link.' });
  }
});

// ─── DELETE /api/portal/:projectId/revoke ────────────────────────────────────
// Admin-only: invalidates the portal link immediately.

router.delete(
  '/:projectId/revoke',
  authenticate,
  authorize('Admin'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      const settingKey = portalSettingKey(projectId);
      const row        = await Setting.findOne({ where: { section: settingKey } });

      if (!row) {
        return res.status(404).json({ error: 'No active portal link for this project' });
      }

      await row.destroy();

      await logAudit({
        userId:     (req as any).user.id,
        action:     'portal.revoked',
        entityType: 'Project',
        entityId:   projectId,
        ipAddress:  req.ip,
        metadata:   {},
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Portal revoke error:', err);
      return res.status(500).json({ error: 'Failed to revoke portal link' });
    }
  }
);

// ─── GET /api/portal/:projectId/status ───────────────────────────────────────
// Staff: check whether an active portal link exists for a project.

router.get(
  '/:projectId/status',
  authenticate,
  authorize('Admin', 'Surveyor'),
  async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      const settingKey = portalSettingKey(projectId);
      const row        = await Setting.findOne({ where: { section: settingKey } });

      if (!row) {
        return res.json({ active: false });
      }

      const config    = row.config as any;
      const expiresAt = new Date(config.expiresAt);
      const active    = expiresAt > new Date();

      return res.json({ active, expiresAt: config.expiresAt });
    } catch (err) {
      console.error('Portal status error:', err);
      return res.status(500).json({ error: 'Failed to check portal status' });
    }
  }
);

export default router;
