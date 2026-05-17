import { Router, Request, Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize } from '../auth/authMiddleware';
import { FileModel } from '../models/index';

import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

// Allowed MIME types for upload
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── POST /api/files/presign ──────────────────────────────────────────────────
// Returns a pre-signed S3 PUT URL. Client uploads directly to S3, then calls
// POST /api/files/upload to register the file record in the database.

router.post('/presign', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, fileName, mimeType, category, stage, sizeBytes } = req.body;

    if (!projectId || !fileName || !mimeType || !category || !stage) {
      return res.status(400).json({ error: 'projectId, fileName, mimeType, category and stage are required' });
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: `File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}` });
    }

    if (sizeBytes && sizeBytes > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ error: 'File exceeds 50 MB limit' });
    }

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const user = req.user!;

    // Installers scoped to assigned projects
    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build the S3 key: projects/{projectId}/{stage}/{category}/{uuid}-{fileName}
    const fileId = uuidv4();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `projects/${projectId}/${stage}/${category}/${fileId}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      Metadata: {
        projectId,
        uploadedBy: user.id,
        category,
        stage,
      },
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    res.json({
      presignedUrl,
      s3Key,
      fileId,
      expiresIn: 300,
    });
  } catch (err) {
    console.error('POST /api/files/presign error:', err);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// ─── POST /api/files/upload ───────────────────────────────────────────────────
// Called after client has uploaded to S3 — registers the file record in DB
// and publishes a drive sync event.

router.post('/upload', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, s3Key, fileName, mimeType, category, stage, sizeBytes } = req.body;

    if (!projectId || !s3Key || !fileName || !mimeType || !category || !stage) {
      return res.status(400).json({ error: 'projectId, s3Key, fileName, mimeType, category and stage are required' });
    }

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const user = req.user!;

    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    const file = await FileModel.create({
      projectId,
      uploadedBy: user.id,
      fileUrl,
      driveUrl: null, // Populated after Drive sync
      category,
      stage,
    });

    // Queue Drive sync
    await publishEvent('file.uploaded', {
      fileId: file.id,
      projectId,
      s3Key,
      fileName,
      mimeType,
      stage,
      uploadedBy: user.id,
    });

    // Compliance Agent event
    await publishEvent('document.uploaded', {
      projectId,
      fileId: file.id,
      category,
      stage,
    });

    await logAudit({
      userId: user.id,
      action: 'file.uploaded',
      entityType: 'File',
      entityId: file.id,
      newValue: { projectId, s3Key, category, stage, fileName },
      ipAddress: req.ip,
    });

    res.status(201).json(file);
  } catch (err) {
    console.error('POST /api/files/upload error:', err);
    res.status(500).json({ error: 'Failed to register file' });
  }
});

// ─── GET /api/files/:projectId ────────────────────────────────────────────────
// List all files for a project, optionally filtered by stage or category

router.get('/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { stage, category } = req.query as Record<string, string>;
    const user = req.user!;

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where: any = { projectId };
    if (stage) where.stage = stage;
    if (category) where.category = category;

    const files = await FileModel.findAll({
      where,
      order: [['uploadedAt', 'DESC']],
    });

    res.json(files);
  } catch (err) {
    console.error('GET /api/files/:projectId error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// ─── GET /api/files/download/:fileId ─────────────────────────────────────────
// Returns a short-lived pre-signed S3 GET URL for secure download

router.get('/download/:fileId', authenticate, async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findByPk(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const user = req.user!;
    const project = await Project.findByPk(file.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Extract s3Key from the stored URL
    const url = new URL(file.fileUrl);
    const s3Key = url.pathname.slice(1); // Remove leading /

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 }); // 60 seconds

    res.json({ downloadUrl: signedUrl, expiresIn: 60 });
  } catch (err) {
    console.error('GET /api/files/download/:fileId error:', err);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// ─── DELETE /api/files/:fileId ────────────────────────────────────────────────

router.delete('/:fileId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findByPk(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const oldValue = file.toJSON();
    await file.destroy();

    await logAudit({
      userId: req.user!.id,
      action: 'file.deleted',
      entityType: 'File',
      entityId: req.params.fileId,
      oldValue,
      ipAddress: req.ip,
    });

    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error('DELETE /api/files/:fileId error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
