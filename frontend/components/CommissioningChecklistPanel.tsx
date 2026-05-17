// ============================================================
// RISO HUB — components/CommissioningChecklistPanel.tsx
// Separate from MIS 3005 checklist. Tracks pass/fail with
// measured values (temperatures, pressures, flow rates).
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

interface CommItem {
  id: number;
  key: string;
  section: string;
  name: string;
  ref?: string;
  guidance?: string;
  required: boolean;
  status: 'pending' | 'pass' | 'fail' | 'na';
  measuredValue?: string;
  expectedValue?: string;
  notes?: string;
}

const STATUS_CFG = {
  pending: { label: 'Pending', colour: '#aaa', bg: '#f5f5f0', icon: '○' },
  pass: { label: 'Pass', colour: '#16a34a', bg: '#f0fdf4', icon: '✓' },
  fail: { label: 'Fail', colour: '#dc2626', bg: '#fef2f2', icon: '✗' },
  na: { label: 'N/A', colour: '#aaa', bg: '#f5f5f0', icon: '—' },
};

export default function CommissioningChecklistPanel({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<CommItem[]>([]);
  const [grouped, setGrouped] = useState<Record<string, CommItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [selected, setSelected] = useState<CommItem | null>(null);
  const [form, setForm] = useState({ status: 'pending', measuredValue: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/commissioning/${projectId}`);
      const data: CommItem[] = res.data;
      setItems(data);
      const g: Record<string, CommItem[]> = {};
      data.forEach(i => { if (!g[i.section]) g[i.section] = []; g[i.section].push(i); });
      setGrouped(g);
    } catch { }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function seed() {
    setSeeding(true);
    try {
      await axios.post(`/api/commissioning/${projectId}/seed`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to seed');
    }
    setSeeding(false);
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      await axios.patch(`/api/commissioning/item/${selected.id}`, {
        status: form.status,
        measuredValue: form.measuredValue || undefined,
        notes: form.notes || undefined,
      });
      setSelected(null);
      load();
    } catch { setError('Save failed'); }
    setSaving(false);
  }

  // Summary stats
  const required = items.filter(i => i.required && i.status !== 'na');
  const passed = required.filter(i => i.status === 'pass').length;
  const failed = required.filter(i => i.status === 'fail').length;
  const pct = required.length > 0 ? Math.round((passed / required.length) * 100) : 0;

  if (loading) return <div style={s.loading}>Loading commissioning checklist…</div>;

  if (items.length === 0) return (
    <div style={s.emptyState}>
      <div style={s.emptyIcon}>⚙️</div>
      <div style={s.emptyTitle}>Commissioning checklist not started</div>
      <p style={s.emptyDesc}>Seed the standard commissioning checklist items for this project. These are separate from the MIS 3005 compliance checklist.</p>
      {error && <div style={s.errorBanner}>{error}</div>}
      <button style={s.seedBtn} onClick={seed} disabled={seeding}>
        {seeding ? 'Creating…' : '+ Start Commissioning Checklist'}
      </button>
    </div>
  );

  return (
    <div style={s.container}>
      {/* Summary */}
      <div style={s.summary}>
        <div style={s.summaryStats}>
          <div style={s.stat}>
            <span style={{ ...s.statNum, color: '#16a34a' }}>{passed}</span>
            <span style={s.statLabel}>Pass</span>
          </div>
          <div style={s.stat}>
            <span style={{ ...s.statNum, color: '#dc2626' }}>{failed}</span>
            <span style={s.statLabel}>Fail</span>
          </div>
          <div style={s.stat}>
            <span style={{ ...s.statNum, color: '#aaa' }}>{required.length - passed - failed}</span>
            <span style={s.statLabel}>Pending</span>
          </div>
          <div style={s.stat}>
            <span style={{ ...s.statNum, color: pct === 100 ? '#16a34a' : '#7A8465' }}>{pct}%</span>
            <span style={s.statLabel}>Complete</span>
          </div>
        </div>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${pct}%`, background: failed > 0 ? '#dc2626' : pct === 100 ? '#16a34a' : '#7A8465' }} />
        </div>
      </div>

      {/* Sections */}
      {Object.entries(grouped).sort().map(([section, sItems]) => (
        <div key={section} style={s.section}>
          <div style={s.sectionHeader}>Section {section}</div>
          {sItems.map(item => {
            const cfg = STATUS_CFG[item.status];
            return (
              <div
                key={item.id}
                style={{ ...s.item, borderLeftColor: cfg.colour }}
                onClick={() => { setSelected(item); setForm({ status: item.status, measuredValue: item.measuredValue || '', notes: item.notes || '' }); }}
              >
                <div style={{ ...s.statusDot, background: cfg.bg }}>
                  <span style={{ color: cfg.colour, fontWeight: 700, fontSize: 13 }}>{cfg.icon}</span>
                </div>
                <div style={s.itemContent}>
                  <div style={s.itemName}>{item.name}</div>
                  {item.ref && <div style={s.itemRef}>{item.ref}</div>}
                  {item.measuredValue && (
                    <div style={s.itemMeasured}>
                      Measured: <strong style={{ fontFamily: 'monospace' }}>{item.measuredValue}</strong>
                      {item.expectedValue && <span style={s.expected}> (expected: {item.expectedValue})</span>}
                    </div>
                  )}
                  {item.notes && <div style={s.itemNotes}>{item.notes}</div>}
                </div>
                <span style={s.chevron}>›</span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Item edit modal */}
      {selected && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{selected.name}</h3>
              {selected.ref && <div style={s.modalRef}>{selected.ref}</div>}
              <button style={s.modalClose} onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.guidance && (
              <div style={s.guidance}><strong>Guidance:</strong> {selected.guidance}</div>
            )}

            {selected.expectedValue && (
              <div style={s.expectedBlock}>Expected: <code>{selected.expectedValue}</code></div>
            )}

            <div style={s.field}>
              <label style={s.label}>Measured Value</label>
              <input
                style={s.input}
                value={form.measuredValue}
                onChange={e => setForm(f => ({ ...f, measuredValue: e.target.value }))}
                placeholder={selected.expectedValue ? `Expected: ${selected.expectedValue}` : 'Enter measured value…'}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Notes</label>
              <textarea
                style={{ ...s.input, height: 60, resize: 'vertical' }}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes…"
              />
            </div>

            <div style={s.statusBtns}>
              {(['pass', 'fail', 'na', 'pending'] as const).map(st => (
                <button
                  key={st}
                  style={{
                    ...s.statusBtn,
                    background: form.status === st ? STATUS_CFG[st].bg : '#fff',
                    borderColor: form.status === st ? STATUS_CFG[st].colour : '#e0e0d8',
                    color: form.status === st ? STATUS_CFG[st].colour : '#666',
                    fontWeight: form.status === st ? 700 : 400,
                  }}
                  onClick={() => setForm(f => ({ ...f, status: st }))}
                >
                  {STATUS_CFG[st].icon} {STATUS_CFG[st].label}
                </button>
              ))}
            </div>

            {error && <div style={s.errorBanner}>{error}</div>}

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setSelected(null)}>Cancel</button>
              <button style={s.saveBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'Satoshi, sans-serif' },
  loading: { padding: 24, color: '#888', fontSize: 13 },
  emptyState: { textAlign: 'center', padding: '40px 24px', background: '#fff', borderRadius: 8, border: '1px solid #e8e8e4' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.6 },
  seedBtn: { fontSize: 13, padding: '9px 20px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 },
  summary: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '14px 18px', marginBottom: 16 },
  summaryStats: { display: 'flex', gap: 24, marginBottom: 10 },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' },
  progressBar: { height: 5, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.4s' },
  section: { marginBottom: 16 },
  sectionHeader: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, padding: '0 4px' },
  item: { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: '1px solid #e8e8e4', borderLeft: '3px solid', borderRadius: 8, padding: '11px 13px', marginBottom: 6, cursor: 'pointer' },
  statusDot: { width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 13, color: '#333', fontWeight: 500 },
  itemRef: { fontSize: 10, color: '#aaa', marginTop: 2 },
  itemMeasured: { fontSize: 11, color: '#555', marginTop: 4 },
  expected: { color: '#aaa' },
  itemNotes: { fontSize: 11, color: '#888', marginTop: 3 },
  chevron: { fontSize: 18, color: '#ddd', alignSelf: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { marginBottom: 14, position: 'relative' },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#333', margin: '0 32px 4px 0' },
  modalRef: { fontSize: 11, color: '#aaa' },
  modalClose: { position: 'absolute', top: 0, right: 0, background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer' },
  guidance: { fontSize: 12, color: '#555', background: '#f0f1ec', borderRadius: 6, padding: '10px 12px', marginBottom: 14, lineHeight: 1.5 },
  expectedBlock: { fontSize: 12, color: '#555', marginBottom: 14 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  input: { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', boxSizing: 'border-box' },
  statusBtns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 },
  statusBtn: { padding: '10px', border: '1.5px solid', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  modalFooter: { display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #f0f0ec', paddingTop: 14 },
  saveBtn: { fontSize: 13, padding: '7px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { fontSize: 13, padding: '7px 14px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
};
