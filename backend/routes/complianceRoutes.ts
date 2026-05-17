// ============================================================
// RISO HUB — routes/complianceRoutes.ts
// Compliance summary endpoint — used by dashboard, project
// detail, mobile app, and document generation guard.
// ============================================================

import { Router, Request, Response } from 'express';
import { ChecklistItem, Document, Signature, Complaint } from '../models';
import { HeatLossSummary, MCSRegistration } from '../models/newModels';
import { EPCRecord } from '../models/EPCAndBUSModels';
import { authenticate } from '../auth/authMiddleware';

const router = Router();

// GET /api/compliance/summary/:projectId
// Returns a full compliance picture for a project:
// - checklist breakdown per section
// - overall percentage
// - readiness flags for document generation
// - signature status
router.get('/summary/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);

    const [checklistItems, documents, signatures, heatLoss, mcsReg, epcRecord, openComplaints] = await Promise.all([
      ChecklistItem.findAll({ where: { projectId }, order: [['section', 'ASC'], ['ref', 'ASC']] }),
      Document.findAll({ where: { projectId }, order: [['generatedAt', 'DESC']] }),
      Signature.findAll({ where: { projectId }, order: [['createdAt', 'DESC']] }),
      HeatLossSummary.findOne({ where: { projectId } }),
      MCSRegistration.findOne({ where: { projectId } }),
      EPCRecord.findOne({ where: { projectId } }),
      Complaint.count({ where: { projectId, status: 'open' } }),
    ]);

    // ── Checklist stats ──────────────────────────────────────
    const required = checklistItems.filter(i => i.required && i.status !== 'na');
    const complete = required.filter(i => i.status === 'complete');
    const nonCompliant = required.filter(i => i.status === 'noncompliant');
    const pending = required.filter(i => i.status === 'pending');
    const naItems = checklistItems.filter(i => i.status === 'na');

    const compliancePercentage = required.length > 0
      ? Math.round((complete.length / required.length) * 100)
      : 0;

    // ── Per-section breakdown ────────────────────────────────
    const sections: Record<string, {
      total: number; complete: number; nonCompliant: number; pending: number; na: number;
    }> = {};

    checklistItems.forEach(item => {
      if (!sections[item.section]) {
        sections[item.section] = { total: 0, complete: 0, nonCompliant: 0, pending: 0, na: 0 };
      }
      sections[item.section].total++;
      if (item.status === 'complete') sections[item.section].complete++;
      else if (item.status === 'noncompliant') sections[item.section].nonCompliant++;
      else if (item.status === 'pending') sections[item.section].pending++;
      else if (item.status === 'na') sections[item.section].na++;
    });

    // ── Readiness flags ──────────────────────────────────────
    const readyForHandover =
      pending.length === 0 &&
      nonCompliant.length === 0 &&
      required.length > 0;

    // ── Document & signature status ──────────────────────────
    const latestDocument = documents[0] || null;
    const pendingSignatures = signatures.filter(s => s.status === 'pending').length;
    const signedSignatures = signatures.filter(s => s.status === 'signed').length;

    res.json({
      projectId,
      // Checklist summary
      compliancePercentage,
      totalItems: checklistItems.length,
      requiredItems: required.length,
      completeCount: complete.length,
      nonCompliantCount: nonCompliant.length,
      pendingCount: pending.length,
      naCount: naItems.length,
      sections,
      // Readiness
      readyForHandover,
      blockers: [
        ...nonCompliant.map(i => ({ type: 'noncompliant', itemId: i.id, itemName: i.name, ref: i.ref })),
        ...pending.map(i => ({ type: 'pending', itemId: i.id, itemName: i.name, ref: i.ref })),
      ],
      // Documents
      hasDocument: !!latestDocument,
      latestDocument: latestDocument ? {
        id: latestDocument.id,
        docType: latestDocument.docType,
        version: latestDocument.version,
        generatedAt: latestDocument.generatedAt,
        pdfUrl: latestDocument.pdfUrl,
      } : null,
      // Signatures
      pendingSignatures,
      signedSignatures,
      // Supporting data
      hasHeatLoss: !!heatLoss,
      hasMCSRegistration: !!mcsReg,
      mcsNumber: mcsReg?.mcsNumber || null,
      hasEPC: !!epcRecord,
      openComplaints,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute compliance summary' });
  }
});

export default router;
