// src/components/analytics/AnalyticsDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { TrendingUp, CheckCircle, AlertTriangle, Users, Folder, Download } from 'lucide-react';

interface AnalyticsData {
  projectVelocity: Array<{ month: string; created: number; completed: number }>;
  complianceScoreTrend: Array<{ month: string; avgScore: number; below80: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  qualificationExpiry: Array<{ label: string; count: number; colour: string }>;
  kpis: {
    totalProjects: number;
    completedThisMonth: number;
    avgComplianceScore: number;
    expiringQuals30Days: number;
    openComplaints: number;
    activeUsers: number;
  };
  topInstallers: Array<{ name: string; completed: number; avgScore: number }>;
}

const STATUS_COLOURS: Record<string, string> = {
  Survey: '#3498DB',
  Install: '#E67E22',
  Commission: '#9B59B6',
  Complete: '#27AE60',
  'On Hold': '#95A5A6',
};

// ─── CSV export ───────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ];
  return lines.join('\n');
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAnalyticsCSV(data: AnalyticsData, range: string) {
  const date = new Date().toISOString().slice(0, 10);

  // Sheet 1: KPIs
  const kpiCsv = toCSV([
    { Metric: 'Total Projects',       Value: data.kpis.totalProjects },
    { Metric: 'Completed This Month', Value: data.kpis.completedThisMonth },
    { Metric: 'Avg Compliance Score', Value: `${data.kpis.avgComplianceScore}%` },
    { Metric: 'Quals Expiring 30d',   Value: data.kpis.expiringQuals30Days },
    { Metric: 'Open Complaints',      Value: data.kpis.openComplaints },
    { Metric: 'Active Users',         Value: data.kpis.activeUsers },
  ], ['Metric', 'Value']);

  // Sheet 2: Velocity
  const velocityCsv = toCSV(
    data.projectVelocity.map(r => ({ Month: r.month, Created: r.created, Completed: r.completed })),
    ['Month', 'Created', 'Completed']
  );

  // Sheet 3: Compliance trend
  const complianceCsv = toCSV(
    data.complianceScoreTrend.map(r => ({ Month: r.month, 'Avg Score (%)': r.avgScore, 'Below 80%': r.below80 })),
    ['Month', 'Avg Score (%)', 'Below 80%']
  );

  // Sheet 4: Status breakdown
  const statusCsv = toCSV(
    data.statusBreakdown.map(r => ({ Status: r.status, Count: r.count })),
    ['Status', 'Count']
  );

  // Sheet 5: Top installers
  const installerCsv = toCSV(
    data.topInstallers.map(r => ({ Name: r.name, Completed: r.completed, 'Avg Compliance (%)': r.avgScore })),
    ['Name', 'Completed', 'Avg Compliance (%)']
  );

  // Combine with section headings
  const combined = [
    `RISO HUB Analytics Export — ${range} — ${date}`,
    '',
    'KPIs',
    kpiCsv,
    '',
    'Project Velocity',
    velocityCsv,
    '',
    'Compliance Score Trend',
    complianceCsv,
    '',
    'Status Breakdown',
    statusCsv,
    '',
    'Top Installers',
    installerCsv,
  ].join('\n');

  downloadCSV(`risohub-analytics-${range}-${date}.csv`, combined);
}

// ─── Print / PDF export ───────────────────────────────────────────────────────

function exportPDF() {
  window.print();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'3m' | '6m' | '12m'>('6m');

  useEffect(() => {
    fetchAnalytics();
  }, [range]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/analytics?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      setData(await res.json());
    } catch (err) {
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900" />
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-red-600 text-sm">{error ?? 'No data available.'}</div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-900" /> Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-1">Project velocity, compliance trends, and team performance</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {(['3m', '6m', '12m'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                range === r ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r}
            </button>
          ))}
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={() => data && exportAnalyticsCSV(data, range)}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export to CSV"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed print:hidden"
            title="Print / Save as PDF"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={<Folder className="w-5 h-5" />} label="Total Projects" value={data.kpis.totalProjects} colour="blue" />
        <KpiCard icon={<CheckCircle className="w-5 h-5" />} label="Completed (month)" value={data.kpis.completedThisMonth} colour="green" />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Compliance" value={`${data.kpis.avgComplianceScore}%`} colour={data.kpis.avgComplianceScore >= 80 ? 'green' : 'amber'} />
        <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Quals Expiring (30d)" value={data.kpis.expiringQuals30Days} colour={data.kpis.expiringQuals30Days > 0 ? 'amber' : 'green'} />
        <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Open Complaints" value={data.kpis.openComplaints} colour={data.kpis.openComplaints > 0 ? 'red' : 'green'} />
        <KpiCard icon={<Users className="w-5 h-5" />} label="Active Users" value={data.kpis.activeUsers} colour="blue" />
      </div>

      {/* Row 1: velocity + compliance trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project velocity */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Project Velocity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.projectVelocity} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6F8" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="created" name="Created" fill="#3498DB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill="#27AE60" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Compliance score trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Avg Compliance Score</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.complianceScoreTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6F8" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v: number) => [`${v}%`]} />
              <Legend />
              <Line type="monotone" dataKey="avgScore" name="Avg Score" stroke="#1B4F72" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="below80" name="Below 80%" stroke="#E74C3C" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: status breakdown + qual expiry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Projects by Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.statusBreakdown}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.statusBreakdown.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLOURS[entry.status] ?? '#95A5A6'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Qualification expiry */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Qualification Expiry</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.qualificationExpiry} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F4F6F8" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" name="Qualifications" radius={[0, 4, 4, 0]}>
                {data.qualificationExpiry.map((entry) => (
                  <Cell key={entry.label} fill={entry.colour} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top installers table */}
      {data.topInstallers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Installer Performance</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-3 font-semibold">Installer</th>
                <th className="pb-3 font-semibold text-right">Completed</th>
                <th className="pb-3 font-semibold text-right">Avg Compliance</th>
                <th className="pb-3 font-semibold text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.topInstallers.map((installer, i) => (
                <tr key={installer.name} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 font-medium text-gray-900">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold mr-2">
                      {i + 1}
                    </span>
                    {installer.name}
                  </td>
                  <td className="py-3 text-right text-gray-700">{installer.completed}</td>
                  <td className="py-3 text-right">
                    <span className={`font-semibold ${installer.avgScore >= 80 ? 'text-green-600' : installer.avgScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {installer.avgScore}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <ScoreBar score={installer.avgScore} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, colour }: { icon: React.ReactNode; label: string; value: number | string; colour: 'blue' | 'green' | 'amber' | 'red' }) {
  const colourMap = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className={`inline-flex p-2 rounded-lg ${colourMap[colour]} mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const colour = score >= 80 ? '#27AE60' : score >= 60 ? '#F39C12' : '#E74C3C';
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: colour }} />
      </div>
    </div>
  );
}
