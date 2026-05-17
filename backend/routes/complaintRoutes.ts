import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, authorize } from '../auth/authMiddleware';
import {
  Complaint, ActionPoint, ContactLog, Notification, User, Project,
} from '../models/index';
import { logAudit } from '../services/auditService';
import { publishEvent } from '../services/eventBus';
import { fireWebhook } from '../services/webhookService';
import sequelize from '../config/database';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Complaint.count({
    where: sequelize.where(
      sequelize.fn('date_part', 'year', sequelize.col('created_at')),
      year
    ),
  });
  const seq = String(count + 1).padStart(3, '0');
  return `COMP-${year}-${seq}`;
}

function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

const STATUS_COLOURS: Record<string, string> = {
  new: 'red', in_progress: 'orange', pending_info: 'yellow',
  escalated: 'blue', resolved: 'green', closed: 'grey',
};

// ─── GET /api/complaints ──────────────────────────────────────────────────────

router.get('/', authenticate, authorize('Admin', 'Surveyor', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { status, priority, projectId, overdue, page = '1', limit = '20' } = req.query as Record<string, string>;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (overdue === 'true') {
      where.responseDeadline = { [Op.lt]: new Date() };
      where.status = { [Op.notIn]: ['resolved', 'closed'] };
    }

    const { count, rows } = await Complaint.findAndCountAll({
      where,
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }],
      order: [['receivedAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    const enriched = rows.map(c => ({
      ...c.toJSON(),
      statusColour: STATUS_COLOURS[c.status] ?? 'grey',
      isOverdue: c.status !== 'resolved' && c.status !== 'closed' && c.responseDeadline < new Date(),
    }));

    res.json({ complaints: enriched, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    console.error('GET /api/complaints error:', err);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// ─── POST /api/complaints ─────────────────────────────────────────────────────

router.post('/', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const {
      projectId, customerName, customerEmail, customerPhone, customerAddress,
      receivedAt, receivedMethod, category, priority = 'standard',
      description, assignedTo, hasRepresentative = false, representativeName,
    } = req.body;

    if (!customerName || !receivedAt || !receivedMethod || !category || !description) {
      return res.status(400).json({ error: 'customerName, receivedAt, receivedMethod, category and description are required' });
    }

    const ref = await generateRef();
    const received = new Date(receivedAt);
    const responseDeadline = addWorkingDays(received, 7);
    const inspectionDeadline = priority === 'emergency' ? addHours(received, 24) : addWorkingDays(received, 7);

    const complaint = await Complaint.create({
      ref, projectId: projectId || null, customerName,
      customerEmail: customerEmail || null, customerPhone: customerPhone || null,
      customerAddress: customerAddress || null, receivedAt: received,
      receivedMethod, category, priority, description, status: 'new',
      assignedTo: assignedTo || null, responseDeadline, inspectionDeadline,
      hasRepresentative, representativeName: hasRepresentative ? representativeName : null,
      reviewedAtMeeting: false,
    });

    if (assignedTo) {
      await Notification.create({
        userId: assignedTo,
        type: priority === 'emergency' ? 'complaint_emergency' : 'complaint_new',
        title: priority === 'emergency' ? '🚨 Emergency complaint assigned' : 'New complaint assigned',
        body: `Complaint ${ref} from ${customerName} has been assigned to you. Response due: ${responseDeadline.toLocaleDateString('en-GB')}.`,
        meta: { complaintId: complaint.id, ref, priority },
      });
    }

    await logAudit({ userId: req.user!.id, action: 'complaint.created', entityType: 'Complaint', entityId: complaint.id, newValue: complaint.toJSON(), ipAddress: req.ip });

    fireWebhook('complaint.opened', {
      projectId: projectId || null,
      complaintId: complaint.id,
      ref: complaint.ref,
      customerName,
      category,
      priority,
    }).catch(() => {});

    res.status(201).json(complaint);
  } catch (err) {
    console.error('POST /api/complaints error:', err);
    res.status(500).json({ error: 'Failed to create complaint' });
  }
});

// ─── GET /api/complaints/:id ──────────────────────────────────────────────────

router.get('/:id', authenticate, authorize('Admin', 'Surveyor', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const complaint = await Complaint.findByPk(req.params.id, {
      include: [
        { model: ActionPoint, as: 'actionPoints', include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }] },
        { model: ContactLog, as: 'contactLogs' },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
      ],
    });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    res.json({
      ...complaint.toJSON(),
      statusColour: STATUS_COLOURS[complaint.status] ?? 'grey',
      isOverdue: complaint.status !== 'resolved' && complaint.status !== 'closed' && complaint.responseDeadline < new Date(),
      reccRightsNotice: 'This complaint is handled in accordance with MCS R06 and RECC Section 9. The customer has the right to escalate unresolved complaints to RECC Mediation, RECC Arbitration, the Certification Body, and finally the Ombudsman.',
    });
  } catch (err) {
    console.error('GET /api/complaints/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch complaint' });
  }
});

// ─── PATCH /api/complaints/:id ────────────────────────────────────────────────

router.patch('/:id', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const allowedFields = [
      'customerEmail', 'customerPhone', 'customerAddress', 'category', 'description',
      'assignedTo', 'inspectionDate', 'inspectionNotes', 'resolutionDescription',
      'capaRef', 'reviewedAtMeeting', 'hasRepresentative', 'representativeName', 'escalationNotes',
    ];
    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const oldValue = complaint.toJSON();
    await complaint.update(updates);
    await logAudit({ userId: req.user!.id, action: 'complaint.updated', entityType: 'Complaint', entityId: complaint.id, oldValue, newValue: complaint.toJSON(), ipAddress: req.ip });
    res.json(complaint);
  } catch (err) {
    console.error('PATCH /api/complaints/:id error:', err);
    res.status(500).json({ error: 'Failed to update complaint' });
  }
});

// ─── PATCH /api/complaints/:id/status ────────────────────────────────────────

router.patch('/:id/status', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { status, escalationStage, escalationNotes, customerSatisfied, resolutionDescription } = req.body;
    const validStatuses = ['new', 'in_progress', 'pending_info', 'escalated', 'resolved', 'closed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (status === 'closed' && customerSatisfied === undefined) {
      return res.status(400).json({ error: 'customerSatisfied is required when closing a complaint (RECC Section 9)' });
    }

    const updates: any = { status };

    if (status === 'escalated') {
      const validStages = ['recc_mediation', 'recc_arbitration', 'certification_body', 'ombudsman'];
      if (!escalationStage || !validStages.includes(escalationStage)) {
        return res.status(400).json({ error: `escalationStage must be one of: ${validStages.join(', ')}` });
      }
      updates.escalationStage = escalationStage;
      updates.escalationDate = new Date();
      updates.escalationNotes = escalationNotes || null;
    }

    if (status === 'resolved') {
      if (!resolutionDescription) return res.status(400).json({ error: 'resolutionDescription is required when resolving' });
      updates.resolutionDescription = resolutionDescription;
    }

    if (status === 'closed') {
      updates.customerSatisfied = customerSatisfied;
      updates.closedAt = new Date();
    }

    const oldValue = complaint.toJSON();
    await complaint.update(updates);

    if (complaint.assignedTo) {
      await Notification.create({
        userId: complaint.assignedTo,
        type: status === 'escalated' ? 'complaint_escalated' : 'complaint_new',
        title: `Complaint ${complaint.ref} status updated`,
        body: `Complaint ${complaint.ref} is now ${status.replace('_', ' ')}.`,
        meta: { complaintId: complaint.id, ref: complaint.ref, status },
      });
    }

    await logAudit({ userId: req.user!.id, action: 'complaint.statusChanged', entityType: 'Complaint', entityId: complaint.id, oldValue, newValue: complaint.toJSON(), ipAddress: req.ip });

    if (status === 'resolved' || status === 'closed') {
      fireWebhook('complaint.resolved', {
        projectId: complaint.projectId,
        complaintId: complaint.id,
        ref: complaint.ref,
        status,
        resolutionDescription: updates.resolutionDescription ?? null,
      }).catch(() => {});
    }

    res.json(complaint);
  } catch (err) {
    console.error('PATCH /api/complaints/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update complaint status' });
  }
});

// ─── POST /api/complaints/:id/actions ────────────────────────────────────────

router.post('/:id/actions', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { description, assignedTo, dueDate, notes } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const actionPoint = await ActionPoint.create({
      complaintId: complaint.id, description,
      assignedTo: assignedTo || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || null,
    });

    if (assignedTo) {
      await Notification.create({
        userId: assignedTo, type: 'action_assigned',
        title: 'Action point assigned',
        body: `You have been assigned an action on complaint ${complaint.ref}: "${description}"`,
        meta: { complaintId: complaint.id, actionPointId: actionPoint.id, ref: complaint.ref },
      });
    }

    await logAudit({ userId: req.user!.id, action: 'complaint.actionAdded', entityType: 'ActionPoint', entityId: actionPoint.id, newValue: actionPoint.toJSON(), ipAddress: req.ip });
    res.status(201).json(actionPoint);
  } catch (err) {
    console.error('POST /api/complaints/:id/actions error:', err);
    res.status(500).json({ error: 'Failed to create action point' });
  }
});

// ─── PATCH /api/complaints/:id/actions/:apId/complete ────────────────────────

router.patch('/:id/actions/:apId/complete', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    const actionPoint = await ActionPoint.findOne({ where: { id: req.params.apId, complaintId: req.params.id } });
    if (!actionPoint) return res.status(404).json({ error: 'Action point not found' });
    if (actionPoint.completedAt) return res.status(400).json({ error: 'Action point is already completed' });

    await actionPoint.update({ completedAt: new Date(), notes: notes || actionPoint.notes });
    await logAudit({ userId: req.user!.id, action: 'complaint.actionCompleted', entityType: 'ActionPoint', entityId: actionPoint.id, newValue: actionPoint.toJSON(), ipAddress: req.ip });
    res.json(actionPoint);
  } catch (err) {
    console.error('PATCH actions complete error:', err);
    res.status(500).json({ error: 'Failed to complete action point' });
  }
});

// ─── POST /api/complaints/:id/contacts ───────────────────────────────────────

router.post('/:id/contacts', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { date, method, direction, summary, by } = req.body;
    if (!date || !method || !direction || !summary || !by) {
      return res.status(400).json({ error: 'date, method, direction, summary and by are required' });
    }

    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const contactLog = await ContactLog.create({ complaintId: complaint.id, date: new Date(date), method, direction, summary, by });
    await logAudit({ userId: req.user!.id, action: 'complaint.contactLogged', entityType: 'ContactLog', entityId: contactLog.id, newValue: contactLog.toJSON(), ipAddress: req.ip });
    res.status(201).json(contactLog);
  } catch (err) {
    console.error('POST contacts error:', err);
    res.status(500).json({ error: 'Failed to log contact' });
  }
});

// ─── POST /api/complaints/check-overdue ──────────────────────────────────────

router.post('/check-overdue', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const overdue = await Complaint.findAll({
      where: { responseDeadline: { [Op.lt]: new Date() }, status: { [Op.notIn]: ['resolved', 'closed'] } },
    });

    const rows = overdue
      .filter(c => c.assignedTo)
      .map(c => ({
        userId: c.assignedTo!, type: 'complaint_overdue',
        title: `⚠️ Overdue: ${c.ref}`,
        body: `Complaint ${c.ref} from ${c.customerName} is past its response deadline.`,
        meta: { complaintId: c.id, ref: c.ref, priority: c.priority },
      }));

    if (rows.length) await Notification.bulkCreate(rows);

    res.json({ checked: overdue.length, notified: rows.length });
  } catch (err) {
    console.error('POST check-overdue error:', err);
    res.status(500).json({ error: 'Failed to check overdue complaints' });
  }
});

export default router;
