import { Router, Request, Response } from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Readable } from 'stream';

import { authenticate, authorize, require2FA } from '../auth/authMiddleware';
import { Document, ChecklistItem } from '../models/index';


import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';
import { fireWebhook } from '../services/webhookService';
import { broadcastToPortal } from '../services/portalWsService';
import { broadcastToStaff } from '../services/staffWsService';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET!;

// pdfmake fonts (standard — no external font files needed for server)
const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function statusLabel(status: string): string {
  return { complete: '✓ Complete', noncompliant: '✗ Non-Compliant', na: 'N/A', pending: '— Pending' }[status] ?? status;
}

// ─── Build pdfmake document definition ───────────────────────────────────────

function buildHandoverDocDef(
  project: any,
  assignee: any,
  checklistItems: any[],
  generatedBy: any,
  sha256Hash: string,
  version: number
): TDocumentDefinitions {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const sections = ['S1', 'S2', 'S3', 'S4', 'S5'];
  const sectionNames: Record<string, string> = {
    S1: 'S1 — System Design',
    S2: 'S2 — Installation',
    S3: 'S3 — Commissioning',
    S4: 'S4 — Handover',
    S5: 'S5 — Documentation',
  };

  const checklistSection = sections.flatMap(s => {
    const items = checklistItems.filter(i => i.section === s);
    if (!items.length) return [];
    return [
      { text: sectionNames[s], style: 'sectionHeader', margin: [0, 16, 0, 6] },
      {
        table: {
          widths: ['*', 80, 100],
          body: [
            [
              { text: 'Item', style: 'tableHeader' },
              { text: 'Ref', style: 'tableHeader' },
              { text: 'Status', style: 'tableHeader' },
            ],
            ...items.map(item => [
              { text: item.name, fontSize: 9 },
              { text: item.ref, fontSize: 9, color: '#666666' },
              { text: statusLabel(item.status), fontSize: 9, color: item.status === 'complete' ? '#2e7d32' : item.status === 'noncompliant' ? '#c62828' : '#555555' },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
    ];
  });

  const required = checklistItems.filter(i => i.required && i.status !== 'na');
  const complete = required.filter(i => i.status === 'complete');
  const compliancePct = required.length > 0 ? Math.round((complete.length / required.length) * 100) : 0;

  return {
    pageSize: 'A4',
    pageMargins: [50, 70, 50, 70],
    header: {
      columns: [
        { text: 'RISO HOME', bold: true, fontSize: 11, color: '#7A8465', margin: [50, 20, 0, 0] },
        { text: `RISO HUB — MCS Handover Document v${version}`, fontSize: 8, color: '#999999', alignment: 'right', margin: [0, 24, 50, 0] },
      ],
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `SHA256: ${sha256Hash.slice(0, 32)}...`, fontSize: 7, color: '#999999', margin: [50, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8, color: '#999999', margin: [0, 0, 50, 0] },
      ],
    }),
    content: [
      // Cover
      { text: 'Heat Pump Installation', fontSize: 10, color: '#7A8465', margin: [0, 0, 0, 4] },
      { text: 'MCS Handover Document', fontSize: 24, bold: true, color: '#333333' },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 495, y2: 8, lineWidth: 2, lineColor: '#7A8465' }], margin: [0, 8, 0, 20] },

      // Project details
      {
        columns: [
          {
            stack: [
              { text: 'Customer', style: 'label' },
              { text: project.customerName, style: 'value' },
              { text: 'Address', style: 'label', margin: [0, 8, 0, 0] },
              { text: `${project.address}, ${project.postcode}`, style: 'value' },
              { text: 'System Type', style: 'label', margin: [0, 8, 0, 0] },
              { text: project.projectType === 'ASHP' ? 'Air Source Heat Pump (ASHP)' : 'Ground Source Heat Pump (GSHP)', style: 'value' },
            ],
          },
          {
            stack: [
              { text: 'Installer', style: 'label' },
              { text: assignee?.name ?? 'Unassigned', style: 'value' },
              { text: 'Document Date', style: 'label', margin: [0, 8, 0, 0] },
              { text: dateStr, style: 'value' },
              { text: 'MCS Compliance', style: 'label', margin: [0, 8, 0, 0] },
              { text: `${compliancePct}%`, style: 'value', color: compliancePct === 100 ? '#2e7d32' : '#c62828', bold: true },
            ],
          },
        ],
        margin: [0, 0, 0, 24],
      },

      // Checklist
      { text: 'MCS MIS 3005 Compliance Checklist', style: 'heading', margin: [0, 0, 0, 8] },
      ...checklistSection,

      // Signature placeholder
      { text: 'Signatures', style: 'heading', margin: [0, 24, 0, 8], pageBreak: 'before' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              { text: 'Customer Signature', style: 'tableHeader' },
              { text: 'Installer Signature', style: 'tableHeader' },
            ],
            [
              { text: '\n\n\n', fontSize: 9 },
              { text: '\n\n\n', fontSize: 9 },
            ],
            [
              { text: 'Name: ________________________________', fontSize: 9 },
              { text: `Name: ${assignee?.name ?? ''}`, fontSize: 9 },
            ],
            [
              { text: 'Date: ________________________________', fontSize: 9 },
              { text: `Date: ${dateStr}`, fontSize: 9 },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 24],
      },

      // Generated by
      { text: `Generated by ${generatedBy.name} on ${dateStr}`, fontSize: 8, color: '#999999', alignment: 'center', margin: [0, 16, 0, 0] },
    ],
    styles: {
      heading: { fontSize: 14, bold: true, color: '#333333' },
      sectionHeader: { fontSize: 11, bold: true, color: '#7A8465' },
      tableHeader: { fontSize: 9, bold: true, fillColor: '#f0f1ec', color: '#333333' },
      label: { fontSize: 8, color: '#888888', margin: [0, 0, 0, 2] },
      value: { fontSize: 10, color: '#333333' },
    },
    defaultStyle: { font: 'Roboto' },
  };
}

// ─── GET /api/documents?projectId=xxx ─────────────────────────────────────────

router.get('/', authenticate, authorize('Admin', 'Surveyor', 'Auditor', 'Installer'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as Record<string, string>;
    const user = req.user!;

    const where: any = {};
    if (projectId) {
      where.projectId = projectId;

      // Installer scope check
      if (user.role === 'Installer') {
        const project = await Project.findByPk(projectId);
        if (!project || project.assignedTo !== user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    } else if (user.role === 'Installer') {
      // Installer must specify a projectId
      return res.status(400).json({ error: 'projectId is required for Installer role' });
    }

    const documents = await Document.findAll({
      where,
      include: [{ model: User, as: 'generator', attributes: ['id', 'name', 'email'] }],
      order: [['generatedAt', 'DESC']],
    });

    res.json(documents);
  } catch (err) {
    console.error('GET /api/documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ─── POST /api/documents/generate ─────────────────────────────────────────────

router.post('/generate', authenticate, authorize('Admin', 'Surveyor'), require2FA, async (req: Request, res: Response) => {
  try {
    const { projectId, docType = 'handover' } = req.body;

    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const validDocTypes = ['handover', 'commissioning', 'riskassessment'];
    if (!validDocTypes.includes(docType)) {
      return res.status(400).json({ error: `docType must be one of: ${validDocTypes.join(', ')}` });
    }

    const project = await Project.findByPk(projectId, {
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }],
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check readyForHandover — all required items must be complete, none non-compliant
    const checklistItems = await ChecklistItem.findAll({ where: { projectId } });
    const required = checklistItems.filter(i => i.required && i.status !== 'na');
    const nonCompliant = checklistItems.filter(i => i.status === 'noncompliant');

    if (required.length === 0) {
      return res.status(400).json({ error: 'No checklist items found. Please seed the checklist first.' });
    }

    const allComplete = required.every(i => i.status === 'complete');
    if (!allComplete) {
      const pending = required.filter(i => i.status !== 'complete').length;
      return res.status(400).json({ error: `${pending} required checklist item(s) are not yet complete.` });
    }

    if (nonCompliant.length > 0) {
      return res.status(400).json({ error: `${nonCompliant.length} checklist item(s) are marked non-compliant. Resolve before generating.` });
    }

    // Determine version number
    const existingDocs = await Document.count({ where: { projectId, docType } });
    const version = existingDocs + 1;

    const generatedBy = await User.findByPk(req.user!.id, { attributes: ['id', 'name', 'email'] });
    if (!generatedBy) return res.status(404).json({ error: 'Generating user not found' });

    // Build the PDF (placeholder hash — real hash computed after render)
    const placeholderHash = 'pending';
    const docDef = buildHandoverDocDef(
      project.toJSON(),
      (project as any).assignee,
      checklistItems.map(i => i.toJSON()),
      generatedBy.toJSON(),
      placeholderHash,
      version
    );

    // Render PDF to buffer
    const pdfDoc = printer.createPdfKitDocument(docDef);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    let pdfBuffer = Buffer.concat(chunks);

    // Compute SHA256 hash of the PDF
    const sha256Hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Re-render with the real hash embedded in the footer
    const finalDocDef = buildHandoverDocDef(
      project.toJSON(),
      (project as any).assignee,
      checklistItems.map(i => i.toJSON()),
      generatedBy.toJSON(),
      sha256Hash,
      version
    );

    const finalPdfDoc = printer.createPdfKitDocument(finalDocDef);
    const finalChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      finalPdfDoc.on('data', (chunk: Buffer) => finalChunks.push(chunk));
      finalPdfDoc.on('end', resolve);
      finalPdfDoc.on('error', reject);
      finalPdfDoc.end();
    });
    pdfBuffer = Buffer.concat(finalChunks);

    // Upload to S3
    const fileId = uuidv4();
    const s3Key = `projects/${projectId}/documents/${docType}-v${version}-${fileId}.pdf`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: { projectId, docType, version: String(version), generatedBy: req.user!.id },
    }));

    const pdfUrl = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Persist document record
    const document = await Document.create({
      projectId,
      docType,
      pdfUrl,
      driveUrl: null,
      version,
      sha256Hash,
      sizeBytes: pdfBuffer.byteLength,
      sections: checklistItems.map(i => ({ key: i.key, status: i.status })),
      generatedBy: req.user!.id,
      generatedAt: new Date(),
    });

    // Queue Drive sync
    await publishEvent('file.uploaded', {
      fileId: document.id,
      projectId,
      s3Key,
      fileName: `${docType}-v${version}.pdf`,
      mimeType: 'application/pdf',
      stage: project.status,
      uploadedBy: req.user!.id,
    });

    // Workflow Agent event
    await publishEvent('handover.generated', {
      projectId,
      documentId: document.id,
      docType,
      version,
      generatedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    await logAudit({
      userId: req.user!.id,
      action: 'document.generated',
      entityType: 'Document',
      entityId: document.id,
      newValue: { projectId, docType, version, sha256Hash, sizeBytes: pdfBuffer.byteLength },
      ipAddress: req.ip,
    });

    fireWebhook('document.uploaded', {
      projectId,
      documentId: document.id,
      documentName: `${docType}-v${version}.pdf`,
      docType,
      version,
      generatedBy: req.user!.id,
    }).catch(() => {});

    broadcastToPortal(Number(projectId), {
      type: 'document.added',
      projectId: Number(projectId),
      documentId: document.id,
      docType,
      version,
    });

    broadcastToStaff(Number(projectId), {
      type: 'document.added',
      projectId: Number(projectId),
      documentId: document.id,
      docType,
    });

    res.status(201).json({
      ...document.toJSON(),
      message: `${docType} document v${version} generated successfully`,
    });
  } catch (err) {
    console.error('POST /api/documents/generate error:', err);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// ─── GET /api/documents/:id/download ─────────────────────────────────────────

router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const document = await Document.findByPk(req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const user = req.user!;
    const project = await Project.findByPk(document.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const url = new URL(document.pdfUrl);
    const s3Key = url.pathname.slice(1);

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

    res.json({ downloadUrl: signedUrl, expiresIn: 300, sha256Hash: document.sha256Hash });
  } catch (err) {
    console.error('GET /api/documents/:id/download error:', err);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// ─── GET /api/documents/:id/verify ───────────────────────────────────────────
// Verifies document integrity by recomputing SHA256 from S3 and comparing

router.get('/:id/verify', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const document = await Document.findByPk(req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const url = new URL(document.pdfUrl);
    const s3Key = url.pathname.slice(1);

    const s3Object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    const buffer = await streamToBuffer(s3Object.Body as Readable);
    const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const intact = computedHash === document.sha256Hash;

    await logAudit({
      userId: req.user!.id,
      action: 'document.verified',
      entityType: 'Document',
      entityId: document.id,
      newValue: { intact, computedHash, storedHash: document.sha256Hash },
      ipAddress: req.ip,
    });

    res.json({
      documentId: document.id,
      intact,
      storedHash: document.sha256Hash,
      computedHash,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/documents/:id/verify error:', err);
    res.status(500).json({ error: 'Failed to verify document' });
  }
});

export default router;
