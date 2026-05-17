// ============================================================
// RISO HUB — routes/subcontractorRoutes.ts
// Subcontractor directory, qualifications, and project assignments
// ============================================================

import { Router, Request, Response } from 'express';
import { Project, User } from '../models';
import { Subcontractor, SubcontractorQualification, SubcontractorAssignment } from '../models/newModels';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import AWS from 'aws-sdk';

const router = Router();
const s3 = new AWS.S3();

// ─────────────────────────────────────────────
// SUBCONTRACTOR CRUD
// ─────────────────────────────────────────────

// GET /api/subcontractors?active=true&trade=
router.get('/', authenticate, authorize('Admin', 'Surveyor', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { active, trade } = req.query;
    const where: any = {};
    if (active !== undefined) where.active = active === 'true';

    const subs = await Subcontractor.findAll({
      where,
      include: [{ model: SubcontractorQualification, as: 'qualifications' }],
      order: [['name', 'ASC']],
    });

    // Filter by trade if provided
    const result = trade
      ? subs.filter(s => s.trades.includes(trade as string))
      : subs;

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subcontractors' });
  }
});

// GET /api/subcontractors/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const sub = await Subcontractor.findByPk(req.params.id, {
      include: [
        { model: SubcontractorQualification, as: 'qualifications' },
        {
          model: SubcontractorAssignment, as: 'assignments',
          include: [{ model: Project, attributes: ['id', 'customerName', 'address', 'status'] }],
        },
      ],
    });

    if (!sub) return res.status(404).json({ error: 'Subcontractor not found' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subcontractor' });
  }
});

// POST /api/subcontractors
router.post('/', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { name, company, email, phone, trades, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const sub = await Subcontractor.create({ name, company, email, phone, trades: trades || [], notes, active: true });

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor.created',
      entityType: 'Subcontractor',
      entityId: sub.id,
      newValue: sub.toJSON(),
      ipAddress: req.ip,
    });

    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create subcontractor' });
  }
});

// PATCH /api/subcontractors/:id
router.patch('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const sub = await Subcontractor.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subcontractor not found' });

    const old = sub.toJSON();
    await sub.update(req.body);

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor.updated',
      entityType: 'Subcontractor',
      entityId: sub.id,
      oldValue: old,
      newValue: sub.toJSON(),
      ipAddress: req.ip,
    });

    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subcontractor' });
  }
});

// DELETE /api/subcontractors/:id — soft delete (set active=false)
router.delete('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const sub = await Subcontractor.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subcontractor not found' });

    await sub.update({ active: false });

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor.deactivated',
      entityType: 'Subcontractor',
      entityId: sub.id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Subcontractor deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate subcontractor' });
  }
});

// ─────────────────────────────────────────────
// QUALIFICATIONS
// ─────────────────────────────────────────────

// GET /api/subcontractors/:id/qualifications
router.get('/:id/qualifications', authenticate, async (req: Request, res: Response) => {
  try {
    const quals = await SubcontractorQualification.findAll({
      where: { subcontractorId: req.params.id },
      order: [['expiresAt', 'ASC']],
    });
    res.json(quals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch qualifications' });
  }
});

// POST /api/subcontractors/:id/qualifications
router.post('/:id/qualifications', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const qual = await SubcontractorQualification.create({
      subcontractorId: parseInt(req.params.id),
      ...req.body,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor_qual.created',
      entityType: 'SubcontractorQualification',
      entityId: qual.id,
      newValue: qual.toJSON(),
      ipAddress: req.ip,
    });

    res.status(201).json(qual);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add qualification' });
  }
});

// PATCH /api/subcontractors/:id/qualifications/:qualId
router.patch('/:id/qualifications/:qualId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const qual = await SubcontractorQualification.findOne({
      where: { id: req.params.qualId, subcontractorId: req.params.id },
    });
    if (!qual) return res.status(404).json({ error: 'Qualification not found' });

    const old = qual.toJSON();
    await qual.update(req.body);

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor_qual.updated',
      entityType: 'SubcontractorQualification',
      entityId: qual.id,
      oldValue: old,
      newValue: qual.toJSON(),
      ipAddress: req.ip,
    });

    res.json(qual);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update qualification' });
  }
});

// DELETE /api/subcontractors/:id/qualifications/:qualId
router.delete('/:id/qualifications/:qualId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const qual = await SubcontractorQualification.findOne({
      where: { id: req.params.qualId, subcontractorId: req.params.id },
    });
    if (!qual) return res.status(404).json({ error: 'Qualification not found' });

    await qual.destroy();
    res.json({ message: 'Qualification deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete qualification' });
  }
});

// POST /api/subcontractors/presign — S3 presign for cert uploads
router.post('/presign', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;
    const key = `subcontractor-quals/${Date.now()}-${fileName}`;

    const url = s3.getSignedUrl('putObject', {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      ContentType: fileType,
      Expires: 300,
    });

    res.json({ url, key, fileUrl: `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// ─────────────────────────────────────────────
// PROJECT ASSIGNMENTS
// ─────────────────────────────────────────────

// GET /api/subcontractors/assignments/:projectId
router.get('/assignments/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const assignments = await SubcontractorAssignment.findAll({
      where: { projectId: req.params.projectId },
      include: [
        {
          model: Subcontractor,
          include: [{ model: SubcontractorQualification, as: 'qualifications' }],
        },
        { model: User, as: 'assigner', attributes: ['id', 'name'] },
      ],
    });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project subcontractors' });
  }
});

// POST /api/subcontractors/assignments/:projectId
router.post('/assignments/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { subcontractorId, role } = req.body;
    if (!subcontractorId) return res.status(400).json({ error: 'subcontractorId is required' });

    const [assignment, created] = await SubcontractorAssignment.findOrCreate({
      where: { projectId: req.params.projectId, subcontractorId },
      defaults: { role, assignedBy: req.user!.id, assignedAt: new Date() },
    });

    if (!created) return res.status(409).json({ error: 'Subcontractor already assigned to this project' });

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor.assigned',
      entityType: 'SubcontractorAssignment',
      entityId: assignment.id,
      newValue: assignment.toJSON(),
      ipAddress: req.ip,
    });

    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign subcontractor' });
  }
});

// DELETE /api/subcontractors/assignments/:assignmentId
router.delete('/assignments/remove/:assignmentId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const assignment = await SubcontractorAssignment.findByPk(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    await logAudit({
      userId: req.user!.id,
      action: 'subcontractor.unassigned',
      entityType: 'SubcontractorAssignment',
      entityId: assignment.id,
      oldValue: assignment.toJSON(),
      ipAddress: req.ip,
    });

    await assignment.destroy();
    res.json({ message: 'Subcontractor removed from project' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove subcontractor' });
  }
});

export default router;
