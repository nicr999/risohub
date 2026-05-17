import { Router, Request, Response } from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument } from 'pdf-lib';

import { authenticate, authorize } from '../auth/authMiddleware';
import { Signature, Document, Notification, Project, User } from '../models/index';


import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';
import {
  sendSignatureRequestEmail,
  sendSignatureConfirmation,
  sendSignatureDeclined,
} from '../services/emailService';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRawToken(): string {
  return crypto.randomBytes(48).toString('base64url'); // 384-bit
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Embeds a base64 PNG signature image into an existing PDF at the bottom of the
 * last page, re-uploads to S3, and returns the new S3 key + SHA256 hash.
 */
async function embedSignatureInPdf(
  originalPdfUrl: string,
  signatureDataBase64: string,
  projectId: string,
  documentId: string
): Promise<{ s3Key: string; pdfUrl: string; sha256Hash: string; sizeBytes: number }> {
  // Download original PDF from S3
  const url = new URL(originalPdfUrl);
  const originalKey = url.pathname.slice(1);

  const s3Object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: originalKey }));
  const originalBuffer = await streamToBuffer(s3Object.Body as Readable);

  // Load with pdf-lib
  const pdfDoc = await PDFDocument.load(originalBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];

  // Strip data URL prefix if present
  const base64Data = signatureDataBase64.replace(/^data:image\/png;base64,/, '');
  const signatureImageBytes = Buffer.from(base64Data, 'base64');

  const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
  const { width } = lastPage.getSize();

  // Draw signature in the customer signature box area
  lastPage.drawImage(signatureImage, {
    x: 50,
    y: 80,
    width: 180,
    height: 60,
  });

  const signedPdfBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedPdfBytes);

  const sha256Hash = crypto.createHash('sha256').update(signedBuffer).digest('hex');
  const newKey = `projects/${projectId}/documents/signed-${documentId}-${uuidv4()}.pdf`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: newKey,
    Body: signedBuffer,
    ContentType: 'application/pdf',
    Metadata: { projectId, documentId, signed: 'true' },
  }));

  const newPdfUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`;

  return {
    s3Key: newKey,
    pdfUrl: newPdfUrl,
    sha256Hash,
    sizeBytes: signedBuffer.byteLength,
  };
}

// ─── POST /api/signatures/request ─────────────────────────────────────────────
// Surveyor+ creates a signature request, sends email to customer

router.post('/request', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { projectId, documentId, customerName, customerEmail, role = 'Customer' } = req.body;

    if (!projectId || !documentId || !customerEmail) {
      return res.status(400).json({ error: 'projectId, documentId and customerEmail are required' });
    }

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const document = await Document.findByPk(documentId);
    if (!document) return res.status(404).json({ error: 'Document not found' });

    if (document.projectId !== projectId) {
      return res.status(400).json({ error: 'Document does not belong to this project' });
    }

    // Check for existing pending request
    const existing = await Signature.findOne({
      where: { projectId, documentId, status: 'pending' },
    });
    if (existing) {
      return res.status(409).json({ error: 'A pending signature request already exists for this document' });
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    const signature = await Signature.create({
      projectId,
      documentId,
      requestedBy: req.user!.id,
      signedBy: null,
      role,
      status: 'pending',
      tokenHash,
    });

    const signUrl = `${process.env.FRONTEND_URL}/sign?token=${rawToken}`;

    await sendSignatureRequestEmail({
      to: customerEmail,
      recipientName: customerName || project.customerName,
      customerName: project.customerName,
      address: `${project.address}, ${project.postcode}`,
      role,
      signLink: signUrl,
      message: `Please review and sign the ${role} document for your heat pump installation.`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'signature.requested',
      entityType: 'Signature',
      entityId: signature.id,
      newValue: { projectId, documentId, customerEmail, role },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: signature.id,
      status: signature.status,
      message: `Signature request sent to ${customerEmail}`,
    });
  } catch (err) {
    console.error('POST /api/signatures/request error:', err);
    res.status(500).json({ error: 'Failed to create signature request' });
  }
});

// ─── GET /api/signatures ──────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, status } = req.query as Record<string, string>;
    const user = req.user!;

    const where: any = {};
    if (projectId) {
      // Installer scope
      if (user.role === 'Installer') {
        const project = await Project.findByPk(projectId);
        if (!project || project.assignedTo !== user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
      where.projectId = projectId;
    }
    if (status) where.status = status;

    const signatures = await Signature.findAll({
      where,
      include: [
        { model: Document, attributes: ['id', 'docType', 'version'] },
        { model: Project, attributes: ['id', 'customerName', 'address'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Strip tokenHash from response
    const safe = signatures.map(s => {
      const json = s.toJSON() as any;
      delete json.tokenHash;
      return json;
    });

    res.json(safe);
  } catch (err) {
    console.error('GET /api/signatures error:', err);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

// ─── GET /api/signatures/:token/info ─────────────────────────────────────────
// PUBLIC — customer loads this page before signing

router.get('/:token/info', async (req: Request, res: Response) => {
  try {
    const tokenHash = hashToken(req.params.token);

    const signature = await Signature.findOne({ where: { tokenHash } });
    if (!signature) return res.status(404).json({ error: 'Invalid or expired signature link' });

    if (signature.status !== 'pending') {
      return res.status(410).json({
        error: 'This signature request has already been completed',
        status: signature.status,
      });
    }

    const project = await Project.findByPk(signature.projectId, {
      attributes: ['customerName', 'address', 'postcode', 'projectType'],
    });
    const document = await Document.findByPk(signature.documentId, {
      attributes: ['docType', 'version', 'generatedAt'],
    });

    res.json({
      signatureId: signature.id,
      status: signature.status,
      role: signature.role,
      project,
      document,
    });
  } catch (err) {
    console.error('GET /api/signatures/:token/info error:', err);
    res.status(500).json({ error: 'Failed to load signature info' });
  }
});

// ─── POST /api/signatures/:token/sign ────────────────────────────────────────
// PUBLIC — customer submits their signature

router.post('/:token/sign', async (req: Request, res: Response) => {
  try {
    const { signatureData, signedBy, ipAddress: clientIp } = req.body;

    if (!signatureData || !signedBy) {
      return res.status(400).json({ error: 'signatureData and signedBy are required' });
    }

    const tokenHash = hashToken(req.params.token);
    const signature = await Signature.findOne({ where: { tokenHash } });

    if (!signature) return res.status(404).json({ error: 'Invalid or expired signature link' });

    if (signature.status !== 'pending') {
      return res.status(410).json({
        error: 'This signature request has already been completed',
        status: signature.status,
      });
    }

    const document = await Document.findByPk(signature.documentId);
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const project = await Project.findByPk(signature.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Embed signature in PDF and re-upload
    const { pdfUrl, sha256Hash, sizeBytes } = await embedSignatureInPdf(
      document.pdfUrl,
      signatureData,
      signature.projectId,
      signature.documentId
    );

    const signedAt = new Date();
    const metadata = {
      signedAt: signedAt.toISOString(),
      ipAddress: clientIp || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    await signature.update({
      status: 'signed',
      signedBy,
      signatureData,
      pdfUrl,
      hash: sha256Hash,
      metadata,
    });

    // Update document record with signed PDF URL
    await document.update({ pdfUrl, sha256Hash, sizeBytes });

    // Drive sync for signed PDF
    await publishEvent('file.uploaded', {
      fileId: signature.id,
      projectId: signature.projectId,
      fileName: `signed-${document.docType}-v${document.version}.pdf`,
      mimeType: 'application/pdf',
      stage: project.status,
    });

    // Workflow Agent event
    await publishEvent('signatures.captured', {
      projectId: signature.projectId,
      signatureId: signature.id,
      documentId: signature.documentId,
      signedBy,
      timestamp: signedAt.toISOString(),
    });

    // Notify the requester
    const requester = await User.findByPk(signature.requestedBy);
    if (requester) {
      await Notification.create({
        userId: requester.id,
        type: 'signature_received',
        title: 'Document signed',
        body: `${signedBy} has signed the ${document.docType} document for ${project.customerName}.`,
        meta: { projectId: signature.projectId, signatureId: signature.id },
      });

      await sendSignatureConfirmation({
        to: requester.email,
        recipientName: requester.name,
        customerName: project.customerName,
        address: `${project.address}, ${project.postcode}`,
        role: signature.role,
        signedAt,
        hash: sha256Hash,
      });
    }

    await logAudit({
      userId: null,
      action: 'signature.signed',
      entityType: 'Signature',
      entityId: signature.id,
      newValue: { signedBy, pdfUrl, sha256Hash, metadata },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Document signed successfully',
      signatureId: signature.id,
      signedAt: signedAt.toISOString(),
    });
  } catch (err) {
    console.error('POST /api/signatures/:token/sign error:', err);
    res.status(500).json({ error: 'Failed to process signature' });
  }
});

// ─── POST /api/signatures/:token/decline ─────────────────────────────────────
// PUBLIC — customer declines to sign

router.post('/:token/decline', async (req: Request, res: Response) => {
  try {
    const { reason, declinedBy } = req.body;

    const tokenHash = hashToken(req.params.token);
    const signature = await Signature.findOne({ where: { tokenHash } });

    if (!signature) return res.status(404).json({ error: 'Invalid or expired signature link' });
    if (signature.status !== 'pending') {
      return res.status(410).json({ error: 'This link has already been used', status: signature.status });
    }

    await signature.update({
      status: 'declined',
      metadata: { reason, declinedBy, declinedAt: new Date().toISOString() },
    });

    const project = await Project.findByPk(signature.projectId);
    const document = await Document.findByPk(signature.documentId);
    const requester = await User.findByPk(signature.requestedBy);

    if (requester && project && document) {
      await Notification.create({
        userId: requester.id,
        type: 'signature_received',
        title: 'Signature declined',
        body: `${declinedBy || 'The customer'} declined to sign the ${document.docType} document for ${project.customerName}.`,
        meta: { projectId: signature.projectId, signatureId: signature.id, declined: true },
      });

      await sendSignatureDeclined({
        to: requester.email,
        requesterName: requester.name,
        declinedBy: declinedBy || 'The customer',
        reason: reason || 'No reason provided',
        projectAddress: `${project.address}, ${project.postcode}`,
        docType: document.docType,
      });
    }

    await logAudit({
      userId: null,
      action: 'signature.declined',
      entityType: 'Signature',
      entityId: signature.id,
      newValue: { reason, declinedBy },
      ipAddress: req.ip,
    });

    res.json({ message: 'Signature declined', signatureId: signature.id });
  } catch (err) {
    console.error('POST /api/signatures/:token/decline error:', err);
    res.status(500).json({ error: 'Failed to process decline' });
  }
});

// ─── POST /api/signatures/verify ─────────────────────────────────────────────
// Admin — verifies signed PDF integrity

router.post('/verify', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { signatureId } = req.body;
    if (!signatureId) return res.status(400).json({ error: 'signatureId is required' });

    const signature = await Signature.findByPk(signatureId);
    if (!signature) return res.status(404).json({ error: 'Signature not found' });

    if (signature.status !== 'signed' || !signature.pdfUrl) {
      return res.status(400).json({ error: 'This signature has not been completed' });
    }

    const url = new URL(signature.pdfUrl);
    const s3Key = url.pathname.slice(1);

    const s3Object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    const buffer = await streamToBuffer(s3Object.Body as Readable);
    const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const intact = computedHash === signature.hash;

    await logAudit({
      userId: req.user!.id,
      action: 'signature.verified',
      entityType: 'Signature',
      entityId: signatureId,
      newValue: { intact, computedHash, storedHash: signature.hash },
      ipAddress: req.ip,
    });

    res.json({
      signatureId,
      intact,
      storedHash: signature.hash,
      computedHash,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('POST /api/signatures/verify error:', err);
    res.status(500).json({ error: 'Failed to verify signature' });
  }
});

// ─── POST /api/signatures/:id/admin-override ─────────────────────────────────
// Admin override — marks a signature as signed without the customer token flow

router.post('/:id/admin-override', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required for admin override' });

    const signature = await Signature.findByPk(req.params.id);
    if (!signature) return res.status(404).json({ error: 'Signature not found' });

    if (signature.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending signatures can be overridden' });
    }

    const admin = await User.findByPk(req.user!.id, { attributes: ['id', 'name', 'email'] });

    await signature.update({
      status: 'signed',
      signedBy: `Admin override — ${admin?.name}`,
      metadata: {
        override: true,
        reason,
        overriddenBy: req.user!.id,
        overriddenAt: new Date().toISOString(),
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: 'signature.adminOverride',
      entityType: 'Signature',
      entityId: signature.id,
      newValue: { reason, overriddenBy: req.user!.id },
      ipAddress: req.ip,
      metadata: { warning: 'Admin override used — ensure documented justification exists' },
    });

    res.json({
      message: 'Signature overridden by admin',
      signatureId: signature.id,
    });
  } catch (err) {
    console.error('POST /api/signatures/:id/admin-override error:', err);
    res.status(500).json({ error: 'Failed to apply admin override' });
  }
});

export default router;
