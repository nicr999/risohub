// ============================================================
// RISO HUB — SatisfactionSurveyResults.tsx
// Admin view of all surveys + aggregate stats
// ============================================================

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Survey {
  id: number;
  status: string;
  rating?: number;
  comments?: string;
  wouldRecommend?: boolean;
  npsScore?: number;
  sentAt?: string;
  completedAt?: string;
  Project: { id: number; customerName: string; address: string; postcode: string };
  sender: { name: string };
}

interface Results {
  totalCompleted: number;
  averageRating: number | null;
  npsScore: number | null;
  recommendRate: number | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#f5f5f2', color: '#888' },
  sent: { bg: '#eff6ff', color: '#3b82f6' },
  completed: { bg: '#f0fdf4', color: '#16a34a' },
  expired: { bg: '#fef2f2', color: '#dc2626' },
};

export default function SatisfactionSurveyResults() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProjectId, setSendProjectId] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');

  useEffect(() => { load(); }, [statusFilter]);

  async function load() {
    setLoading(true);
    try {
      const [surveysRes, resultsRes] = await Promise.all([
        axios.get('/api/surveys', { params: statusFilter ? { status: statusFilter } : {} }),
        axios.get('/api/surveys/results'),
      ]);
      setSurveys(surveysRes.data);
      setResults(resultsRes.data);
    } catch { }
    finally { setLoading(false); }
  }

  async function handleSend() {
    if (!sendProjectId) { setSendError('Enter a project ID'); return; }
    setSending(true); setSendError(''); setSendSuccess('');
    try {
      await axios.post('/api/surveys/send', { projectId: parseInt(sendProjectId) });
      setSendSuccess('Survey sent to customer');
      setSendProjectId('');
      setTimeout(() => { setShowSendModal(false); setSendSuccess(''); load(); }, 2000);
    } catch (e: any) {
      setSendError(e.response?.data?.error || 'Failed to send survey');
    } finally {
      setSending(false);
    }
  }

  const completedSurveys = surveys.filter(s => s.status === 'completed');

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Customer Surveys</h2>
          <p style={s.subtitle}>Post-installation satisfaction tracking</p>
        </div>
        <button style={s.sendBtn} onClick={() => setShowSendModal(true)}>+ Send Survey</button>
      </div>

      {/* ── Aggregate stats ── */}
      {results && results.totalCompleted > 0 && (
        <div style={s.statsRow}>
          <StatTile label="Surveys Completed" value={results.totalCompleted} />
          <StatTile
            label="Average Rating"
            value={results.averageRating ? `${results.averageRating} / 5` : '—'}
            sub={results.averageRating ? renderStars(results.averageRating) : ''}
          />
          <StatTile
            label="NPS Score"
            value={results.npsScore != null ? results.npsScore : '—'}
            colour={results.npsScore != null ? (results.npsScore >= 50 ? '#16a34a' : results.npsScore >= 0 ? '#d97706' : '#dc2626') : '#888'}
          />
          <StatTile
            label="Would Recommend"
            value={results.recommendRate != null ? `${results.recommendRate}%` : '—'}
          />
        </div>
      )}

      {/* ── Filter ── */}
      <div style={s.filterRow}>
        {['', 'sent', 'completed', 'pending', 'expired'].map(f => (
          <button
            key={f}
            style={{ ...s.filterBtn, ...(statusFilter === f ? s.filterBtnActive : {}) }}
            onClick={() => setStatusFilter(f)}
          >
            {f === '' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={s.loading}>Loading surveys…</div>
      ) : surveys.length === 0 ? (
        <div style={s.empty}>No surveys found</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Address</th>
                <th style={s.th}>Sent by</th>
                <th style={s.th}>Sent</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Rating</th>
                <th style={s.th}>NPS</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {surveys.map(sv => {
                const ss = STATUS_STYLE[sv.status] || STATUS_STYLE.pending;
                return (
                  <React.Fragment key={sv.id}>
                    <tr
                      style={{ ...s.tr, cursor: sv.status === 'completed' ? 'pointer' : 'default' }}
                      onClick={() => sv.status === 'completed' && setExpanded(expanded === sv.id ? null : sv.id)}
                    >
                      <td style={s.td}><span style={s.customerName}>{sv.Project?.customerName}</span></td>
                      <td style={s.td}><span style={s.address}>{sv.Project?.address}</span></td>
                      <td style={s.td}>{sv.sender?.name}</td>
                      <td style={s.td}>{sv.sentAt ? new Date(sv.sentAt).toLocaleDateString('en-GB') : '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.statusBadge, background: ss.bg, color: ss.color }}>
                          {sv.status}
                        </span>
                      </td>
                      <td style={s.td}>
                        {sv.rating ? <span style={s.rating}>{renderStars(sv.rating)}</span> : '—'}
                      </td>
                      <td style={s.td}>
                        {sv.npsScore != null ? (
                          <span style={{ ...s.npsBadge, color: sv.npsScore >= 9 ? '#16a34a' : sv.npsScore <= 6 ? '#dc2626' : '#d97706' }}>
                            {sv.npsScore}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={s.td}>
                        {sv.status === 'completed' && (
                          <span style={s.expandIcon}>{expanded === sv.id ? '▲' : '▼'}</span>
                        )}
                      </td>
                    </tr>
                    {expanded === sv.id && sv.status === 'completed' && (
                      <tr style={s.expandedRow}>
                        <td colSpan={8} style={s.expandedTd}>
                          <div style={s.expandedContent}>
                            <div style={s.expandedGrid}>
                              <div>
                                <label style={s.expandedLabel}>Rating</label>
                                <div style={s.expandedValue}>{renderStars(sv.rating!)} ({sv.rating}/5)</div>
                              </div>
                              <div>
                                <label style={s.expandedLabel}>Would recommend</label>
                                <div style={s.expandedValue}>{sv.wouldRecommend === true ? '👍 Yes' : sv.wouldRecommend === false ? '👎 No' : '—'}</div>
                              </div>
                              <div>
                                <label style={s.expandedLabel}>NPS</label>
                                <div style={s.expandedValue}>{sv.npsScore != null ? sv.npsScore : '—'}</div>
                              </div>
                              <div>
                                <label style={s.expandedLabel}>Completed</label>
                                <div style={s.expandedValue}>{sv.completedAt ? new Date(sv.completedAt).toLocaleDateString('en-GB') : '—'}</div>
                              </div>
                            </div>
                            {sv.comments && (
                              <div style={s.commentsBox}>
                                <label style={s.expandedLabel}>Comments</label>
                                <p style={s.commentText}>"{sv.comments}"</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Send survey modal ── */}
      {showSendModal && (
        <div style={s.overlay} onClick={() => setShowSendModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Send Satisfaction Survey</h3>
            <p style={s.modalDesc}>The survey will be emailed to the customer associated with the project.</p>
            <div style={s.formField}>
              <label style={s.fieldLabel}>Project ID</label>
              <input
                style={s.input}
                type="number"
                placeholder="Enter project ID…"
                value={sendProjectId}
                onChange={e => setSendProjectId(e.target.value)}
              />
            </div>
            {sendError && <div style={s.errorBanner}>{sendError}</div>}
            {sendSuccess && <div style={s.successBanner}>{sendSuccess}</div>}
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setShowSendModal(false)}>Cancel</button>
              <button style={s.saveBtn} onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send Survey'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function renderStars(rating: number): string {
  return '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
}

function StatTile({ label, value, sub, colour }: { label: string; value: string | number; sub?: string; colour?: string }) {
  return (
    <div style={s.statTile}>
      <div style={{ ...s.statValue, color: colour || '#333' }}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'Satoshi, sans-serif', background: '#F5F5F2', minHeight: '100vh', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '3px 0 0' },
  sendBtn: { fontSize: 12, padding: '7px 16px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  statsRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  statTile: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '14px 20px', flex: '1 1 120px', minWidth: 110 },
  statValue: { fontSize: 26, fontWeight: 700 },
  statSub: { fontSize: 14, color: '#f59e0b', marginTop: 2 },
  statLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  filterRow: { display: 'flex', gap: 6, marginBottom: 16 },
  filterBtn: { fontSize: 12, padding: '5px 14px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#555' },
  filterBtnActive: { background: '#7A8465', color: '#fff', borderColor: '#7A8465' },
  loading: { padding: 40, textAlign: 'center', color: '#999', fontSize: 13 },
  empty: { padding: 40, textAlign: 'center', color: '#bbb', fontSize: 13 },
  tableWrap: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  theadRow: { background: '#fafaf8' },
  th: { fontSize: 11, fontWeight: 700, color: '#888', padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f0f0ec', textTransform: 'uppercase', letterSpacing: '0.04em' },
  tr: { borderBottom: '1px solid #f8f8f6' },
  td: { fontSize: 13, color: '#444', padding: '11px 16px', verticalAlign: 'middle' },
  customerName: { fontWeight: 600, color: '#333' },
  address: { color: '#777', fontSize: 12 },
  statusBadge: { fontSize: 11, padding: '2px 9px', borderRadius: 10, fontWeight: 600 },
  rating: { color: '#f59e0b', fontSize: 14 },
  npsBadge: { fontWeight: 700, fontSize: 14 },
  expandIcon: { fontSize: 11, color: '#bbb', cursor: 'pointer' },
  expandedRow: { background: '#fafaf8' },
  expandedTd: { padding: '0' },
  expandedContent: { padding: '16px 20px', borderTop: '1px solid #f0f0ec' },
  expandedGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 12 },
  expandedLabel: { fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 },
  expandedValue: { fontSize: 14, color: '#333', fontWeight: 500 },
  commentsBox: {},
  commentText: { fontSize: 13, color: '#555', fontStyle: 'italic', background: '#fff', borderLeft: '3px solid #7A8465', paddingLeft: 12, margin: '6px 0 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 10, padding: '24px 28px', width: 420, maxWidth: '95vw' },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#333', margin: '0 0 8px' },
  modalDesc: { fontSize: 13, color: '#777', marginBottom: 16 },
  formField: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: '#dc2626', marginBottom: 10 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: '#16a34a', marginBottom: 10 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  saveBtn: { fontSize: 12, padding: '7px 16px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancelBtn: { fontSize: 12, padding: '7px 12px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
};
