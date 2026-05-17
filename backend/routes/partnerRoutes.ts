// ============================================================
// RISO HUB — routes/partnerRoutes.ts
// Partner (subcontractor) user management.
//
// Endpoints:
//
// Staff (Admin/Surveyor):
//   POST /api/partners/invite                   — invite a subcontractor
//   GET  /api/partners                          — list all partner users
//   GET  /api/partners/:id                      — partner detail
//   POST /api/partners/:id/grant/:projectId     — grant project access
//   DELETE /api/partners/:id/revoke/:projectId  — revoke project access
//   PATCH /api/partners/:id/permissions/:projectId — update permissions
//
// Public (token-based, no auth):
//   GET  /api/partners/accept/:token            — get invite info
//   POST /api/partners/accept/:token            — accept invite & create account
//
// Partner (authenticated, role=Partner):
//   GET  /api/partners/me/projects              — my accessible projects
//   GET  /api/partners/me/projects/:projectId/files — project files I can see
//   POST /api/partners/me/projects/:projectId/files — upload file (if can_upload)
//
// Add to app.ts:
//   import partnerRoutes from './routes/partnerRoutes';
//   app.use('/api/partners', partnerRoutes);
// ============================================================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';

import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { sendNotification } from '../services/notificationService';

import {
  User,
  Project,
  FileModel,
  Setting,
} from '../models/index';

import {
  Subcontractor,
  SubcontractorAssignment,
} from '../models/newModels';

import sequelize from '../config/database';

const router = Router();

const INVITE_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS      = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── PartnerInvite model ──────────────────────────────────────────────────────
// Inline model since it's new — in production merge into models/index.ts

import { DataTypes, Model } from 'sequelize';

class PartnerInvite extends Model {
  declare id: number;
  declare subcontractorId: number;
  declare tokenHash: string;
  declare email: string;
  declare userId: number | null;
  declare expiresAt: Date;
  declare acceptedAt: Date | null;
  declare createdBy: number;
  declare createdAt: Date;
}

PartnerInvite.init({
  id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  subcontractorId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash:       { type: DataTypes.STRING(64), allowNull: false, unique: true },
  email:           { type: DataTypes.STRING, allowNull: false },
  userId:          { type: DataTypes.INTEGER, allowNull: true },
  expiresAt:       { type: DataTypes.DATE, allowNull: false },
  acceptedAt:      { type: DataTypes.DATE, allowNull: true },
  createdBy:       { type: DataTypes.INTEGER, allowNull: false },
}, {
  sequelize,
  tableName: 'partner_invites',
  underscored: true,
  timestamps: true,
  updatedAt: false,
});

class PartnerProjectAccess extends Model {
  declare id: number;
  declare userId: number;
  declare projectId: number;
  declare canUpload: boolean;
  declare canViewDocs: boolean;
  declare canViewComms: boolean;
  declare grantedBy: number;
  declare grantedAt: Date;
  declare revokedAt: Date | null;
}

PartnerProjectAccess.init({
  id:          { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId:      { type: DataTypes.INTEGER, allowNull: false },
  projectId:   { type: DataTypes.INTEGER, allowNull: false },
  canUpload:   { type: DataTypes.BOOLEAN, defaultValue: true },
  canViewDocs: { type: DataTypes.BOOLEAN, defaultValue: false },
  canViewComms:{ type: DataTypes.BOOLEAN, defaultValue: false },
  grantedBy:   { type: DataTypes.INTEGER, allowNull: false },
  grantedAt:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  revokedAt:   { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize,
  tableName: 'partner_project_access',
  underscored: true,
  timestamps: false,
});

// Export for use in middleware
export { PartnerProjectAccess };

// ─── Middleware: partner project check ───────────────────────────────────────

export async function partnerProjectGuard(req: Request, res: Response, next: Function): Promise<void> {
  const user = (req as any).user;
  if (user.role !== 'Partner') { next(); return; }

  const projectId = req.params.projectId ?? req.params.id;
  if (!projectId) {
    res.status(400).json({ error: 'Project ID required' });
    return;
  }

  const access = await PartnerProjectAccess.findOne({
    where: {
      userId:    user.sub,
      projectId: parseInt(projectId, 10),
      revokedAt: null,
    },
  });

  if (!access) {
    res.status(403).json({ error: 'You do not have access to this project', code: 'NO_PARTNER_ACCESS' });
    return;
  }

  (req as any).partnerAccess = access;
  next();
}

// ─── POST /api/partners/invite ────────────────────────────────────────────────

router.post(
  '/invite',
  authenticate,
  authorize('Admin', 'Surveyor'),
  async (req: Request, res: Response) => {
    const { subcontractorId, email } = req.body;
    const actorId = (req as any).user.id;

    if (!subcontractorId || !email) {
      return res.status(400).json({ error: 'subcontractorId and email are required' });
    }

    try {
      const sub = await Subcontractor.findByPk(subcontractorId);
      if (!sub) return res.status(404).json({ error: 'Subcontractor not found' });

      // Check if already has an active invite or account
      const existing = await PartnerInvite.findOne({
        where: {
          subcontractorId,
          acceptedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
      });
      if (existing) {
        return res.status(409).json({ error: 'An active invite already exists for this subcontractor' });
      }

      const rawToken  = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await PartnerInvite.create({
        subcontractorId,
        tokenHash,
        email,
        expiresAt,
        createdBy: actorId,
      });

      const inviteUrl = `${process.env.FRONTEND_URL}/partner-accept?token=${rawToken}`;

      // Send email (using the existing email service layout)
      const { sendUserInvite } = await import('../services/emailService');
      await sendUserInvite({
        to:        email,
        name:      (sub as any).name,
        role:      'Partner',
        inviteUrl,
        expiryDays: INVITE_EXPIRY_DAYS,
      }).catch(err => console.error('Partner invite email failed:', err));

      await logAudit({
        userId:     actorId,
        action:     'partner.invite_sent',
        entityType: 'Subcontractor',
        entityId:   String(subcontractorId),
        newValue:   { email, expiresAt },
        ipAddress:  req.ip,
        metadata:   {},
      });

      return res.status(201).json({ ok: true, inviteUrl, expiresAt });
    } catch (err) {
      console.error('Partner invite error:', err);
      return res.status(500).json({ error: 'Failed to create invite' });
    }
  }
);

// ─── GET /api/partners/accept/:token ─────────────────────────────────────────
// Public — returns invite info before the user fills in their password

router.get('/accept/:token', async (req: Request, res: Response) => {
  try {
    const tokenHash = hashToken(req.params.token);
    const invite = await PartnerInvite.findOne({
      where: { tokenHash, acceptedAt: null, expiresAt: { [Op.gt]: new Date() } },
    });

    if (!invite) return res.status(404).json({ error: 'Invite not found or has expired' });

    const sub = await Subcontractor.findByPk(invite.subcontractorId, {
      attributes: ['id', 'name', 'company', 'trade'],
    });

    return res.json({
      email:      invite.email,
      expiresAt:  invite.expiresAt,
      subcontractor: sub,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load invite' });
  }
});

// ─── POST /api/partners/accept/:token ────────────────────────────────────────
// Public — creates the Partner user account

router.post('/accept/:token', async (req: Request, res: Response) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ error: 'name and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const t = await sequelize.transaction();
  try {
    const tokenHash = hashToken(req.params.token);
    const invite = await PartnerInvite.findOne({
      where: { tokenHash, acceptedAt: null, expiresAt: { [Op.gt]: new Date() } },
      transaction: t,
    });

    if (!invite) {
      await t.rollback();
      return res.status(404).json({ error: 'Invite not found or has expired' });
    }

    // Check email not already registered
    const existing = await User.findOne({ where: { email: invite.email }, transaction: t });
    if (existing) {
      await t.rollback();
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await (User as any).create({
      name,
      email:         invite.email,
      passwordHash,
      role:          'Partner',
      active:        true,
      twoFactorEnabled: false,
    }, { transaction: t });

    // Mark invite accepted
    await invite.update({ userId: user.id, acceptedAt: new Date() }, { transaction: t });

    // Auto-grant access to all projects where subcontractor is assigned
    const assignments = await SubcontractorAssignment.findAll({
      where: { subcontractorId: invite.subcontractorId, endDate: null },
      transaction: t,
    });

    for (const assignment of assignments as any[]) {
      await PartnerProjectAccess.create({
        userId:      user.id,
        projectId:   assignment.projectId,
        canUpload:   true,
        canViewDocs: false,
        canViewComms:false,
        grantedBy:   invite.createdBy,
      }, { transaction: t }).catch(() => {}); // ignore unique conflicts
    }

    await t.commit();

    await logAudit({
      userId:     user.id,
      action:     'partner.account_created',
      entityType: 'User',
      entityId:   String(user.id),
      ipAddress:  req.ip,
      metadata:   { subcontractorId: invite.subcontractorId },
    });

    return res.status(201).json({ ok: true, message: 'Account created. You can now sign in.' });
  } catch (err) {
    await t.rollback();
    console.error('Partner accept error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// ─── GET /api/partners ────────────────────────────────────────────────────────
// Admin: list all partner users with their subcontractor link

router.get(
  '/',
  authenticate,
  authorize('Admin'),
  async (req: Request, res: Response) => {
    try {
      const partners = await User.findAll({
        where: { role: 'Partner' },
        attributes: ['id', 'name', 'email', 'active', 'createdAt'],
        order: [['name', 'ASC']],
      });

      // Enrich with subcontractor and project access counts
      const enriched = await Promise.all(
        partners.map(async (p: any) => {
          const invite = await PartnerInvite.findOne({
            where: { userId: p.id },
          });
          const sub = invite
            ? await Subcontractor.findByPk(invite.subcontractorId, {
                attributes: ['id', 'name', 'company', 'trade'],
              })
            : null;
          const accessCount = await PartnerProjectAccess.count({
            where: { userId: p.id, revokedAt: null },
          });
          return { ...p.toJSON(), subcontractor: sub, projectCount: accessCount };
        })
      );

      return res.json({ partners: enriched });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to list partners' });
    }
  }
);

// ─── POST /api/partners/:id/grant/:projectId ──────────────────────────────────
// Admin/Surveyor: explicitly grant a partner access to a project

router.post(
  '/:id/grant/:projectId',
  authenticate,
  authorize('Admin', 'Surveyor'),
  async (req: Request, res: Response) => {
    const { id, projectId } = req.params;
    const { canUpload = true, canViewDocs = false, canViewComms = false } = req.body;
    const actorId = (req as any).user.id;

    try {
      const user    = await User.findOne({ where: { id: parseInt(id,10), role: 'Partner' } });
      const project = await Project.findByPk(parseInt(projectId,10));

      if (!user)    return res.status(404).json({ error: 'Partner user not found' });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const [access, created] = await PartnerProjectAccess.findOrCreate({
        where: { userId: parseInt(id,10), projectId: parseInt(projectId,10) },
        defaults: { canUpload, canViewDocs, canViewComms, grantedBy: actorId, revokedAt: null },
      });

      if (!created) {
        // Re-grant if previously revoked or update permissions
        await access.update({ canUpload, canViewDocs, canViewComms, revokedAt: null, grantedBy: actorId });
      }

      await logAudit({
        userId:     actorId,
        action:     'partner.access_granted',
        entityType: 'Project',
        entityId:   projectId,
        newValue:   { partnerId: id, canUpload, canViewDocs, canViewComms },
        ipAddress:  req.ip,
        metadata:   {},
      });

      // Notify the partner
      await sendNotification({
        userId: parseInt(id, 10),
        type:   'system',
        title:  `Project access granted — ${(project as any).customerName}`,
        body:   `You have been granted access to ${(project as any).address}`,
        meta:   { projectId: parseInt(projectId, 10) },
      });

      return res.json({ ok: true, created });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to grant access' });
    }
  }
);

// ─── DELETE /api/partners/:id/revoke/:projectId ───────────────────────────────
// Admin: revoke a partner's access to a specific project

router.delete(
  '/:id/revoke/:projectId',
  authenticate,
  authorize('Admin'),
  async (req: Request, res: Response) => {
    const { id, projectId } = req.params;
    const actorId = (req as any).user.id;

    try {
      const access = await PartnerProjectAccess.findOne({
        where: {
          userId:    parseInt(id, 10),
          projectId: parseInt(projectId, 10),
          revokedAt: null,
        },
      });

      if (!access) return res.status(404).json({ error: 'No active access found' });

      await access.update({ revokedAt: new Date() });

      await logAudit({
        userId:     actorId,
        action:     'partner.access_revoked',
        entityType: 'Project',
        entityId:   projectId,
        newValue:   { partnerId: id },
        ipAddress:  req.ip,
        metadata:   {},
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to revoke access' });
    }
  }
);

// ─── GET /api/partners/me/projects ───────────────────────────────────────────
// Partner: list their accessible projects

router.get(
  '/me/projects',
  authenticate,
  authorize('Partner'),
  async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    try {
      const accesses = await PartnerProjectAccess.findAll({
        where: { userId, revokedAt: null },
      });

      const projectIds = accesses.map((a: any) => a.projectId);
      if (projectIds.length === 0) return res.json({ projects: [] });

      const projects = await Project.findAll({
        where: { id: { [Op.in]: projectIds } },
        attributes: ['id', 'customerName', 'address', 'postcode', 'status', 'projectType'],
      });

      // Merge in permissions
      const result = projects.map((p: any) => {
        const access = accesses.find((a: any) => a.projectId === p.id);
        return {
          ...p.toJSON(),
          permissions: {
            canUpload:    (access as any)?.canUpload ?? false,
            canViewDocs:  (access as any)?.canViewDocs ?? false,
            canViewComms: (access as any)?.canViewComms ?? false,
          },
        };
      });

      return res.json({ projects: result });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load projects' });
    }
  }
);

// ─── GET /api/partners/me/projects/:projectId/files ───────────────────────────
// Partner: list files on a project they can access

router.get(
  '/me/projects/:projectId/files',
  authenticate,
  authorize('Partner'),
  partnerProjectGuard as any,
  async (req: Request, res: Response) => {
    const { projectId } = req.params;

    try {
      const files = await FileModel.findAll({
        where: { projectId: parseInt(projectId, 10) },
        order: [['uploadedAt', 'DESC']],
        attributes: ['id', 'fileName', 'fileUrl', 'category', 'stage', 'uploadedAt'],
      });

      return res.json({ files });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load files' });
    }
  }
);

// ─── POST /api/partners/me/projects/:projectId/files ─────────────────────────
// Partner: upload a file (if can_upload permission is set)

router.post(
  '/me/projects/:projectId/files',
  authenticate,
  authorize('Partner'),
  partnerProjectGuard as any,
  async (req: Request, res: Response) => {
    const access = (req as any).partnerAccess;

    if (!access?.canUpload) {
      return res.status(403).json({ error: 'Upload permission not granted for this project' });
    }

    // Delegate to the standard file upload flow (presign → S3 → confirm)
    // Partners use the same /api/files/presign + /api/files/upload endpoints
    // This endpoint just validates access — actual upload is via presigned URL
    return res.json({
      message: 'Use /api/files/presign to get an upload URL, then POST to /api/files/upload',
      projectId: req.params.projectId,
    });
  }
);

export default router;
