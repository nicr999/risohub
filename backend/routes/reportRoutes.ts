// ============================================================
// RISO HUB — routes/reportRoutes.ts
// Generate, list, and download compliance reports
// ============================================================

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Project, Complaint, Qualification, ChecklistItem, User } from '../models';
import { Report, SatisfactionSurvey } from '../models/newModels';
import { authenticate, authorize } from '../auth/authMiddleware';
import { logAudit } from '../services/auditService';
import { generateReportPdf } from '../services/reportService';

const router = Router();

// GET /api/reports — list all reports
router.get('/', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const where: any = {};
    if (type) where.type = type;

    const reports = await Report.findAll({
      where,
      include: [{ model: User, as: 'generator', attributes: ['id', 'name'] }],
      order: [['generatedAt', 'DESC']],
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:id/download
router.get('/:id/download', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const report = await Report.findByPk(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!report.pdfUrl) return res.status(404).json({ error: 'PDF not yet generated' });

    res.redirect(report.pdfUrl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download report' });
  }
});

// POST /api/reports/generate — generate a report
router.post('/generate', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { type, periodStart, periodEnd, filters } = req.body;

    if (!type) return res.status(400).json({ error: 'type is required' });

    const dateRange = periodStart && periodEnd
      ? { [Op.between]: [new Date(periodStart), new Date(periodEnd)] }
      : undefined;

    // ── Gather data based on report type ──────────────────────
    let data: any = {};
    let title = '';

    const periodLabel = periodStart && periodEnd
      ? `${new Date(periodStart).toLocaleDateString('en-GB')} – ${new Date(periodEnd).toLocaleDateString('en-GB')}`
      : 'All time';

    if (type === 'monthly_compliance' || type === 'quarterly_compliance') {
      title = `${type === 'monthly_compliance' ? 'Monthly' : 'Quarterly'} Compliance Report — ${periodLabel}`;

      const projects = await Project.findAll({
        where: dateRange ? { createdAt: dateRange } : {},
        attributes: ['id', 'customerName', 'address', 'status', 'projectType', 'createdAt'],
      });

      const checklistStats = await ChecklistItem.findAll({
        where: { status: 'noncompliant' },
        attributes: ['projectId', 'key', 'name', 'status'],
      });

      data = {
        totalProjects: projects.length,
        byStatus: groupBy(projects, 'status'),
        byType: groupBy(projects, 'projectType'),
        nonCompliantItems: checklistStats,
      };
    }

    if (type === 'complaints_summary') {
      title = `Complaints Summary — ${periodLabel}`;

      const complaints = await Complaint.findAll({
        where: dateRange ? { receivedAt: dateRange } : {},
        attributes: ['id', 'ref', 'status', 'priority', 'category', 'receivedAt', 'closedAt', 'escalationStage'],
      });

      data = {
        total: complaints.length,
        byStatus: groupBy(complaints, 'status'),
        byPriority: groupBy(complaints, 'priority'),
        byCategory: groupBy(complaints, 'category'),
        escalated: complaints.filter(c => c.escalationStage),
        avgResolutionDays: avgDays(complaints, 'receivedAt', 'closedAt'),
      };
    }

    if (type === 'qualifications_audit') {
      title = `Staff Qualifications Audit — ${new Date().toLocaleDateString('en-GB')}`;

      const now = new Date();
      const in60Days = new Date();
      in60Days.setDate(in60Days.getDate() + 60);

      const quals = await Qualification.findAll({
        include: [{ model: User, as: 'staff', attributes: ['id', 'name', 'role'] }],
      });

      data = {
        total: quals.length,
        valid: quals.filter(q => q.neverExpires || (q.expiresAt && new Date(q.expiresAt) > in60Days)).length,
        expiringSoon: quals.filter(q => !q.neverExpires && q.expiresAt && new Date(q.expiresAt) <= in60Days && new Date(q.expiresAt) > now),
        expired: quals.filter(q => !q.neverExpires && q.expiresAt && new Date(q.expiresAt) <= now),
      };
    }

    if (type === 'project_pipeline') {
      title = `Project Pipeline — ${new Date().toLocaleDateString('en-GB')}`;

      const projects = await Project.findAll({
        include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
      });

      data = {
        total: projects.length,
        byStage: groupBy(projects, 'status'),
        projects: projects.map(p => ({
          id: p.id,
          customerName: p.customerName,
          address: p.address,
          status: p.status,
          assignee: (p as any).assignee?.name,
          projectType: p.projectType,
        })),
      };
    }

    // ── Create report record ───────────────────────────────────
    const report = await Report.create({
      type,
      title,
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      generatedBy: req.user!.id,
      generatedAt: new Date(),
      filters: filters || {},
      summary: data,
    });

    // Generate PDF asynchronously
    generateReportPdf(report.id, title, data, type).catch(err => {
      console.error('Report PDF generation failed:', err);
    });

    await logAudit({
      userId: req.user!.id,
      action: 'report.generated',
      entityType: 'Report',
      entityId: report.id,
      newValue: { type, title, periodStart, periodEnd },
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Report generation started', reportId: report.id, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ── Helpers ─────────────────────────────────────────────────

function groupBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const val = item[key] || 'unknown';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}

function avgDays(arr: any[], startKey: string, endKey: string): number | null {
  const completed = arr.filter(item => item[startKey] && item[endKey]);
  if (!completed.length) return null;
  const totalMs = completed.reduce((sum, item) => {
    return sum + (new Date(item[endKey]).getTime() - new Date(item[startKey]).getTime());
  }, 0);
  return Math.round(totalMs / completed.length / (1000 * 60 * 60 * 24));
}

export default router;
