import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, authorize } from '../auth/authMiddleware';


import { Project, User, ChecklistItem, FileModel, AuditLog } from '../models/index';
import { mis3005Items } from '../checklist/mis3005Items';
import { logAudit } from '../services/auditService';
import { fireWebhook } from '../services/webhookService';
import { broadcastToPortal } from '../services/portalWsService';
import { broadcastToStaff } from '../services/staffWsService';
import { sendPushToUser } from '../services/pushService';

const router = Router();

// ─── GET /api/projects ────────────────────────────────────────────────────────
// Returns all projects; Installers see only their assigned projects

router.get('/', authenticate, authorize('Admin', 'Surveyor', 'Installer', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
    const user = req.user!;

    const where: any = {};

    // Installers scoped to assigned projects only
    if (user.role === 'Installer') {
      where.assignedTo = user.id;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { customerName: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } },
        { postcode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Project.findAndCountAll({
      where,
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Enrich with complaint count and compliance %
    const projectsWithMeta = await Promise.all(
      rows.map(async (project) => {
        const checklistItems = await ChecklistItem.findAll({ where: { projectId: project.id } });
        const required = checklistItems.filter(i => i.required && i.status !== 'na');
        const complete = required.filter(i => i.status === 'complete');
        const compliancePct = required.length > 0 ? Math.round((complete.length / required.length) * 100) : 0;

        return {
          ...project.toJSON(),
          compliancePct,
          checklistTotal: checklistItems.length,
          checklistComplete: complete.length,
        };
      })
    );

    res.json({
      projects: projectsWithMeta,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('GET /api/projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ─── GET /api/projects/:id ────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const project = await Project.findByPk(req.params.id, {
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'role'] }],
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Installers can only see their own
    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const checklistItems = await ChecklistItem.findAll({ where: { projectId: project.id } });
    const files = await FileModel.findAll({ where: { projectId: project.id } });

    const required = checklistItems.filter(i => i.required && i.status !== 'na');
    const complete = required.filter(i => i.status === 'complete');
    const compliancePct = required.length > 0 ? Math.round((complete.length / required.length) * 100) : 0;
    const readyForHandover = required.length > 0 && required.every(i => i.status === 'complete');

    res.json({
      ...project.toJSON(),
      compliancePct,
      readyForHandover,
      checklistItems,
      files,
    });
  } catch (err) {
    console.error('GET /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// ─── POST /api/projects ───────────────────────────────────────────────────────

router.post('/', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const { customerName, address, postcode, projectType, assignedTo } = req.body;

    if (!customerName || !address || !postcode || !projectType) {
      return res.status(400).json({ error: 'customerName, address, postcode and projectType are required' });
    }

    if (!['ASHP', 'GSHP'].includes(projectType)) {
      return res.status(400).json({ error: 'projectType must be ASHP or GSHP' });
    }

    // Validate assignee exists if provided
    if (assignedTo) {
      const assignee = await User.findByPk(assignedTo);
      if (!assignee) return res.status(400).json({ error: 'Assigned user not found' });
    }

    const project = await Project.create({
      customerName,
      address,
      postcode,
      projectType,
      assignedTo: assignedTo || null,
      status: 'survey',
    });

    // Seed MCS checklist items for this project
    const checklistRows = mis3005Items.map(item => ({
      projectId: project.id,
      key: item.key,
      section: item.section,
      name: item.name,
      ref: item.ref,
      guidance: item.guidance || null,
      required: item.required !== false,
      status: 'pending' as const,
    }));

    await ChecklistItem.bulkCreate(checklistRows);

    await logAudit({
      userId: req.user!.id,
      action: 'project.created',
      entityType: 'Project',
      entityId: project.id,
      newValue: project.toJSON(),
      ipAddress: req.ip,
    });

    fireWebhook('project.created', {
      projectId: project.id,
      customerName,
      address,
      postcode,
      projectType,
    }).catch(() => {});

    res.status(201).json(project);
  } catch (err) {
    console.error('POST /api/projects error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ─── PATCH /api/projects/:id ──────────────────────────────────────────────────

router.patch('/:id', authenticate, authorize('Admin', 'Surveyor'), async (req: Request, res: Response) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const allowedFields = ['customerName', 'address', 'postcode', 'status', 'assignedTo', 'projectType'];
    const updates: Partial<typeof req.body> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (updates.status) {
      const validStatuses = ['survey', 'design', 'install', 'commission', 'audit'];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }

    const oldValue = project.toJSON();
    await project.update(updates);

    await logAudit({
      userId: req.user!.id,
      action: 'project.updated',
      entityType: 'Project',
      entityId: project.id,
      oldValue,
      newValue: project.toJSON(),
      ipAddress: req.ip,
    });

    if (updates.status && updates.status !== (oldValue as any).status) {
      fireWebhook('project.status_changed', {
        projectId: project.id,
        address: project.address,
        newStatus: updates.status,
        previousStatus: (oldValue as any).status,
      }).catch(() => {});

      broadcastToPortal(project.id, {
        type: 'project.status_changed',
        projectId: project.id,
        newStatus: updates.status,
      });

      broadcastToStaff(project.id, {
        type:           'project.status_changed',
        projectId:      project.id,
        newStatus:      updates.status,
        previousStatus: (oldValue as any).status,
      });

      // Push notification to assigned installer/surveyor
      if (project.assignedTo) {
        const statusLabels: Record<string, string> = {
          survey: 'Survey', design: 'Design', install: 'Installation',
          commission: 'Commissioning', audit: 'Audit',
        };
        sendPushToUser(project.assignedTo, {
          title: 'Project status updated',
          body:  `${project.customerName} moved to ${statusLabels[updates.status] ?? updates.status}`,
          data:  { type: 'project.status_changed', projectId: project.id, newStatus: updates.status },
        }).catch(() => {});
      }
    }

    res.json(project);
  } catch (err) {
    console.error('PATCH /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
// Soft-delete: sets active=false. Hard delete handled by GDPR cron.

router.delete('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await logAudit({
      userId: req.user!.id,
      action: 'project.deleted',
      entityType: 'Project',
      entityId: project.id,
      oldValue: project.toJSON(),
      ipAddress: req.ip,
    });

    await project.destroy();
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('DELETE /api/projects/:id error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ─── GET /api/compliance/summary/:projectId ───────────────────────────────────

router.get('/compliance/summary/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const user = req.user!;

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'Installer' && project.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = await ChecklistItem.findAll({ where: { projectId } });

    const sections = ['S1', 'S2', 'S3', 'S4', 'S5'];
    const sectionSummary = sections.map(s => {
      const sectionItems = items.filter(i => i.section === s);
      const required = sectionItems.filter(i => i.required && i.status !== 'na');
      const complete = required.filter(i => i.status === 'complete');
      const nonCompliant = sectionItems.filter(i => i.status === 'noncompliant');
      return {
        section: s,
        total: sectionItems.length,
        required: required.length,
        complete: complete.length,
        nonCompliant: nonCompliant.length,
        pct: required.length > 0 ? Math.round((complete.length / required.length) * 100) : 0,
      };
    });

    const allRequired = items.filter(i => i.required && i.status !== 'na');
    const allComplete = allRequired.filter(i => i.status === 'complete');
    const overallPct = allRequired.length > 0 ? Math.round((allComplete.length / allRequired.length) * 100) : 0;
    const readyForHandover = allRequired.length > 0 && allRequired.every(i => i.status === 'complete');

    res.json({
      projectId,
      overallPct,
      readyForHandover,
      sections: sectionSummary,
      items,
    });
  } catch (err) {
    console.error('GET /api/compliance/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch compliance summary' });
  }
});

export default router;
