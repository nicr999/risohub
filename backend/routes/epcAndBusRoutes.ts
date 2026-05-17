// ============================================================
// RISO HUB — routes/epcRoutes.ts
// EPC register search, fetch, and project attachment
// ============================================================

import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import {
  searchEPCByPostcode,
  fetchEPCByLmkKey,
  storeEPCForProject,
  checkEPCHealth,
} from '../services/epcService';
import { EPCRecord } from '../models/EPCAndBUSModels';
import { User } from '../models';

const router = Router();

// GET /api/epc/health — check API reachability (Admin only)
router.get('/health', authenticate, authorize('Admin'), async (_req, res: Response) => {
  const result = await checkEPCHealth();
  res.status(result.ok ? 200 : 503).json(result);
});

// GET /api/epc/search?postcode=&address=
// Search EPC register by postcode (and optional address fragment)
router.get('/search', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { postcode, address } = req.query;
    if (!postcode) return res.status(400).json({ error: 'postcode is required' });

    const results = await searchEPCByPostcode(postcode as string, address as string | undefined);
    res.json({ results, count: results.length });
  } catch (err: any) {
    console.error('EPC search error:', err.message);
    if (err.response?.status === 401) return res.status(401).json({ error: 'EPC API authentication failed — check EPC_API_EMAIL and EPC_API_KEY env vars' });
    res.status(502).json({ error: 'EPC register search failed', detail: err.message });
  }
});

// GET /api/epc/certificate/:lmkKey
// Fetch full certificate details by LMK key (preview before saving)
router.get('/certificate/:lmkKey', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const detail = await fetchEPCByLmkKey(req.params.lmkKey);
    res.json(detail);
  } catch (err: any) {
    console.error('EPC fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch EPC certificate', detail: err.message });
  }
});

// GET /api/epc/project/:projectId
// Get stored EPC for a project
router.get('/project/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const epc = await EPCRecord.findOne({
      where: { projectId: req.params.projectId },
      include: [{ model: User, as: 'fetcher', attributes: ['id', 'name'] }],
      order: [['fetchedAt', 'DESC']],
    });

    if (!epc) return res.status(404).json({ error: 'No EPC stored for this project' });
    res.json(epc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stored EPC' });
  }
});

// POST /api/epc/project/:projectId
// Fetch and store an EPC against a project
// Body: { lmkKey }
router.post('/project/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { lmkKey } = req.body;
    if (!lmkKey) return res.status(400).json({ error: 'lmkKey is required' });

    const projectId = parseInt(req.params.projectId);
    const epc = await storeEPCForProject(projectId, lmkKey, req.user!.id);

    await logAudit({
      userId: req.user!.id,
      action: 'epc.stored',
      entityType: 'EPCRecord',
      entityId: epc.id,
      newValue: { projectId, lmkKey, rating: epc.currentEnergyRating, postcode: epc.postcode },
      ipAddress: req.ip,
    });

    res.status(201).json(epc);
  } catch (err: any) {
    console.error('EPC store error:', err.message);
    res.status(502).json({ error: 'Failed to fetch and store EPC', detail: err.message });
  }
});

// DELETE /api/epc/project/:projectId
// Remove stored EPC from a project (Admin only)
router.delete('/project/:projectId', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const epc = await EPCRecord.findOne({ where: { projectId: req.params.projectId } });
    if (!epc) return res.status(404).json({ error: 'No EPC found for this project' });

    await logAudit({
      userId: req.user!.id,
      action: 'epc.removed',
      entityType: 'EPCRecord',
      entityId: epc.id,
      oldValue: epc.toJSON(),
      ipAddress: req.ip,
    });

    await epc.destroy();
    res.json({ message: 'EPC removed from project' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove EPC' });
  }
});

export default router;


// ============================================================
// RISO HUB — routes/busRoutes.ts
// BUS eligibility assessment
// ============================================================

import { Router as BUSRouter, Request as BUSRequest, Response as BUSResponse } from 'express';
import { authenticate as busAuth, authorize as busAuthorize } from '../auth/authMiddleware';
import { auditLog as busAuditLog } from '../services/auditService';
import { assessBUSEligibility } from '../services/busEligibilityService';
import { BUSEligibility, EPCRecord } from '../models/EPCAndBUSModels';
import { Project, User } from '../models';

export const busRouter = BUSRouter();

// GET /api/bus/project/:projectId
// Get latest BUS eligibility assessment for a project
busRouter.get('/project/:projectId', busAuth, async (req: BUSRequest, res: BUSResponse) => {
  try {
    const assessment = await BUSEligibility.findOne({
      where: { projectId: req.params.projectId },
      include: [{ model: User, as: 'assessor', attributes: ['id', 'name'] }],
      order: [['assessedAt', 'DESC']],
    });

    if (!assessment) return res.status(404).json({ error: 'No BUS assessment for this project' });
    res.json(assessment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch BUS assessment' });
  }
});

// GET /api/bus/project/:projectId/history
// All assessments for a project (eligibility may change over time)
busRouter.get('/project/:projectId/history', busAuth, busAuthorize('Admin', 'Auditor', 'Surveyor'), async (req: BUSRequest, res: BUSResponse) => {
  try {
    const history = await BUSEligibility.findAll({
      where: { projectId: req.params.projectId },
      include: [{ model: User, as: 'assessor', attributes: ['id', 'name'] }],
      order: [['assessedAt', 'DESC']],
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assessment history' });
  }
});

// POST /api/bus/project/:projectId/assess
// Run a BUS eligibility assessment
// Body: optional overrides (isNewBuild, isListedBuilding, ownerOccupied, etc.)
busRouter.post('/project/:projectId/assess', busAuth, busAuthorize('Admin', 'Surveyor'), async (req: BUSRequest, res: BUSResponse) => {
  try {
    const projectId = parseInt(req.params.projectId);

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const epc = await EPCRecord.findOne({
      where: { projectId },
      order: [['fetchedAt', 'DESC']],
    });

    const result = assessBUSEligibility({
      project: {
        projectType: project.projectType as 'ASHP' | 'GSHP',
        address: project.address,
        postcode: project.postcode,
      },
      epc: epc || null,
      overrides: req.body.overrides || {},
    });

    // Save assessment
    const assessment = await BUSEligibility.create({
      projectId,
      epcRecordId: epc?.id || undefined,
      verdict: result.verdict,
      criteria: result.criteria,
      blockers: result.blockers,
      warnings: result.warnings,
      grantAmount: result.grantAmount || undefined,
      assessedBy: req.user!.id,
      assessedAt: new Date(),
      notes: req.body.notes,
    });

    await busAuditLog({
      userId: req.user!.id,
      action: 'bus.assessed',
      entityType: 'BUSEligibility',
      entityId: assessment.id,
      newValue: { projectId, verdict: result.verdict, grantAmount: result.grantAmount },
      ipAddress: req.ip,
    });

    res.status(201).json({ ...assessment.toJSON(), summary: result.summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'BUS assessment failed' });
  }
});

// PATCH /api/bus/:assessmentId/notes
// Add or update notes on an assessment
busRouter.patch('/:assessmentId/notes', busAuth, busAuthorize('Admin', 'Surveyor'), async (req: BUSRequest, res: BUSResponse) => {
  try {
    const assessment = await BUSEligibility.findByPk(req.params.assessmentId);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    await assessment.update({ notes: req.body.notes });
    res.json(assessment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notes' });
  }
});
