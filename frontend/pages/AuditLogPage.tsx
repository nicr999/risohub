// ============================================================
// RISO HUB — pages/AuditLogPage.tsx
// Searchable, filterable system-wide audit trail.
// Admin and Auditor access only.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  entityType: string;
  entityId?: number;
  userId?: number;
  user?: { name: string; email: string };
  oldValue?: object;
  newValue?: object;
  ipAddress?: string;
  metadata?: object;
}

const ACTION_COLOURS: Record<string, string> = {
  created: '#16a34a',
  updated: '#2563eb',
  deleted: '#dc2626',
  generated: '#7A8465',
  signed: '#9333ea',
  login: '#0891b2',
  logout: '#6b7280',
  failed: '#ef4444',
  exported: '#f59e0b',
};

function actionColour(action: string): string {
  const key = Object.keys(ACTION_COLOURS).find(k => action.toLowerCase().includes(k));
  return key ? ACTION_COLOURS[key] : '#aaa';
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/audit-log', {
        params: { page: p, limit: PAGE_SIZE, action: search || undefined, entityType: entityFilter || undefined },
      });
      const data: AuditEntry[] = res.data.entries || res.data;
      if (p === 1) setEntries(data);
      else setEntries(prev => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(p);
    } catch { }
    setLoading(false);
  }, [search, entityFilter]);

  useEffect(() => { load(1); }, [load]);

  const ENTITY_TYPES = ['User', 'Project', 'Document', 'Signature', 'Checklist', 'Complaint', 'Qualification', 'EPCRecord', 'BUSEligibility', 'Report', 'Settings'];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Audit Log</h1>
          <p style={s.subtitle}>Complete system activity trail — append-only</p>
        </div>
        <button style={s.exportBtn} onClick={() => window.open('/api/audit-log?export=csv')}>
          ↓ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <input
          style={s.searchInput}
          placeholder="Search by action…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1)}
        />
        <select style={s.select} value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
          <option value="">All entity types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button style={s.searchBtn} onClick={() => load(1)}>Filter</button>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>Timestamp</th>
              <th style={s.th}>User</th>
              <th style={s.th}>Action</th>
              <th style={s.th}>Entity</th>
              <th style={s.th}>IP</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <React.Fragment key={e.id}>
                <tr style={s.row} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  <td style={s.td}>
                    <div style={s.timestamp}>{new Date(e.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                  </td>
                  <td style={s.td}>{e.user?.name || `User #${e.userId}` || 'System'}</td>
                  <td style={s.td}>
                    <span style={{ ...s.actionTag, background: actionColour(e.action) + '22', color: actionColour(e.action), borderColor: actionColour(e.action) + '44' }}>
                      {e.action}
                    </span>
                  </td>
                  <td style={s.td}>{e.entityType}{e.entityId ? ` #${e.entityId}` : ''}</td>
                  <td style={s.td}><span style={s.ip}>{e.ipAddress || '—'}</span></td>
                  <td style={s.td}><span style={s.chevron}>{expanded === e.id ? '▲' : '▼'}</span></td>
                </tr>
                {expanded === e.id && (
                  <tr>
                    <td colSpan={6} style={s.expandedCell}>
                      <div style={s.expandedContent}>
                        {e.oldValue && (
                          <div style={s.diffSection}>
                            <div style={s.diffLabel}>Before</div>
                            <pre style={s.pre}>{JSON.stringify(e.oldValue, null, 2)}</pre>
                          </div>
                        )}
                        {e.newValue && (
                          <div style={s.diffSection}>
                            <div style={s.diffLabel}>After</div>
                            <pre style={s.pre}>{JSON.stringify(e.newValue, null, 2)}</pre>
                          </div>
                        )}
                        {e.metadata && (
                          <div style={s.diffSection}>
                            <div style={s.diffLabel}>Metadata</div>
                            <pre style={s.pre}>{JSON.stringify(e.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {entries.length === 0 && !loading && (
              <tr><td colSpan={6} style={s.empty}>No audit entries found</td></tr>
            )}
          </tbody>
        </table>

        {loading && <div style={s.loadingRow}>Loading…</div>}

        {hasMore && !loading && (
          <button style={s.loadMoreBtn} onClick={() => load(page + 1)}>Load more</button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, background: '#F5F5F2', minHeight: '100vh', fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 12, color: '#888', margin: '4px 0 0' },
  exportBtn: { fontSize: 12, padding: '6px 14px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  filters: { display: 'flex', gap: 10, marginBottom: 16 },
  searchInput: { fontSize: 13, padding: '7px 12px', border: '1px solid #e0e0d8', borderRadius: 7, background: '#fff', width: 260, outline: 'none' },
  select: { fontSize: 13, padding: '7px 10px', border: '1px solid #e0e0d8', borderRadius: 7, background: '#fff', outline: 'none' },
  searchBtn: { fontSize: 13, padding: '7px 16px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' },
  tableWrap: { background: '#fff', borderRadius: 8, border: '1px solid #e8e8e4', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#fafaf8' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #f0f0ec' },
  row: { borderBottom: '1px solid #f5f5f2', cursor: 'pointer' },
  td: { padding: '10px 14px', fontSize: 12, color: '#333', verticalAlign: 'middle' },
  timestamp: { fontSize: 11, color: '#888', fontFamily: 'monospace' },
  actionTag: { fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid', fontWeight: 700, fontFamily: 'monospace' },
  ip: { fontSize: 10, color: '#aaa', fontFamily: 'monospace' },
  chevron: { fontSize: 9, color: '#bbb' },
  expandedCell: { background: '#fafaf8', padding: 0 },
  expandedContent: { display: 'flex', gap: 16, padding: '12px 14px', flexWrap: 'wrap' },
  diffSection: { flex: 1, minWidth: 200 },
  diffLabel: { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  pre: { fontSize: 11, background: '#f0f0ec', borderRadius: 6, padding: 10, overflow: 'auto', maxHeight: 200, margin: 0, fontFamily: 'monospace', color: '#333' },
  empty: { padding: 32, color: '#bbb', textAlign: 'center' },
  loadingRow: { padding: 16, textAlign: 'center', color: '#888', fontSize: 13 },
  loadMoreBtn: { display: 'block', width: '100%', padding: 12, background: '#fafaf8', border: 'none', borderTop: '1px solid #f0f0ec', color: '#7A8465', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
};
