// ============================================================
// RISO HUB — routes/documentTemplateRoutes.ts
// GET/PATCH /api/document-templates/:docType
// Admin-only template management
// ============================================================

import { Router, Request, Response } from 'express';
import { authenticate, authorize, require2FA } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { DocumentTemplate } from '../models/phase7Models';

const router = Router();

const DEFAULT_SECTIONS: Record<string, any[]> = {
  handover: [
    { id: 'project_details', label: 'Project Details', enabled: true, order: 1 },
    { id: 'heat_loss', label: 'Heat Loss Summary', enabled: true, order: 2 },
    { id: 'mcs_registration', label: 'MCS Registration', enabled: true, order: 3 },
    { id: 'epc', label: 'EPC Summary', enabled: true, order: 4 },
    { id: 'checklist', label: 'MIS 3005 Checklist', enabled: true, order: 5 },
    { id: 'signature', label: 'Customer Signature', enabled: true, order: 6 },
  ],
  commissioning: [
    { id: 'project_details', label: 'Project Details', enabled: true, order: 1 },
    { id: 'system_details', label: 'System Details', enabled: true, order: 2 },
    { id: 'commissioning_checklist', label: 'Commissioning Checklist', enabled: true, order: 3 },
    { id: 'readings', label: 'Recorded Readings', enabled: true, order: 4 },
  ],
  final_pack: [
    { id: 'project_details', label: 'Project Details', enabled: true, order: 1 },
    { id: 'heat_loss', label: 'Heat Loss Summary', enabled: true, order: 2 },
    { id: 'mcs_registration', label: 'MCS Registration', enabled: true, order: 3 },
    { id: 'epc', label: 'EPC Summary', enabled: true, order: 4 },
    { id: 'mcs_checklist', label: 'MIS 3005 Checklist', enabled: true, order: 5 },
    { id: 'commissioning_checklist', label: 'Commissioning Checklist', enabled: true, order: 6 },
    { id: 'signature', label: 'Customer Signature', enabled: true, order: 7 },
  ],
  job_sheet: [
    { id: 'project_details', label: 'Project Details', enabled: true, order: 1 },
    { id: 'heat_loss', label: 'Heat Loss Summary', enabled: true, order: 2 },
    { id: 'access_notes', label: 'Access Notes', enabled: true, order: 3 },
    { id: 'kit_list', label: 'Kit List', enabled: true, order: 4 },
    { id: 'checklist_preview', label: 'Checklist Preview', enabled: true, order: 5 },
  ],
  recc_notice: [
    { id: 'cancellation_rights', label: 'Cancellation Rights', enabled: true, order: 1 },
    { id: 'contact_details', label: 'Company Contact Details', enabled: true, order: 2 },
    { id: 'signature', label: 'Customer Signature', enabled: true, order: 3 },
  ],
};

// GET /api/document-templates — list all templates
router.get('/', authenticate, authorize('Admin', 'Auditor'), async (_req, res: Response) => {
  const templates = await DocumentTemplate.findAll({ order: [['docType', 'ASC']] });
  res.json(templates);
});

// GET /api/document-templates/:docType — get or create default
router.get('/:docType', authenticate, authorize('Admin', 'Auditor', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    let tpl = await DocumentTemplate.findOne({ where: { docType: req.params.docType } });
    if (!tpl) {
      // Return default without saving
      return res.json({
        docType: req.params.docType,
        name: req.params.docType.replace(/_/g, ' '),
        sections: DEFAULT_SECTIONS[req.params.docType] || [],
        coverTagline: 'MCS Certified Heat Pump Installation',
        coverBgColour: '#7A8465',
        coverShowLogo: true,
        includeHeatLoss: true,
        includeEpc: true,
        includeMcsRegistration: true,
        includeRecommendations: false,
        includePhotos: false,
        fontSizeBody: 10,
        fontSizeHeading: 14,
        isDefault: true,
      });
    }
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// PATCH /api/document-templates/:docType — update template (2FA required)
router.patch('/:docType', authenticate, authorize('Admin'), require2FA, async (req: Request, res: Response) => {
  try {
    const [tpl, created] = await DocumentTemplate.findOrCreate({
      where: { docType: req.params.docType as any },
      defaults: {
        name: req.body.name || req.params.docType.replace(/_/g, ' '),
        sections: DEFAULT_SECTIONS[req.params.docType] || [],
        coverShowLogo: true,
        includeHeatLoss: true,
        includeEpc: true,
        includeMcsRegistration: true,
        includeRecommendations: false,
        includePhotos: false,
        fontSizeBody: 10,
        fontSizeHeading: 14,
        ...req.body,
        updatedBy: (req as any).user.id,
      },
    });

    if (!created) {
      const old = tpl.toJSON();
      await tpl.update({ ...req.body, updatedBy: (req as any).user.id });
      await logAudit({
        userId: (req as any).user.id,
        action: 'document_template.updated',
        entityType: 'DocumentTemplate',
        entityId: tpl.id,
        oldValue: old,
        newValue: tpl.toJSON(),
        ipAddress: req.ip,
      });
    }

    res.json(tpl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// POST /api/document-templates/:docType/preview — generate preview PDF with dummy data
router.post('/:docType/preview', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { generateDocument } = require('../services/documentService.v7');
    // Use a known test project ID if provided, otherwise 404
    const { testProjectId } = req.body;
    if (!testProjectId) return res.status(400).json({ error: 'testProjectId required for preview' });

    const doc = await generateDocument({
      projectId: testProjectId,
      docType: req.params.docType,
      generatedBy: (req as any).user.id,
      ipAddress: req.ip,
    });
    res.json({ previewUrl: doc.pdfUrl, documentId: doc.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Preview generation failed' });
  }
});

export default router;


// ============================================================
// routes/commissioningRoutes.ts
// Full CRUD for commissioning checklist per project
// ============================================================

import { Router as CRouter, Request as CReq, Response as CRes } from 'express';
import { authenticate as cAuth, authorize as cAuthorize } from '../auth/authMiddleware';
import { auditLog as cAuditLog } from '../services/auditService';
import { CommissioningChecklist, CommissioningChecklistEvidence } from '../models/phase7Models';
import { commissioningItems } from '../data/commissioningItems';
import { File, User } from '../models';

export const commissioningRouter = CRouter();

// GET /api/commissioning/:projectId
commissioningRouter.get('/:projectId', cAuth, async (req: CReq, res: CRes) => {
  const items = await CommissioningChecklist.findAll({
    where: { projectId: req.params.projectId },
    order: [['section', 'ASC'], ['key', 'ASC']],
  });
  res.json(items);
});

// POST /api/commissioning/:projectId/seed — seed items for a project
commissioningRouter.post('/:projectId/seed', cAuth, cAuthorize('Admin', 'Surveyor'), async (req: CReq, res: CRes) => {
  const projectId = parseInt(req.params.projectId);
  const existing = await CommissioningChecklist.count({ where: { projectId } });
  if (existing > 0) return res.status(409).json({ error: 'Commissioning checklist already seeded for this project' });

  const items = commissioningItems.map(i => ({ ...i, projectId, status: 'pending' as const }));
  await CommissioningChecklist.bulkCreate(items as any);
  res.status(201).json({ message: `${items.length} commissioning items seeded` });
});

// PATCH /api/commissioning/item/:id
commissioningRouter.patch('/item/:id', cAuth, cAuthorize('Admin', 'Surveyor', 'Installer'), async (req: CReq, res: CRes) => {
  const item = await CommissioningChecklist.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const old = item.toJSON();
  await item.update({
    ...req.body,
    updatedBy: (req as any).user.id,
    updatedAt: new Date(),
  });

  await cAuditLog({
    userId: (req as any).user.id,
    action: 'commissioning_item.updated',
    entityType: 'CommissioningChecklist',
    entityId: item.id,
    oldValue: old,
    newValue: item.toJSON(),
    ipAddress: req.ip,
  });

  res.json(item);
});

// GET /api/commissioning/item/:id/evidence
commissioningRouter.get('/item/:id/evidence', cAuth, async (req: CReq, res: CRes) => {
  const evidence = await CommissioningChecklistEvidence.findAll({
    where: { commissioningItemId: req.params.id },
    include: [
      { model: File, as: 'file', attributes: ['id', 'fileUrl'] },
      { model: User, as: 'uploader', attributes: ['id', 'name'] },
    ],
  });
  res.json(evidence);
});

// POST /api/commissioning/item/:id/evidence
commissioningRouter.post('/item/:id/evidence', cAuth, cAuthorize('Admin', 'Surveyor', 'Installer'), async (req: CReq, res: CRes) => {
  const { fileId, note } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });
  const ev = await CommissioningChecklistEvidence.create({
    commissioningItemId: parseInt(req.params.id),
    fileId, note,
    uploadedBy: (req as any).user.id,
    uploadedAt: new Date(),
  });
  res.status(201).json(ev);
});


// ============================================================
// routes/customerCommsRoutes.ts
// Customer communication log per project
// ============================================================

import { Router as ComRouter, Request as ComReq, Response as ComRes } from 'express';
import { authenticate as comAuth, authorize as comAuthorize } from '../auth/authMiddleware';
import { CustomerCommsLog } from '../models/phase7Models';
import { User as ComUser } from '../models';

export const commsRouter = ComRouter();

// GET /api/customer-comms/:projectId
commsRouter.get('/:projectId', comAuth, async (req: ComReq, res: ComRes) => {
  const logs = await CustomerCommsLog.findAll({
    where: { projectId: req.params.projectId },
    include: [{ model: ComUser, as: 'logger', attributes: ['id', 'name'] }],
    order: [['date', 'DESC']],
  });
  res.json(logs);
});

// POST /api/customer-comms/:projectId
commsRouter.post('/:projectId', comAuth, comAuthorize('Admin', 'Surveyor', 'Installer'), async (req: ComReq, res: ComRes) => {
  const { date, method, direction, summary } = req.body;
  if (!date || !method || !direction || !summary?.trim()) {
    return res.status(400).json({ error: 'date, method, direction and summary are required' });
  }
  const log = await CustomerCommsLog.create({
    projectId: parseInt(req.params.projectId),
    date: new Date(date),
    method, direction, summary,
    loggedBy: (req as any).user.id,
  });
  res.status(201).json(log);
});

// PATCH /api/customer-comms/entry/:id
commsRouter.patch('/entry/:id', comAuth, async (req: ComReq, res: ComRes) => {
  const entry = await CustomerCommsLog.findByPk(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.loggedBy !== (req as any).user.id && (req as any).user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await entry.update(req.body);
  res.json(entry);
});

// DELETE /api/customer-comms/entry/:id
commsRouter.delete('/entry/:id', comAuth, comAuthorize('Admin'), async (req: ComReq, res: ComRes) => {
  const entry = await CustomerCommsLog.findByPk(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await entry.destroy();
  res.json({ message: 'Entry deleted' });
});
