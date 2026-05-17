// ============================================================
// RISO HUB — DashboardPage.tsx
// Command centre: pipeline kanban, alerts, upcoming schedule
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────

interface ProjectSummary {
  id: number;
  customerName: string;
  address: string;
  postcode: string;
  projectType: 'ASHP' | 'GSHP';
  assignee?: { id: number; name: string };
  createdAt: string;
  compliancePct: number;
  hasNonCompliant: boolean;
  openComplaints: number;
}

interface Pipeline {
  survey: ProjectSummary[];
  design: ProjectSummary[];
  install: ProjectSummary[];
  commission: ProjectSummary[];
  audit: ProjectSummary[];
}

interface Alert {
  type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ScheduleEntry {
  id: number;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  Project: { customerName: string; address: string };
  assignedUser: { name: string };
}

interface DashboardData {
  pipeline: Pipeline;
  totals: Record<string, number>;
  alerts: Alert[];
  upcomingSchedule: ScheduleEntry[];
  recentSurveys: { count: number; avgRating: number | null };
  qualifications: { expiring: number; expired: number };
  pendingSignatures: number;
}

// ── Constants ─────────────────────────────────────────────────

const STAGES: { key: keyof Pipeline; label: string; colour: string }[] = [
  { key: 'survey', label: 'Survey', colour: '#7A8465' },
  { key: 'design', label: 'Design', colour: '#9DA889' },
  { key: 'install', label: 'Install', colour: '#B8C4A4' },
  { key: 'commission', label: 'Commission', colour: '#6B7A5C' },
  { key: 'audit', label: 'Audit', colour: '#4A5740' },
];

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  critical: { bg: '#fef2f2', border: '#fca5a5', icon: '🔴' },
  high: { bg: '#fff7ed', border: '#fed7aa', icon: '🟠' },
  medium: { bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
  low: { bg: '#f0fdf4', border: '#bbf7d0', icon: '🔵' },
};

// ── Main component ─────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/dashboard/summary');
      setData(res.data);
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <LoadingState />;
  if (error || !data) return <div style={styles.error}>{error || 'No data'}</div>;

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Project pipeline and compliance overview</p>
        </div>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {/* ── Alerts bar ── */}
      {data.alerts.length > 0 && (
        <div style={styles.alertsBar}>
          {data.alerts.map((alert, i) => {
            const s = SEVERITY_STYLES[alert.severity];
            return (
              <div key={i} style={{ ...styles.alertChip, background: s.bg, borderColor: s.border }}>
                <span>{s.icon}</span>
                <span style={styles.alertText}>{alert.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stats row ── */}
      <div style={styles.statsRow}>
        <StatCard label="Total Projects" value={data.totals.total} />
        <StatCard label="Pending Signatures" value={data.pendingSignatures} accent={data.pendingSignatures > 0} />
        <StatCard label="Quals Expiring" value={data.qualifications.expiring} accent={data.qualifications.expiring > 0} colour="#f59e0b" />
        <StatCard label="Quals Expired" value={data.qualifications.expired} accent={data.qualifications.expired > 0} colour="#ef4444" />
        {data.recentSurveys.avgRating && (
          <StatCard label="Survey Rating (wk)" value={`${data.recentSurveys.avgRating}/5`} />
        )}
      </div>

      {/* ── Pipeline kanban ── */}
      <div style={styles.sectionTitle}>Project Pipeline</div>
      <div style={styles.kanban}>
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage.key}
            stage={stage}
            projects={data.pipeline[stage.key]}
            onProjectClick={(id) => navigate(`/projects/${id}`)}
          />
        ))}
      </div>

      {/* ── Bottom row: schedule + survey summary ── */}
      <div style={styles.bottomRow}>
        <UpcomingSchedule entries={data.upcomingSchedule} onProjectClick={(id) => navigate(`/projects/${id}`)} />
        <SurveySnapshot surveys={data.recentSurveys} />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function KanbanColumn({ stage, projects, onProjectClick }: {
  stage: typeof STAGES[0];
  projects: ProjectSummary[];
  onProjectClick: (id: number) => void;
}) {
  return (
    <div style={styles.column}>
      <div style={{ ...styles.columnHeader, borderTopColor: stage.colour }}>
        <span style={{ ...styles.columnTitle, color: stage.colour }}>{stage.label}</span>
        <span style={{ ...styles.columnCount, background: stage.colour }}>{projects.length}</span>
      </div>
      <div style={styles.columnBody}>
        {projects.length === 0 && (
          <div style={styles.emptyColumn}>No projects</div>
        )}
        {projects.map(p => (
          <ProjectCard key={p.id} project={p} onClick={() => onProjectClick(p.id)} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project: p, onClick }: { project: ProjectSummary; onClick: () => void }) {
  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.cardHeader}>
        <span style={styles.cardName}>{p.customerName}</span>
        <span style={styles.cardType}>{p.projectType}</span>
      </div>
      <div style={styles.cardAddress}>{p.address}, {p.postcode}</div>
      {p.assignee && <div style={styles.cardAssignee}>👤 {p.assignee.name}</div>}
      <div style={styles.cardFooter}>
        <ComplianceBar pct={p.compliancePct} hasIssue={p.hasNonCompliant} />
        {p.openComplaints > 0 && (
          <span style={styles.complaintsTag}>⚠ {p.openComplaints} complaint{p.openComplaints > 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

function ComplianceBar({ pct, hasIssue }: { pct: number; hasIssue: boolean }) {
  const colour = hasIssue ? '#ef4444' : pct === 100 ? '#22c55e' : '#7A8465';
  return (
    <div style={styles.complianceWrap}>
      <div style={{ ...styles.complianceBar, width: `${pct}%`, background: colour }} />
      <span style={{ ...styles.compliancePct, color: colour }}>{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, accent = false, colour = '#7A8465' }: {
  label: string; value: string | number; accent?: boolean; colour?: string;
}) {
  return (
    <div style={{ ...styles.statCard, borderTopColor: accent ? colour : '#DBD2C4' }}>
      <div style={{ ...styles.statValue, color: accent ? colour : '#333' }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function UpcomingSchedule({ entries, onProjectClick }: {
  entries: ScheduleEntry[];
  onProjectClick: (id: number) => void;
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Upcoming Schedule (7 days)</div>
      {entries.length === 0 && <div style={styles.empty}>No jobs scheduled</div>}
      {entries.map(e => (
        <div key={e.id} style={styles.scheduleItem} onClick={() => onProjectClick(e.Project ? (e as any).projectId : 0)}>
          <div style={styles.scheduleType}>{e.type.toUpperCase()}</div>
          <div style={styles.scheduleDetail}>
            <div style={styles.scheduleCustomer}>{e.Project?.customerName}</div>
            <div style={styles.scheduleAddress}>{e.Project?.address}</div>
            <div style={styles.scheduleTime}>
              {new Date(e.startAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              {!e.allDay && ` · ${new Date(e.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
              {e.assignedUser && ` · ${e.assignedUser.name}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SurveySnapshot({ surveys }: { surveys: { count: number; avgRating: number | null } }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Surveys this week</div>
      {surveys.count === 0
        ? <div style={styles.empty}>No surveys completed this week</div>
        : (
          <div style={styles.surveyStats}>
            <div style={styles.surveyBig}>{surveys.count}</div>
            <div style={styles.surveyLabel}>completed</div>
            {surveys.avgRating && (
              <>
                <div style={{ ...styles.surveyBig, color: '#7A8465', marginTop: 16 }}>{surveys.avgRating}<span style={{ fontSize: 16 }}>/5</span></div>
                <div style={styles.surveyLabel}>average rating</div>
              </>
            )}
          </div>
        )
      }
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: '#7A8465', fontSize: 14 }}>Loading dashboard…</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '24px', background: '#F5F5F2', minHeight: '100vh', fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '4px 0 0' },
  refreshBtn: { fontSize: 12, padding: '6px 12px', border: '1px solid #DBD2C4', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#555' },
  alertsBar: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  alertChip: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1px solid', fontSize: 12 },
  alertText: { color: '#333' },
  statsRow: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  statCard: { background: '#fff', borderRadius: 8, padding: '14px 18px', borderTop: '3px solid', flex: '1 1 120px', minWidth: 100 },
  statValue: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kanban: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 },
  column: { background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e4' },
  columnHeader: { padding: '10px 12px', borderTop: '3px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0ec' },
  columnTitle: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  columnCount: { fontSize: 11, color: '#fff', borderRadius: 10, padding: '2px 7px', fontWeight: 700 },
  columnBody: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120, maxHeight: 480, overflowY: 'auto' },
  emptyColumn: { fontSize: 11, color: '#bbb', textAlign: 'center', padding: '20px 0' },
  card: { background: '#fafaf8', border: '1px solid #e8e8e4', borderRadius: 6, padding: '10px 11px', cursor: 'pointer', transition: 'box-shadow 0.15s' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  cardName: { fontSize: 12, fontWeight: 600, color: '#333' },
  cardType: { fontSize: 10, color: '#7A8465', background: '#f0f1ec', padding: '1px 6px', borderRadius: 4 },
  cardAddress: { fontSize: 11, color: '#777', marginBottom: 4 },
  cardAssignee: { fontSize: 10, color: '#999', marginBottom: 6 },
  cardFooter: { display: 'flex', alignItems: 'center', gap: 8 },
  complianceWrap: { flex: 1, display: 'flex', alignItems: 'center', gap: 5 },
  complianceBar: { height: 3, borderRadius: 2, transition: 'width 0.3s' },
  compliancePct: { fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' },
  complaintsTag: { fontSize: 9, color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' },
  bottomRow: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 },
  panel: { background: '#fff', borderRadius: 8, border: '1px solid #e8e8e4', padding: '16px 18px' },
  panelTitle: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 },
  scheduleItem: { display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f5f0', cursor: 'pointer' },
  scheduleType: { fontSize: 9, fontWeight: 700, color: '#7A8465', background: '#f0f1ec', padding: '2px 7px', borderRadius: 4, height: 'fit-content', marginTop: 2, letterSpacing: '0.06em' },
  scheduleDetail: { flex: 1 },
  scheduleCustomer: { fontSize: 12, fontWeight: 600, color: '#333' },
  scheduleAddress: { fontSize: 11, color: '#777' },
  scheduleTime: { fontSize: 10, color: '#999', marginTop: 2 },
  surveyStats: { textAlign: 'center', padding: '8px 0' },
  surveyBig: { fontSize: 40, fontWeight: 700, color: '#333' },
  surveyLabel: { fontSize: 12, color: '#888' },
  empty: { fontSize: 12, color: '#bbb', padding: '12px 0' },
  error: { padding: 24, color: '#ef4444' },
};
