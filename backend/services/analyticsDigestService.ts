// services/analyticsDigestService.ts
// Builds the weekly analytics digest: fetches DB stats, generates CSV,
// then sends via sendAnalyticsDigest (emailService) to all Admin users.
//
// Called by emailWorker when it receives 'analytics.weeklyDigest'.
//
// CSV structure:
//   Section 1: KPIs (total, new this week, completed this week, pending sign-offs)
//   Section 2: Project velocity (status distribution)
//   Section 3: Top installers (completed count + avg compliance score)

import { User, Project, ChecklistItem, Signature } from '../models/index';
import { Op } from 'sequelize';
import { sendAnalyticsDigest } from './emailService';

const APP_URL = process.env.APP_URL ?? 'https://app.risohome.co.uk';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCell(v: unknown): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCsv(rows: Record<string, unknown>[], headers: string[]): string {
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escapeCell(r[h])).join(',')),
  ].join('\n');
}

// ─── Real compliance score for a project ──────────────────────────────────────

async function getAvgComplianceForProjects(projectIds: string[]): Promise<number> {
  if (projectIds.length === 0) return 0;
  const items = await ChecklistItem.findAll({
    where: {
      projectId: { [Op.in]: projectIds },
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

// ─── Main digest builder ──────────────────────────────────────────────────────

export async function sendWeeklyAnalyticsDigest(): Promise<void> {
  const weekEnding = new Date();
  const weekStart  = new Date(Date.now() - 7 * 86_400_000);

  // ── Fetch stats ────────────────────────────────────────────
  const [totalProjects, newThisWeek, completedThisWeek, pendingSignoffs] = await Promise.all([
    Project.count(),
    Project.count({ where: { createdAt: { [Op.gte]: weekStart } } }),
    Project.count({ where: { status: 'audit', updatedAt: { [Op.gte]: weekStart } } }),
    Signature.count({ where: { status: 'pending' } }),
  ]);

  // Status breakdown
  const statusCounts = await Project.findAll({
    attributes: [
      'status',
      [Project.sequelize!.fn('COUNT', Project.sequelize!.col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  }) as any[];

  // Top installers (completed projects in last 12 months)
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const completedProjects = await Project.findAll({
    where: { status: 'audit', updatedAt: { [Op.gte]: yearAgo } },
    attributes: ['id', 'assignedTo'],
    raw: true,
  }) as any[];

  // Group by assignedTo
  const byInstaller = new Map<string, string[]>();
  for (const p of completedProjects) {
    if (!p.assignedTo) continue;
    if (!byInstaller.has(p.assignedTo)) byInstaller.set(p.assignedTo, []);
    byInstaller.get(p.assignedTo)!.push(p.id);
  }

  const installerIds = [...byInstaller.keys()];
  const installerUsers = installerIds.length > 0
    ? await User.findAll({ where: { id: { [Op.in]: installerIds } }, attributes: ['id', 'name'], raw: true }) as any[]
    : [];
  const nameById = new Map(installerUsers.map(u => [u.id, u.name]));

  const topInstallerRows: Record<string, unknown>[] = [];
  for (const [userId, projectIds] of byInstaller) {
    const avgScore = await getAvgComplianceForProjects(projectIds);
    topInstallerRows.push({
      Installer:         nameById.get(userId) ?? userId,
      'Completed (yr)':  projectIds.length,
      'Avg Compliance':  `${avgScore}%`,
    });
  }
  topInstallerRows.sort((a, b) => (b['Completed (yr)'] as number) - (a['Completed (yr)'] as number));

  const avgCompliance = await getAvgComplianceForProjects(
    completedProjects.map((p: any) => p.id)
  );

  // ── Build CSV ──────────────────────────────────────────────
  const dateStr   = weekEnding.toISOString().slice(0, 10);
  const weekLabel = weekEnding.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const kpiCsv = buildCsv([
    { Metric: 'Total Projects',        Value: totalProjects },
    { Metric: 'New This Week',         Value: newThisWeek },
    { Metric: 'Completed This Week',   Value: completedThisWeek },
    { Metric: 'Pending Sign-offs',     Value: pendingSignoffs },
    { Metric: 'Avg Compliance Score',  Value: `${avgCompliance}%` },
  ], ['Metric', 'Value']);

  const statusCsv = buildCsv(
    statusCounts.map(r => ({ Status: r.status, Count: r.count })),
    ['Status', 'Count']
  );

  const installerCsv = topInstallerRows.length > 0
    ? buildCsv(topInstallerRows, ['Installer', 'Completed (yr)', 'Avg Compliance'])
    : 'No completed projects in the last 12 months';

  const csvContent = [
    `RISO HUB Analytics Digest — Week ending ${weekLabel}`,
    '',
    'KPIs',
    kpiCsv,
    '',
    'Project Status Breakdown',
    statusCsv,
    '',
    'Top Installers (last 12 months)',
    installerCsv,
  ].join('\n');

  const csvFilename = `risohub-analytics-digest-${dateStr}.csv`;

  // ── Send to all Admin users ────────────────────────────────
  const admins = await User.findAll({ where: { role: 'Admin', active: true } });

  for (const admin of admins) {
    await sendAnalyticsDigest({
      to:            (admin as any).email,
      recipientName: (admin as any).name,
      weekEnding,
      stats: {
        totalProjects,
        newThisWeek,
        completedThisWeek,
        pendingSignoffs,
        avgCompliance,
      },
      csvFilename,
      csvContent,
      dashboardUrl: APP_URL,
    });
  }

  console.log(`[AnalyticsDigest] Sent to ${admins.length} admin(s) for week ending ${weekLabel}`);
}
