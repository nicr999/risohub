// ============================================================
// RISO HUB — routes/checklistEvidenceRoutes.ts
// Attach photo/file evidence to individual checklist items
// ============================================================

import { Router, Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ChecklistItem, FileModel, User } from '../models';
import { ChecklistEvidence } from '../models/newModels';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';

const router = Router();
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'eu-west-2',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined,
});

// GET /api/checklist/item/:itemId/evidence
router.get('/item/:itemId/evidence', authenticate, async (req: Request, res: Response) => {
  try {
    const evidence = await ChecklistEvidence.findAll({
      where: { checklistItemId: req.params.itemId },
      include: [
        {
          model: FileModel,
          as: 'file',
          attributes: ['id', 'fileUrl', 'category', 'uploadedAt'],
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name'],
        },
      ],
      order: [['uploadedAt', 'DESC']],
    });

    res.json(evidence);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklist evidence' });
  }
});

// POST /api/checklist/item/:itemId/evidence
// Body: { fileId, note } — file must already be uploaded via /api/files/upload
router.post('/item/:itemId/evidence', authenticate, authorize('Admin', 'Surveyor', 'Installer'), async (req: Request, res: Response) => {
  try {
    const checklistItemId = parseInt(req.params.itemId);
    const { fileId, note } = req.body;

    if (!fileId) return res.status(400).json({ error: 'fileId is required' });

    // Verify checklist item exists
    const item = await ChecklistItem.findByPk(checklistItemId);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    // Verify file exists
    const file = await FileModel.findByPk(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const evidence = await ChecklistEvidence.create({
      checklistItemId,
      fileId,
      note,
      uploadedBy: req.user!.id,
      uploadedAt: new Date(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'checklist_evidence.added',
      entityType: 'ChecklistEvidence',
      entityId: evidence.id,
      newValue: { checklistItemId, fileId, note },
      metadata: { checklistItemKey: item.key, checklistItemName: item.name },
      ipAddress: req.ip,
    });

    // Re-fetch with includes
    const full = await ChecklistEvidence.findByPk(evidence.id, {
      include: [
        { model: FileModel, as: 'file', attributes: ['id', 'fileUrl', 'category'] },
        { model: User, as: 'uploader', attributes: ['id', 'name'] },
      ],
    });

    res.status(201).json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to attach evidence' });
  }
});

// PATCH /api/checklist/item/:itemId/evidence/:evidenceId — update note
router.patch('/item/:itemId/evidence/:evidenceId', authenticate, async (req: Request, res: Response) => {
  try {
    const ev = await ChecklistEvidence.findOne({
      where: { id: req.params.evidenceId, checklistItemId: req.params.itemId },
    });

    if (!ev) return res.status(404).json({ error: 'Evidence not found' });

    // Only uploader or Admin can edit note
    if (ev.uploadedBy !== req.user!.id && req.user!.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ev.update({ note: req.body.note });
    res.json(ev);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update evidence note' });
  }
});

// DELETE /api/checklist/item/:itemId/evidence/:evidenceId
router.delete('/item/:itemId/evidence/:evidenceId', authenticate, async (req: Request, res: Response) => {
  try {
    const ev = await ChecklistEvidence.findOne({
      where: { id: req.params.evidenceId, checklistItemId: req.params.itemId },
    });

    if (!ev) return res.status(404).json({ error: 'Evidence not found' });

    // Only uploader or Admin can delete
    if (ev.uploadedBy !== req.user!.id && req.user!.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'checklist_evidence.removed',
      entityType: 'ChecklistEvidence',
      entityId: ev.id,
      oldValue: ev.toJSON(),
      ipAddress: req.ip,
    });

    await ev.destroy();
    res.json({ message: 'Evidence removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove evidence' });
  }
});

// POST /api/checklist/evidence/presign — S3 presign for direct evidence upload
router.post('/evidence/presign', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileName, fileType, projectId } = req.body;
    const key = `projects/${projectId}/checklist-evidence/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      ContentType: fileType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.json({ url, key, fileUrl: `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

export default router;
