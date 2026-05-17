// ============================================================
// RISO HUB — routes/heatLossRoutes.ts
// GET/POST/PATCH /api/heat-loss/:projectId
// ============================================================

import { Router, Request, Response } from 'express';
import { FileModel, User } from '../models';
import { HeatLossSummary } from '../models/newModels';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { eventBus } from '../services/eventBus';

const router = Router();

// GET /api/heat-loss/:projectId
router.get('/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const summary = await HeatLossSummary.findOne({
      where: { projectId: req.params.projectId },
    });

    if (!summary) return res.status(404).json({ error: 'No heat loss summary found for this project' });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch heat loss summary' });
  }
});

// POST /api/heat-loss/:projectId — create or replace
router.post('/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const {
      designFlowTemp, heatDemandKW, heatLossKW, groundFloorArea,
      fabricLossKW, ventilationLossKW, uploadedFileId,
      softwareUsed, calculatedAt, notes,
    } = req.body;

    // Upsert — one summary per project
    const [summary, created] = await HeatLossSummary.upsert({
      projectId,
      designFlowTemp,
      heatDemandKW,
      heatLossKW,
      groundFloorArea,
      fabricLossKW,
      ventilationLossKW,
      uploadedFileId: uploadedFileId || null,
      softwareUsed,
      calculatedBy: req.user!.id,
      calculatedAt: calculatedAt ? new Date(calculatedAt) : new Date(),
      notes,
    });

    await logAudit({
      userId: req.user!.id,
      action: created ? 'heat_loss.created' : 'heat_loss.updated',
      entityType: 'HeatLossSummary',
      entityId: summary.id,
      newValue: summary.toJSON(),
      ipAddress: req.ip,
    });

    eventBus.publish('heat_loss.saved', { projectId, summaryId: summary.id });

    res.status(created ? 201 : 200).json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save heat loss summary' });
  }
});

// PATCH /api/heat-loss/:projectId — partial update
router.patch('/:projectId', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const summary = await HeatLossSummary.findOne({ where: { projectId: req.params.projectId } });
    if (!summary) return res.status(404).json({ error: 'Heat loss summary not found' });

    const oldValue = summary.toJSON();
    await summary.update(req.body);

    await logAudit({
      userId: req.user!.id,
      action: 'heat_loss.updated',
      entityType: 'HeatLossSummary',
      entityId: summary.id,
      oldValue,
      newValue: summary.toJSON(),
      ipAddress: req.ip,
    });

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update heat loss summary' });
  }
});

export default router;
