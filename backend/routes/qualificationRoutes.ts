import { Router, Request, Response } from 'express';

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize } from '../auth/authMiddleware';
import { Notification, Qualification, User } from '../models/index';
import { logAudit } from '../services/auditService';
import { sendQualificationExpiryDigest } from '../services/emailService';
import sequelize from '../config/database';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

// ─── Pre-seeded qualification types ──────────────────────────────────────────

export const QUALIFICATION_TYPES = [
  { type: 'MCS Heat Pump Installer', category: 'MCS', required: true },
  { type: 'MCS Heat Pump Designer', category: 'MCS', required: true },
  { type: 'F-Gas Category I', category: 'Refrigerants', required: true },
  { type: 'RECC Membership', category: 'Consumer Code', required: true },
  { type: 'WRAS Approved Plumber', category: 'Water Regulations', required: false },
  { type: 'Part P Electrical', category: 'Electrical', required: false },
  { type: 'Gas Safe (if applicable)', category: 'Gas', required: false },
  { type: 'First Aid at Work', category: 'Health & Safety', required: false },
  { type: 'Asbestos Awareness', category: 'Health & Safety', required: false },
  { type: 'Manual Handling', category: 'Health & Safety', required: false },
  { type: 'Working at Height', category: 'Health & Safety', required: false },
  { type: 'CSCS Card', category: 'Construction', required: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ExpiryStatus = 'valid' | 'expiring' | 'expired';

function getExpiryStatus(qual: Qualification): ExpiryStatus {
  if (qual.neverExpires || !qual.expiresAt) return 'valid';
  const now = new Date();
  const expiry = new Date(qual.expiresAt);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 60) return 'expiring';
  return 'valid';
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── GET /api/qualifications ──────────────────────────────────────────────────

router.get('/', authenticate, authorize('Admin', 'Surveyor', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { staffId, category, expiryStatus, export: doExport } = req.query as Record<string, string>;

    const where: any = {};
    if (staffId) where.staffId = staffId;
    if (category) where.category = category;

    const qualifications = await Qualification.findAll({
      where,
      include: [{ model: User, as: 'staff', attributes: ['id', 'name', 'email', 'role'] }],
      order: [['expiresAt', 'ASC']],
    });

    // Enrich with expiry status
    const enriched = qualifications.map(q => ({
      ...q.toJSON(),
      expiryStatus: getExpiryStatus(q),
    }));

    // Filter by expiry status after enrichment
    const filtered = expiryStatus
      ? enriched.filter(q => q.expiryStatus === expiryStatus)
      : enriched;

    // CSV export for audit evidence
    if (doExport === 'csv') {
      const headers = ['Staff Name', 'Email', 'Type', 'Category', 'Cert Number', 'Issuing Body', 'Issued', 'Expires', 'Never Expires', 'Status', 'Notes'];
      const rows = filtered.map(q => [
        escapeCsv((q as any).staff?.name),
        escapeCsv((q as any).staff?.email),
        escapeCsv(q.type),
        escapeCsv(q.category),
        escapeCsv(q.certNumber),
        escapeCsv(q.issuingBody),
        escapeCsv(q.issuedAt),
        escapeCsv(q.expiresAt),
        escapeCsv(q.neverExpires),
        escapeCsv(q.expiryStatus),
        escapeCsv(q.notes),
      ].join(','));

      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="qualifications-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    res.json(filtered);
  } catch (err) {
    console.error('GET /api/qualifications error:', err);
    res.status(500).json({ error: 'Failed to fetch qualifications' });
  }
});

// ─── GET /api/qualifications/types ───────────────────────────────────────────

router.get('/types', authenticate, (_req: Request, res: Response) => {
  res.json(QUALIFICATION_TYPES);
});

// ─── GET /api/qualifications/summary ─────────────────────────────────────────
// Per-installer MCS compliance summary for the dashboard widget

router.get('/summary', authenticate, authorize('Admin', 'Surveyor', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const installers = await User.findAll({
      where: { role: 'Installer', active: true },
      attributes: ['id', 'name', 'email'],
    });

    const requiredTypes = QUALIFICATION_TYPES.filter(t => t.required).map(t => t.type);

    const summary = await Promise.all(
      installers.map(async installer => {
        const quals = await Qualification.findAll({ where: { staffId: installer.id } });
        const enriched = quals.map(q => ({ ...q.toJSON(), expiryStatus: getExpiryStatus(q) }));

        const hasRequired = requiredTypes.map(type => {
          const match = enriched.find(q => q.type === type);
          return {
            type,
            held: !!match,
            expiryStatus: match ? match.expiryStatus : null,
          };
        });

        const mcsCompliant = hasRequired.every(r => r.held && r.expiryStatus !== 'expired');

        return {
          staffId: installer.id,
          name: installer.name,
          email: installer.email,
          mcsCompliant,
          required: hasRequired,
          totalQuals: quals.length,
          expiring: enriched.filter(q => q.expiryStatus === 'expiring').length,
          expired: enriched.filter(q => q.expiryStatus === 'expired').length,
        };
      })
    );

    res.json(summary);
  } catch (err) {
    console.error('GET /api/qualifications/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch qualification summary' });
  }
});

// ─── POST /api/qualifications ─────────────────────────────────────────────────

router.post('/', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { staffId, type, category, certNumber, issuingBody, issuedAt, expiresAt, neverExpires = false, fileUrl, notes } = req.body;

    if (!staffId || !type || !category || !issuingBody || !issuedAt) {
      return res.status(400).json({ error: 'staffId, type, category, issuingBody and issuedAt are required' });
    }

    const staff = await User.findByPk(staffId);
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    if (!neverExpires && !expiresAt) {
      return res.status(400).json({ error: 'Either expiresAt or neverExpires must be set' });
    }

    const qualification = await Qualification.create({
      staffId,
      type,
      category,
      certNumber: certNumber || null,
      issuingBody,
      issuedAt: new Date(issuedAt),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      neverExpires,
      fileUrl: fileUrl || null,
      notes: notes || null,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'qualification.added',
      entityType: 'Qualification',
      entityId: qualification.id,
      newValue: qualification.toJSON(),
      ipAddress: req.ip,
    });

    res.status(201).json({ ...qualification.toJSON(), expiryStatus: getExpiryStatus(qualification) });
  } catch (err) {
    console.error('POST /api/qualifications error:', err);
    res.status(500).json({ error: 'Failed to add qualification' });
  }
});

// ─── PATCH /api/qualifications/:id ───────────────────────────────────────────

router.patch('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const qualification = await Qualification.findByPk(req.params.id);
    if (!qualification) return res.status(404).json({ error: 'Qualification not found' });

    const allowedFields = ['type', 'category', 'certNumber', 'issuingBody', 'issuedAt', 'expiresAt', 'neverExpires', 'fileUrl', 'notes'];
    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const oldValue = qualification.toJSON();
    await qualification.update(updates);

    await logAudit({
      userId: req.user!.id,
      action: 'qualification.updated',
      entityType: 'Qualification',
      entityId: qualification.id,
      oldValue,
      newValue: qualification.toJSON(),
      ipAddress: req.ip,
    });

    res.json({ ...qualification.toJSON(), expiryStatus: getExpiryStatus(qualification) });
  } catch (err) {
    console.error('PATCH /api/qualifications/:id error:', err);
    res.status(500).json({ error: 'Failed to update qualification' });
  }
});

// ─── DELETE /api/qualifications/:id ──────────────────────────────────────────

router.delete('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const qualification = await Qualification.findByPk(req.params.id);
    if (!qualification) return res.status(404).json({ error: 'Qualification not found' });

    const oldValue = qualification.toJSON();
    await qualification.destroy();

    await logAudit({
      userId: req.user!.id,
      action: 'qualification.deleted',
      entityType: 'Qualification',
      entityId: req.params.id,
      oldValue,
      ipAddress: req.ip,
    });

    res.json({ message: 'Qualification deleted' });
  } catch (err) {
    console.error('DELETE /api/qualifications/:id error:', err);
    res.status(500).json({ error: 'Failed to delete qualification' });
  }
});

// ─── POST /api/qualifications/presign ────────────────────────────────────────

router.post('/presign', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { staffId, fileName, mimeType } = req.body;

    if (!staffId || !fileName || !mimeType) {
      return res.status(400).json({ error: 'staffId, fileName and mimeType are required' });
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({ error: 'Only PDF and image files are allowed' });
    }

    const fileId = uuidv4();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `qualifications/${staffId}/${fileId}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      Metadata: { staffId },
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    const fileUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    res.json({ presignedUrl, s3Key, fileUrl, expiresIn: 300 });
  } catch (err) {
    console.error('POST /api/qualifications/presign error:', err);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// ─── POST /api/qualifications/check-expiry ────────────────────────────────────
// Called by daily cron at 08:00 — sends expiry digest and in-app notifications

router.post('/check-expiry', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    // Expiring within 60 days
    const expiring = await Qualification.findAll({
      where: {
        neverExpires: false,
        expiresAt: { [Op.between]: [now, in60Days] },
      },
      include: [{ model: User, as: 'staff', attributes: ['id', 'name', 'email'] }],
    });

    // Already expired
    const expired = await Qualification.findAll({
      where: {
        neverExpires: false,
        expiresAt: { [Op.lt]: now },
      },
      include: [{ model: User, as: 'staff', attributes: ['id', 'name', 'email'] }],
    });

    // Group by staff for digest email
    const byStaff: Record<string, { staff: any; expiring: any[]; expired: any[] }> = {};

    for (const q of [...expiring, ...expired]) {
      const staff = (q as any).staff;
      if (!staff) continue;
      if (!byStaff[staff.id]) byStaff[staff.id] = { staff, expiring: [], expired: [] };
      const status = getExpiryStatus(q);
      if (status === 'expiring') byStaff[staff.id].expiring.push(q);
      if (status === 'expired') byStaff[staff.id].expired.push(q);
    }

    // Send digest to admin and in-app notifications
    const admins = await User.findAll({ where: { role: 'Admin', active: true }, attributes: ['id', 'email', 'name'] });

    for (const admin of admins) {
      if (expiring.length > 0 || expired.length > 0) {
        await sendQualificationExpiryDigest({
          to: admin.email,
          adminName: admin.name,
          expiring: expiring.map(q => ({ ...q.toJSON(), staffName: (q as any).staff?.name })),
          expired: expired.map(q => ({ ...q.toJSON(), staffName: (q as any).staff?.name })),
        });

        // In-app notification
        await Notification.create({
          userId: admin.id,
          type: expired.length > 0 ? 'qual_expired' : 'qual_expiring',
          title: expired.length > 0 ? `${expired.length} qualification(s) expired` : `${expiring.length} qualification(s) expiring soon`,
          body: expired.length > 0
            ? `${expired.length} staff qualification(s) have expired and require immediate attention.`
            : `${expiring.length} staff qualification(s) will expire within 60 days.`,
          meta: { expiringCount: expiring.length, expiredCount: expired.length },
        });
      }
    }

    res.json({
      checked: expiring.length + expired.length,
      expiring: expiring.length,
      expired: expired.length,
      staffAffected: Object.keys(byStaff).length,
    });
  } catch (err) {
    console.error('POST /api/qualifications/check-expiry error:', err);
    res.status(500).json({ error: 'Failed to check qualification expiry' });
  }
});

export default router;
