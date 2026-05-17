// ============================================================
// RISO HUB — routes/scheduleRoutes.ts
// Full CRUD for job scheduling + calendar feed
// ============================================================

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Schedule, Project, User } from '../models';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { sendNotification } from '../services/notificationService';

const router = Router();

// GET /api/schedule?userId=&projectId=&from=&to=&type=
// Returns schedule entries, filterable for calendar views
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId, projectId, from, to, type } = req.query;
    const where: any = {};

    // Non-admin users only see their own schedule unless Admin/Auditor
    if (!['Admin', 'Auditor'].includes(req.user!.role)) {
      where.userId = req.user!.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (projectId) where.projectId = projectId;
    if (type) where.type = type;

    if (from || to) {
      where.startAt = {};
      if (from) where.startAt[Op.gte] = new Date(from as string);
      if (to) where.startAt[Op.lte] = new Date(to as string);
    }

    const entries = await Schedule.findAll({
      where,
      include: [
        { model: Project, attributes: ['id', 'customerName', 'address', 'postcode', 'status', 'projectType'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['startAt', 'ASC']],
    });

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// GET /api/schedule/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const entry = await Schedule.findByPk(req.params.id, {
      include: [
        { model: Project, attributes: ['id', 'customerName', 'address', 'postcode'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schedule entry' });
  }
});

// POST /api/schedule — create entry
router.post('/', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { projectId, userId, type, startAt, endAt, allDay, notes } = req.body;

    if (!projectId || !userId || !type || !startAt || !endAt) {
      return res.status(400).json({ error: 'projectId, userId, type, startAt and endAt are required' });
    }

    if (new Date(endAt) <= new Date(startAt)) {
      return res.status(400).json({ error: 'endAt must be after startAt' });
    }

    const entry = await Schedule.create({
      projectId,
      userId,
      type,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      allDay: allDay || false,
      notes,
      createdBy: req.user!.id,
    });

    // Notify the assigned user
    const project = await Project.findByPk(projectId, { attributes: ['customerName', 'address'] });
    if (userId !== req.user!.id) {
      await sendNotification({
        userId,
        type: 'action_assigned',
        title: `New job scheduled`,
        body: `You've been scheduled for a ${type} visit — ${project?.customerName}, ${project?.address}`,
        meta: { scheduleId: entry.id, projectId, type },
      });
    }

    await logAudit({
      userId: req.user!.id,
      action: 'schedule.created',
      entityType: 'Schedule',
      entityId: entry.id,
      newValue: entry.toJSON(),
      ipAddress: req.ip,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create schedule entry' });
  }
});

// PATCH /api/schedule/:id — update entry
router.patch('/:id', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const entry = await Schedule.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });

    const oldValue = entry.toJSON();
    await entry.update(req.body);

    await logAudit({
      userId: req.user!.id,
      action: 'schedule.updated',
      entityType: 'Schedule',
      entityId: entry.id,
      oldValue,
      newValue: entry.toJSON(),
      ipAddress: req.ip,
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update schedule entry' });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const entry = await Schedule.findByPk(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });

    await logAudit({
      userId: req.user!.id,
      action: 'schedule.deleted',
      entityType: 'Schedule',
      entityId: entry.id,
      oldValue: entry.toJSON(),
      ipAddress: req.ip,
    });

    await entry.destroy();
    res.json({ message: 'Schedule entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete schedule entry' });
  }
});

export default router;
