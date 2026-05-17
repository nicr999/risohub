// routes/analyticsRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticate, authorize as requireRole } from '../auth/authMiddleware';
import { Op, fn, col } from 'sequelize';
import { Project, User, Qualification, Complaint, ChecklistItem } from '../models';
import { subMonths, startOfMonth, format } from 'date-fns';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getComplianceScoreForProject(projectId: number | string): Promise<number> {
  const items = await ChecklistItem.findAll({
    where: {
      projectId,
      required: true,
      status: { [Op.ne]: 'na' },
    },
    attributes: ['status'],
    raw: true,
  });
  if (items.length === 0) return 0;
  const complete = (items as any[]).filter(i => i.status === 'complete').length;
  return Math.round((complete / items.length) * 100);
}

async function getAvgComplianceScore(projectIds: (number | string)[]): Promise<{ avg: number; below80: number }> {
  if (projectIds.length === 0) return { avg: 0, below80: 0 };
  const scores = await Promise.all(projectIds.map(id => getComplianceScoreForProject(id)));
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const below80 = scores.filter(s => s < 80).length;
  return { avg, below80 };
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get('/', authenticate, requireRole(['Admin', 'Auditor']), async (req: Request, res: Response) => {
  try {
    const rangeMonths = req.query.range === '3m' ? 3 : req.query.range === '12m' ? 12 : 6;
    const since = subMonths(new Date(), rangeMonths);

    // Build month labels
    const months: string[] = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      months.push(format(subMonths(new Date(), i), 'MMM yy'));
    }

    const allProjects = await Project.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ['id', 'status', 'createdAt', 'updatedAt'],
      raw: true,
    });

    // Project velocity: created + completed per month
    const projectVelocity = months.map(month => {
      const created = allProjects.filter((p: any) => format(new Date(p.createdAt), 'MMM yy') === month).length;
      const completed = allProjects.filter((p: any) =>
        p.status === 'Complete' && format(new Date(p.updatedAt), 'MMM yy') === month
      ).length;
      return { month, created, completed };
    });

    // Compliance score trend — real checklist data grouped by project creation month
    const complianceScoreTrend = await Promise.all(
      months.map(async (month, _i) => {
        const monthProjects = allProjects.filter(
          (p: any) => format(new Date(p.createdAt), 'MMM yy') === month
        );
        const ids = monthProjects.map((p: any) => p.id);
        const { avg, below80 } = await getAvgComplianceScore(ids);
        return { month, avgScore: avg, below80 };
      })
    );

    // Status breakdown
    const statusCounts = await Project.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }) as any[];

    const statusBreakdown = statusCounts.map(r => ({
      status: r.status,
      count: Number(r.count),
    }));

    // Qualification expiry buckets
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const in60 = new Date(now.getTime() + 60 * 86400000);
    const in90 = new Date(now.getTime() + 90 * 86400000);

    const [expired, exp30, exp60, exp90, valid] = await Promise.all([
      Qualification.count({ where: { expiresAt: { [Op.lt]: now } } }),
      Qualification.count({ where: { expiresAt: { [Op.between]: [now, in30] } } }),
      Qualification.count({ where: { expiresAt: { [Op.between]: [in30, in60] } } }),
      Qualification.count({ where: { expiresAt: { [Op.between]: [in60, in90] } } }),
      Qualification.count({ where: { expiresAt: { [Op.gt]: in90 } } }),
    ]);

    const qualificationExpiry = [
      { label: 'Expired',     count: expired, colour: '#E74C3C' },
      { label: 'Exp < 30d',  count: exp30,   colour: '#E67E22' },
      { label: 'Exp 30–60d', count: exp60,   colour: '#F39C12' },
      { label: 'Exp 60–90d', count: exp90,   colour: '#F1C40F' },
      { label: 'Valid 90d+', count: valid,   colour: '#27AE60' },
    ];

    // KPIs — overall avg compliance across all projects (not just range)
    const [totalProjects, completedThisMonth, openComplaints, activeUsers] = await Promise.all([
      Project.count(),
      Project.count({
        where: {
          status: 'Complete',
          updatedAt: { [Op.gte]: startOfMonth(new Date()) },
        },
      }),
      Complaint.count({ where: { status: { [Op.notIn]: ['Closed', 'Resolved'] } } }),
      User.count({ where: { active: true } }),
    ]);

    const allProjectIds = (await Project.findAll({ attributes: ['id'], raw: true })).map((p: any) => p.id);
    const { avg: avgComplianceScore } = await getAvgComplianceScore(allProjectIds);

    // Top installers — real compliance score across completed projects
    const installers = await User.findAll({
      where: { role: 'Installer', active: true },
      attributes: ['id', 'name'],
    });

    const topInstallers = await Promise.all(
      installers.slice(0, 10).map(async (installer: any) => {
        const installerProjects = await Project.findAll({
          where: { installerId: installer.id, status: 'Complete' },
          attributes: ['id'],
          raw: true,
        });
        const completed = installerProjects.length;
        const ids = installerProjects.map((p: any) => p.id);
        const { avg: avgScore } = await getAvgComplianceScore(ids);
        return { name: installer.name, completed, avgScore };
      })
    );
    topInstallers.sort((a, b) => b.completed - a.completed);

    return res.json({
      projectVelocity,
      complianceScoreTrend,
      statusBreakdown,
      qualificationExpiry,
      kpis: {
        totalProjects,
        completedThisMonth,
        avgComplianceScore,
        expiringQuals30Days: exp30,
        openComplaints,
        activeUsers,
      },
      topInstallers: topInstallers.slice(0, 5),
    });
  } catch (err) {
    console.error('[analyticsRoutes] error:', err);
    return res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

export default router;
