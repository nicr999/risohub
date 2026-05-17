// ============================================================
// RISO HUB — SubcontractorDirectory.tsx
// Full subcontractor management: list, add, edit, qualifications
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────

interface Qualification {
  id: number;
  type: string;
  certNumber?: string;
  issuingBody?: string;
  issuedAt?: string;
  expiresAt?: string;
  neverExpires: boolean;
  fileUrl?: string;
}

interface Subcontractor {
  id: number;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  trades: string[];
  notes?: string;
  active: boolean;
  qualifications: Qualification[];
}

const TRADES = ['ASHP Install', 'GSHP Install', 'Plumbing', 'Electrical', 'Civil / Groundworks', 'Roofing', 'Commissioning', 'F-Gas', 'Other'];

const expiryStatus = (q: Qualification): 'valid' | 'expiring' | 'expired' | 'never' => {
  if (q.neverExpires) return 'never';
  if (!q.expiresAt) return 'valid';
  const exp = new Date(q.expiresAt);
  const now = new Date();
  const in60 = new Date(); in60.setDate(now.getDate() + 60);
  if (exp < now) return 'expired';
  if (exp <= in60) return 'expiring';
  return 'valid';
};

const EXPIRY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  valid: { bg: '#f0fdf4', color: '#16a34a', label: 'Valid' },
  expiring: { bg: '#fffbeb', color: '#d97706', label: 'Expiring' },
  expired: { bg: '#fef2f2', color: '#dc2626', label: 'Expired' },
  never: { bg: '#f0f1ec', color: '#7A8465', label: 'No expiry' },
};

// ── Main component ─────────────────────────────────────────────

export default function SubcontractorDirectory() {
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [selected, setSelected] = useState<Subcontractor | null>(null);
  const [tab, setTab] = useState<'details' | 'qualifications'>('details');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showQualForm, setShowQualForm] = useState(false);
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [form, setForm] = useState<Partial<Subcontractor>>({ trades: [] });
  const [qualForm, setQualForm] = useState<Partial<Qualification & { neverExpires: boolean }>>({ neverExpires: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/subcontractors');
      setSubs(res.data);
      if (selected) {
        const refreshed = res.data.find((s: Subcontractor) => s.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch { setError('Failed to load subcontractors'); }
    finally { setLoading(false); }
  }, [selected?.id]);

  useEffect(() => { load(); }, []);

  const filtered = subs.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.company?.toLowerCase().includes(search.toLowerCase());
    const matchTrade = !tradeFilter || s.trades.includes(tradeFilter);
    return matchSearch && matchTrade;
  });

  async function handleSaveSub() {
    if (!form.name?.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (form.id) {
        await axios.patch(`/api/subcontractors/${form.id}`, form);
      } else {
        await axios.post('/api/subcontractors', form);
      }
      setShowForm(false); setForm({ trades: [] }); load();
    } catch { setError('Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleSaveQual() {
    if (!qualForm.type?.trim()) { setError('Qualification type is required'); return; }
    setSaving(true); setError('');
    try {
      await axios.post(`/api/subcontractors/${selected!.id}/qualifications`, qualForm);
      setShowQualForm(false); setQualForm({ neverExpires: false }); load();
    } catch { setError('Failed to save qualification'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id: number) {
    if (!confirm('Deactivate this subcontractor?')) return;
    await axios.delete(`/api/subcontractors/${id}`);
    if (selected?.id === id) setSelected(null);
    load();
  }

  const toggleTrade = (trade: string) => {
    const trades = form.trades || [];
    setForm(f => ({ ...f, trades: trades.includes(trade) ? trades.filter(t => t !== trade) : [...trades, trade] }));
  };

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Subcontractors</h2>
          <p style={s.subtitle}>{subs.filter(s => s.active).length} active subcontractors</p>
        </div>
        <button style={s.addBtn} onClick={() => { setForm({ trades: [] }); setShowForm(true); }}>+ Add Subcontractor</button>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      <div style={s.layout}>
        {/* ── List panel ── */}
        <div style={s.listPanel}>
          <div style={s.searchRow}>
            <input style={s.searchInput} placeholder="Search name or company…" value={search} onChange={e => setSearch(e.target.value)} />
            <select style={s.select} value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}>
              <option value="">All trades</option>
              {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading ? <div style={s.loading}>Loading…</div> : (
            <div style={s.list}>
              {filtered.length === 0 && <div style={s.empty}>No subcontractors found</div>}
              {filtered.map(sub => {
                const expiredCount = sub.qualifications.filter(q => expiryStatus(q) === 'expired').length;
                const expiringCount = sub.qualifications.filter(q => expiryStatus(q) === 'expiring').length;
                return (
                  <div
                    key={sub.id}
                    style={{ ...s.listItem, ...(selected?.id === sub.id ? s.listItemActive : {}) }}
                    onClick={() => { setSelected(sub); setTab('details'); }}
                  >
                    <div style={s.listItemTop}>
                      <span style={s.subName}>{sub.name}</span>
                      {!sub.active && <span style={s.inactiveBadge}>Inactive</span>}
                    </div>
                    {sub.company && <div style={s.subCompany}>{sub.company}</div>}
                    <div style={s.tradeChips}>
                      {sub.trades.slice(0, 3).map(t => <span key={t} style={s.tradeChip}>{t}</span>)}
                      {sub.trades.length > 3 && <span style={s.tradeChip}>+{sub.trades.length - 3}</span>}
                    </div>
                    {(expiredCount > 0 || expiringCount > 0) && (
                      <div style={s.qualWarning}>
                        {expiredCount > 0 && <span style={{ color: '#dc2626' }}>⚠ {expiredCount} expired</span>}
                        {expiringCount > 0 && <span style={{ color: '#d97706' }}> · {expiringCount} expiring</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected ? (
          <div style={s.detail}>
            <div style={s.detailHeader}>
              <div>
                <h3 style={s.detailName}>{selected.name}</h3>
                {selected.company && <div style={s.detailCompany}>{selected.company}</div>}
              </div>
              <div style={s.detailActions}>
                <button style={s.editBtn} onClick={() => { setForm(selected); setShowForm(true); }}>Edit</button>
                {selected.active && <button style={s.deactivateBtn} onClick={() => handleDeactivate(selected.id)}>Deactivate</button>}
              </div>
            </div>

            <div style={s.tabs}>
              {(['details', 'qualifications'] as const).map(t => (
                <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  {t === 'qualifications' && ` (${selected.qualifications.length})`}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div style={s.detailBody}>
                <InfoRow label="Email" value={selected.email} />
                <InfoRow label="Phone" value={selected.phone} />
                <InfoRow label="Trades" value={selected.trades.join(', ') || '—'} />
                <InfoRow label="Status" value={selected.active ? 'Active' : 'Inactive'} />
                {selected.notes && <InfoRow label="Notes" value={selected.notes} />}
              </div>
            )}

            {tab === 'qualifications' && (
              <div style={s.qualPanel}>
                <button style={s.addQualBtn} onClick={() => { setQualForm({ neverExpires: false }); setShowQualForm(true); }}>
                  + Add Qualification
                </button>
                {selected.qualifications.length === 0 && <div style={s.empty}>No qualifications on record</div>}
                {selected.qualifications.map(q => {
                  const status = expiryStatus(q);
                  const es = EXPIRY_STYLE[status];
                  return (
                    <div key={q.id} style={s.qualRow}>
                      <div style={s.qualMain}>
                        <span style={s.qualType}>{q.type}</span>
                        <span style={{ ...s.qualBadge, background: es.bg, color: es.color }}>{es.label}</span>
                      </div>
                      <div style={s.qualMeta}>
                        {q.certNumber && <span>Cert: {q.certNumber}</span>}
                        {q.issuingBody && <span> · {q.issuingBody}</span>}
                        {q.expiresAt && <span> · Expires {new Date(q.expiresAt).toLocaleDateString('en-GB')}</span>}
                        {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noreferrer" style={s.qualLink}> · View</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={s.noSelection}>
            <div style={s.noSelectionIcon}>👷</div>
            <div>Select a subcontractor to view details</div>
          </div>
        )}
      </div>

      {/* ── Subcontractor form modal ── */}
      {showForm && (
        <ModalWrap onClose={() => setShowForm(false)}>
          <h3 style={s.modalTitle}>{form.id ? 'Edit Subcontractor' : 'Add Subcontractor'}</h3>
          <div style={s.formGrid}>
            <FormField label="Full Name *">
              <input style={s.input} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Company">
              <input style={s.input} value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </FormField>
            <FormField label="Email">
              <input style={s.input} type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </FormField>
            <FormField label="Phone">
              <input style={s.input} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Trades">
            <div style={s.tradeSelect}>
              {TRADES.map(t => (
                <label key={t} style={s.tradeOption}>
                  <input type="checkbox" checked={(form.trades || []).includes(t)} onChange={() => toggleTrade(t)} style={{ marginRight: 5 }} />
                  {t}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Notes">
            <textarea style={{ ...s.input, height: 60, resize: 'vertical', marginTop: 4 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
          <div style={s.modalActions}>
            <button style={s.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
            <button style={s.saveBtn} onClick={handleSaveSub} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </ModalWrap>
      )}

      {/* ── Qualification form modal ── */}
      {showQualForm && (
        <ModalWrap onClose={() => setShowQualForm(false)}>
          <h3 style={s.modalTitle}>Add Qualification</h3>
          <div style={s.formGrid}>
            <FormField label="Qualification Type *">
              <input style={s.input} value={qualForm.type || ''} onChange={e => setQualForm(f => ({ ...f, type: e.target.value }))} placeholder="e.g. MCS, F-Gas 2079" />
            </FormField>
            <FormField label="Certificate Number">
              <input style={s.input} value={qualForm.certNumber || ''} onChange={e => setQualForm(f => ({ ...f, certNumber: e.target.value }))} />
            </FormField>
            <FormField label="Issuing Body">
              <input style={s.input} value={qualForm.issuingBody || ''} onChange={e => setQualForm(f => ({ ...f, issuingBody: e.target.value }))} />
            </FormField>
            <FormField label="Issue Date">
              <input style={s.input} type="date" value={qualForm.issuedAt || ''} onChange={e => setQualForm(f => ({ ...f, issuedAt: e.target.value }))} />
            </FormField>
            {!qualForm.neverExpires && (
              <FormField label="Expiry Date">
                <input style={s.input} type="date" value={qualForm.expiresAt || ''} onChange={e => setQualForm(f => ({ ...f, expiresAt: e.target.value }))} />
              </FormField>
            )}
          </div>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={qualForm.neverExpires} onChange={e => setQualForm(f => ({ ...f, neverExpires: e.target.checked }))} style={{ marginRight: 6 }} />
            No expiry date
          </label>
          <div style={s.modalActions}>
            <button style={s.cancelBtn} onClick={() => setShowQualForm(false)}>Cancel</button>
            <button style={s.saveBtn} onClick={handleSaveQual} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f5f0' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#888', width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#333' }}>{value || '—'}</span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  );
}

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, padding: '24px 28px', width: 500, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'Satoshi, sans-serif', background: '#F5F5F2', minHeight: '100vh', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '3px 0 0' },
  addBtn: { fontSize: 12, padding: '7px 16px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  layout: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' },
  listPanel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, overflow: 'hidden' },
  searchRow: { display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #f0f0ec' },
  searchInput: { flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' },
  select: { fontSize: 12, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 },
  list: { maxHeight: 600, overflowY: 'auto' },
  listItem: { padding: '12px 16px', borderBottom: '1px solid #f5f5f0', cursor: 'pointer' },
  listItemActive: { background: '#f0f1ec' },
  listItemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  subName: { fontSize: 13, fontWeight: 600, color: '#333' },
  subCompany: { fontSize: 11, color: '#888', marginTop: 2 },
  inactiveBadge: { fontSize: 10, color: '#999', border: '1px solid #ddd', borderRadius: 10, padding: '1px 7px' },
  tradeChips: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tradeChip: { fontSize: 10, background: '#f0f1ec', color: '#7A8465', borderRadius: 4, padding: '2px 6px' },
  qualWarning: { fontSize: 11, marginTop: 5 },
  detail: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, overflow: 'hidden' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid #f0f0ec' },
  detailName: { fontSize: 17, fontWeight: 700, color: '#333', margin: 0 },
  detailCompany: { fontSize: 13, color: '#888', marginTop: 3 },
  detailActions: { display: 'flex', gap: 8 },
  editBtn: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: '#fff' },
  deactivateBtn: { fontSize: 12, padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', background: '#fef2f2', color: '#dc2626' },
  tabs: { display: 'flex', borderBottom: '1px solid #f0f0ec', padding: '0 20px' },
  tab: { fontSize: 13, padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent' },
  tabActive: { color: '#7A8465', borderBottomColor: '#7A8465', fontWeight: 600 },
  detailBody: { padding: '0 20px 16px' },
  qualPanel: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 },
  addQualBtn: { fontSize: 12, padding: '6px 14px', background: '#f0f1ec', color: '#7A8465', border: '1px solid #d0d4c8', borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start' },
  qualRow: { padding: '10px 0', borderBottom: '1px solid #f5f5f0' },
  qualMain: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  qualType: { fontSize: 13, fontWeight: 600, color: '#333' },
  qualBadge: { fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600 },
  qualMeta: { fontSize: 11, color: '#888' },
  qualLink: { color: '#7A8465', textDecoration: 'none' },
  noSelection: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', color: '#bbb', fontSize: 13, gap: 10 },
  noSelectionIcon: { fontSize: 32 },
  loading: { padding: 24, textAlign: 'center', color: '#999', fontSize: 13 },
  empty: { padding: '20px 0', textAlign: 'center', color: '#bbb', fontSize: 13 },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#333', margin: '0 0 16px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', width: '100%', boxSizing: 'border-box' },
  tradeSelect: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' },
  tradeOption: { fontSize: 12, display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#444' },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#555', cursor: 'pointer', marginBottom: 12 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  saveBtn: { fontSize: 12, padding: '7px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancelBtn: { fontSize: 12, padding: '7px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
};
