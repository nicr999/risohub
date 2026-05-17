import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../auth/authMiddleware';
import { ChecklistItem, Project } from '../models/index';


import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';
import { mis3005Items } from '../checklist/mis3005Items';

const router = Router();

// ─── GET /api/checklist/:projectId ────────────────────────────────────────────

router.get('/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const user = req.user!;

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Installers scoped to assigned projects
    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = await ChecklistItem.findAll({
      where: { projectId },
      order: [['section', 'ASC'], ['key', 'ASC']],
    });

    // Group by section for convenience
    const sections: Record<string, typeof items> = {};
    for (const item of items) {
      if (!sections[item.section]) sections[item.section] = [];
      sections[item.section].push(item);
    }

    // Compliance summary
    const required = items.filter(i => i.required && i.status !== 'na');
    const complete = required.filter(i => i.status === 'complete');
    const nonCompliant = items.filter(i => i.status === 'noncompliant');
    const compliancePct = required.length > 0 ? Math.round((complete.length / required.length) * 100) : 0;
    const readyForHandover = required.length > 0 && nonCompliant.length === 0 && required.every(i => i.status === 'complete');

    res.json({
      projectId,
      compliancePct,
      readyForHandover,
      totalItems: items.length,
      completeItems: complete.length,
      nonCompliantItems: nonCompliant.length,
      sections,
      items,
    });
  } catch (err) {
    console.error('GET /api/checklist/:projectId error:', err);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

// ─── PATCH /api/checklist/item/:id ───────────────────────────────────────────

router.patch('/item/:id', authenticate, authorize('Admin', 'Surveyor', 'Installer'), async (req: Request, res: Response) => {
  try {
    const { status, notes, naReason } = req.body;
    const user = req.user!;

    const item = await ChecklistItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    const project = await Project.findByPk(item.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Installers scoped to assigned projects
    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validStatuses = ['pending', 'complete', 'noncompliant', 'na'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    // N/A items must have a reason
    if (status === 'na' && !naReason) {
      return res.status(400).json({ error: 'naReason is required when marking an item as N/A' });
    }

    const oldValue = item.toJSON();

    await item.update({
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      ...(naReason !== undefined && { naReason }),
      updatedBy: user.id,
    });

    await logAudit({
      userId: user.id,
      action: 'checklist.itemUpdated',
      entityType: 'ChecklistItem',
      entityId: item.id,
      oldValue,
      newValue: item.toJSON(),
      ipAddress: req.ip,
    });

    // Check if all required items are now complete → emit event for Workflow Agent
    const allItems = await ChecklistItem.findAll({ where: { projectId: item.projectId } });
    const required = allItems.filter(i => i.required && i.status !== 'na');
    const allComplete = required.every(i => i.status === 'complete');
    const hasNonCompliant = allItems.some(i => i.status === 'noncompliant');

    if (allComplete && !hasNonCompliant) {
      await publishEvent('checklist.completed', {
        projectId: item.projectId,
        completedBy: user.id,
        timestamp: new Date().toISOString(),
      });
    }

    // Compliance Agent event on any update
    await publishEvent('checklist.updated', {
      projectId: item.projectId,
      itemId: item.id,
      status: item.status,
      updatedBy: user.id,
    });

    res.json(item);
  } catch (err) {
    console.error('PATCH /api/checklist/item/:id error:', err);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// ─── POST /api/checklist/seed ─────────────────────────────────────────────────
// Internal endpoint — seeds MIS 3005 checklist items for a project.
// Called automatically on project creation; available for manual re-seeding.

router.post('/seed', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Remove existing items first (re-seed)
    await ChecklistItem.destroy({ where: { projectId } });

    const rows = mis3005Items.map(item => ({
      projectId,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref,
      guidance: item.guidance || null,
      required: item.required !== false,
      status: 'pending' as const,
    }));

    await ChecklistItem.bulkCreate(rows);

    await logAudit({
      userId: req.user!.id,
      action: 'checklist.seeded',
      entityType: 'Project',
      entityId: projectId,
      newValue: { itemCount: rows.length },
      ipAddress: req.ip,
    });

    res.json({ message: `Seeded ${rows.length} checklist items`, projectId });
  } catch (err) {
    console.error('POST /api/checklist/seed error:', err);
    res.status(500).json({ error: 'Failed to seed checklist' });
  }
});

export default router;
