// ============================================================
// RISO HUB — routes/dashboardRoutes.ts
// GET /api/dashboard/summary — command centre data
// ============================================================

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  Project, Checklist, Complaint, Qualification,
  Signature, User, Schedule, SatisfactionSurvey,
} from '../models';
import { authenticate } from '../auth/authMiddleware';

const router = Router();

// GET /api/dashboard/summary
// Returns everything the dashboard needs in one request
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const isAdminOrAuditor = ['Admin', 'Auditor'].includes(role);

    const projectWhere = isAdminOrAuditor ? {} : { assignedTo: userId };

    const now = new Date();
    const in7Days = new Date(); in7Days.setDate(now.getDate() + 7);
    const in60Days = new Date(); in60Days.setDate(now.getDate() + 60);
    const startOfWeek = new Date(); startOfWeek.setDate(now.getDate() - now.getDay());

    // ── Run all queries in parallel ───────────────────────────
    const [
      allProjects,
      overdueComplaints,
      emergencyComplaints,
      pendingSignatures,
      expiringQuals,
      expiredQuals,
      upcomingSchedule,
      recentSurveys,
    ] = await Promise.all([
      // All projects (scoped by role)
      Project.findAll({
        where: projectWhere,
        attributes: ['id', 'customerName', 'address', 'postcode', 'status', 'projectType', 'createdAt', 'assignedTo'],
        include: [
          { model: User, as: 'assignee', attributes: ['id', 'name'] },
          {
            model: Checklist,
            as: 'checklistItems',
            attributes: ['id', 'status', 'required'],
          },
          {
            model: Complaint,
            as: 'complaints',
            attributes: ['id', 'status', 'priority', 'responseDeadline'],
            where: { status: { [Op.notIn]: ['closed', 'resolved'] } },
            required: false,
          },
        ],
      }),

      // Overdue complaints (response deadline passed, not closed/resolved)
      Complaint.count({
        where: {
          responseDeadline: { [Op.lt]: now },
          status: { [Op.notIn]: ['closed', 'resolved'] },
        },
      }),

      // Emergency complaints (open)
      Complaint.count({
        where: {
          priority: 'emergency',
          status: { [Op.notIn]: ['closed', 'resolved'] },
        },
      }),

      // Pending signatures
      Signature.count({ where: { status: 'pending' } }),

      // Staff quals expiring in 60 days
      Qualification.count({
        where: {
          neverExpires: false,
          expiresAt: { [Op.between]: [now, in60Days] },
        },
      }),

      // Expired quals
      Qualification.count({
        where: {
          neverExpires: false,
          expiresAt: { [Op.lt]: now },
        },
      }),

      // Upcoming schedule (next 7 days, scoped by role)
      Schedule.findAll({
        where: {
          ...(isAdminOrAuditor ? {} : { userId }),
          startAt: { [Op.between]: [now, in7Days] },
        },
        include: [
          { model: Project, attributes: ['id', 'customerName', 'address'] },
          { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
        ],
        order: [['startAt', 'ASC']],
        limit: 10,
      }),

      // Recent survey completions
      SatisfactionSurvey.findAll({
        where: { status: 'completed', completedAt: { [Op.gte]: startOfWeek } },
        attributes: ['id', 'projectId', 'rating', 'completedAt'],
        order: [['completedAt', 'DESC']],
        limit: 5,
      }),
    ]);

    // ── Pipeline: group by status ─────────────────────────────
    const pipeline = {
      survey: [] as any[],
      design: [] as any[],
      install: [] as any[],
      commission: [] as any[],
      audit: [] as any[],
    };

    let overdueChecklistCount = 0;

    for (const p of allProjects) {
      const items = (p as any).checklistItems || [];
      const nonCompliant = items.filter((i: any) => i.status === 'noncompliant').length;
      const pending = items.filter((i: any) => i.status === 'pending' && i.required).length;
      const complete = items.filter((i: any) => i.status === 'complete').length;
      const total = items.filter((i: any) => i.required && i.status !== 'na').length;
      const compliancePct = total > 0 ? Math.round((complete / total) * 100) : 0;

      if (nonCompliant > 0) overdueChecklistCount++;

      const projectSummary = {
        id: p.id,
        customerName: p.customerName,
        address: p.address,
        postcode: p.postcode,
        projectType: p.projectType,
        assignee: (p as any).assignee,
        createdAt: p.createdAt,
        compliancePct,
        hasNonCompliant: nonCompliant > 0,
        openComplaints: ((p as any).complaints || []).length,
      };

      if (pipeline[p.status as keyof typeof pipeline]) {
        pipeline[p.status as keyof typeof pipeline].push(projectSummary);
      }
    });

    // ── Alerts bar ────────────────────────────────────────────
    const alerts = [];
    if (emergencyComplaints > 0) alerts.push({ type: 'emergency', message: `${emergencyComplaints} emergency complaint${emergencyComplaints > 1 ? 's' : ''} open`, severity: 'critical' });
    if (overdueComplaints > 0) alerts.push({ type: 'overdue_complaint', message: `${overdueComplaints} complaint${overdueComplaints > 1 ? 's' : ''} past response deadline`, severity: 'high' });
    if (expiredQuals > 0) alerts.push({ type: 'expired_quals', message: `${expiredQuals} staff qualification${expiredQuals > 1 ? 's' : ''} expired`, severity: 'high' });
    if (expiringQuals > 0) alerts.push({ type: 'expiring_quals', message: `${expiringQuals} staff qualification${expiringQuals > 1 ? 's' : ''} expiring within 60 days`, severity: 'medium' });
    if (pendingSignatures > 0) alerts.push({ type: 'pending_signatures', message: `${pendingSignatures} document${pendingSignatures > 1 ? 's' : ''} awaiting signature`, severity: 'low' });
    if (overdueChecklistCount > 0) alerts.push({ type: 'checklist_issues', message: `${overdueChecklistCount} project${overdueChecklistCount > 1 ? 's' : ''} with non-compliant checklist items`, severity: 'medium' });

    // ── Survey stats ──────────────────────────────────────────
    const surveyAvgRating = recentSurveys.length > 0
      ? Math.round(recentSurveys.reduce((sum, s) => sum + (s.rating || 0), 0) / recentSurveys.length * 10) / 10
      : null;

    res.json({
      pipeline,
      totals: {
        total: allProjects.length,
        survey: pipeline.survey.length,
        design: pipeline.design.length,
        install: pipeline.install.length,
        commission: pipeline.commission.length,
        audit: pipeline.audit.length,
      },
      alerts,
      upcomingSchedule,
      recentSurveys: { count: recentSurveys.length, avgRating: surveyAvgRating },
      qualifications: { expiring: expiringQuals, expired: expiredQuals },
      pendingSignatures,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
