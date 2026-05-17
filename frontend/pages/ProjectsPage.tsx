// ============================================================
// RISO HUB — pages/ProjectsPage.tsx
// Full project list with filters, HubSpot prefill, and
// create project modal.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Project {
  id: number;
  customerName: string;
  address: string;
  postcode: string;
  status: string;
  projectType: 'ASHP' | 'GSHP';
  assignee?: { name: string };
  createdAt: string;
  hubspotContactId?: string;
}

interface HubSpotResult {
  id: string;
  properties: { firstname?: string; lastname?: string; email?: string; phone?: string };
}

const STATUSES = ['survey', 'design', 'install', 'commission', 'audit'];
const STATUS_COLOURS: Record<string, string> = {
  survey: '#7A8465', design: '#9DA889', install: '#B8C4A4', commission: '#6B7A5C', audit: '#4A5740',
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/projects');
      setProjects(res.data.projects ?? res.data);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.customerName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.postcode.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Projects</h1>
          <p style={s.subtitle}>{projects.length} total · {filtered.length} shown</p>
        </div>
        <button style={s.createBtn} onClick={() => setShowCreate(true)}>+ New Project</button>
      </div>

      {/* Filters */}
      <div style={s.filterRow}>
        <input
          style={s.searchInput}
          placeholder="Search by name, address or postcode…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={s.statusFilters}>
          {['all', ...STATUSES].map(f => (
            <button
              key={f}
              style={{
                ...s.filterChip,
                background: statusFilter === f ? (STATUS_COLOURS[f] || '#7A8465') : '#fff',
                color: statusFilter === f ? '#fff' : '#666',
                borderColor: statusFilter === f ? (STATUS_COLOURS[f] || '#7A8465') : '#e0e0d8',
              }}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={s.loading}>Loading projects…</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Address</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Stage</th>
                <th style={s.th}>Assignee</th>
                <th style={s.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={s.empty} data-testid="empty-state">No projects found</td></tr>
              )}
              {filtered.map(p => (
                <tr
                  key={p.id}
                  data-testid="project-row"
                  style={s.row}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td style={s.td}>
                    <div style={s.customerName}>{p.customerName}</div>
                    {p.hubspotContactId && <div style={s.hsTag}>HubSpot</div>}
                  </td>
                  <td style={s.td}>{p.address}, {p.postcode}</td>
                  <td style={s.td}>
                    <span style={s.typeBadge}>{p.projectType}</span>
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.statusPill, background: STATUS_COLOURS[p.status] || '#ccc' }}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                  </td>
                  <td style={s.td}>{p.assignee?.name || '—'}</td>
                  <td style={s.td}>{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { load(); navigate(`/projects/${id}`); }}
        />
      )}
    </div>
  );
}

// ── Create project modal ──────────────────────────────────────

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState({ customerName: '', address: '', postcode: '', projectType: 'ASHP', assignedTo: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // HubSpot search
  const [hsQuery, setHsQuery] = useState('');
  const [hsResults, setHsResults] = useState<any[]>([]);
  const [hsSearching, setHsSearching] = useState(false);
  const [hubspotContactId, setHubspotContactId] = useState('');

  useEffect(() => {
    axios.get('/api/users').then(r => setUsers(r.data.filter((u: any) => u.active)));
  }, []);

  async function searchHubSpot(q: string) {
    if (q.length < 2) { setHsResults([]); return; }
    setHsSearching(true);
    try {
      const res = await axios.get('/api/integrations/hubspot/contacts/search', { params: { q } });
      setHsResults(res.data.results || []);
    } catch { }
    setHsSearching(false);
  }

  async function prefillFromHubSpot(contactId: string) {
    try {
      const res = await axios.get(`/api/integrations/hubspot/contacts/${contactId}/prefill`);
      const d = res.data;
      setForm(f => ({
        ...f,
        customerName: d.customerName || f.customerName,
        address: d.address || f.address,
        postcode: d.postcode || f.postcode,
      }));
      setHubspotContactId(contactId);
      setHsResults([]);
      setHsQuery(d.customerName || '');
    } catch { }
  }

  async function handleCreate() {
    if (!form.customerName.trim() || !form.address.trim() || !form.postcode.trim()) {
      setError('Customer name, address and postcode are required');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await axios.post('/api/projects', {
        ...form,
        assignedTo: form.assignedTo || undefined,
        hubspotContactId: hubspotContactId || undefined,
      });
      onCreated(res.data.id);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  }

  const f = (key: string, label: string, type = 'text', opts?: { placeholder?: string }) => (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input
        style={s.input}
        type={type}
        placeholder={opts?.placeholder}
        value={(form as any)[key]}
        onChange={e => setForm(fm => ({ ...fm, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>New Project</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBanner}>{error}</div>}

        {/* HubSpot search */}
        <div style={s.field}>
          <label style={s.label}>Search HubSpot CRM</label>
          <input
            style={s.input}
            placeholder="Type customer name to search…"
            value={hsQuery}
            onChange={e => { setHsQuery(e.target.value); searchHubSpot(e.target.value); }}
          />
          {hsResults.length > 0 && (
            <div style={s.hsDropdown}>
              {hsResults.map((r: any) => (
                <div key={r.id} style={s.hsResult} onClick={() => prefillFromHubSpot(r.id)}>
                  <div style={s.hsName}>{r.properties.firstname} {r.properties.lastname}</div>
                  <div style={s.hsMeta}>{r.properties.email}</div>
                </div>
              ))}
            </div>
          )}
          {hubspotContactId && <div style={s.hsLinked}>✓ Linked to HubSpot contact</div>}
        </div>

        <div style={s.divider} />

        {f('customerName', 'Customer Name', 'text', { placeholder: 'Full name' })}
        {f('address', 'Installation Address', 'text', { placeholder: '12 Example Street, London' })}
        {f('postcode', 'Postcode', 'text', { placeholder: 'SW1A 1AA' })}

        <div style={s.field}>
          <label style={s.label}>System Type</label>
          <select style={s.input} value={form.projectType} onChange={e => setForm(fm => ({ ...fm, projectType: e.target.value }))}>
            <option value="ASHP">Air Source Heat Pump (ASHP)</option>
            <option value="GSHP">Ground Source Heat Pump (GSHP)</option>
          </select>
        </div>

        <div style={s.field}>
          <label style={s.label}>Assign To</label>
          <select style={s.input} value={form.assignedTo} onChange={e => setForm(fm => ({ ...fm, assignedTo: e.target.value }))}>
            <option value="">Unassigned</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, background: '#F5F5F2', minHeight: '100vh', fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 12, color: '#888', margin: '4px 0 0' },
  createBtn: { fontSize: 13, padding: '8px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  searchInput: { fontSize: 13, padding: '8px 12px', border: '1px solid #e0e0d8', borderRadius: 7, background: '#fff', width: 280, outline: 'none' },
  statusFilters: { display: 'flex', gap: 6 },
  filterChip: { fontSize: 11, padding: '5px 12px', border: '1px solid', borderRadius: 14, cursor: 'pointer', fontWeight: 600 },
  tableWrap: { background: '#fff', borderRadius: 8, border: '1px solid #e8e8e4', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#fafaf8' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #f0f0ec' },
  row: { cursor: 'pointer', borderBottom: '1px solid #f5f5f2', transition: 'background 0.1s' },
  td: { padding: '12px 14px', fontSize: 13, color: '#333', verticalAlign: 'middle' },
  customerName: { fontWeight: 600, color: '#333' },
  hsTag: { fontSize: 9, color: '#f59e0b', fontWeight: 700, marginTop: 2 },
  typeBadge: { fontSize: 10, background: '#f0f1ec', color: '#7A8465', padding: '2px 8px', borderRadius: 4, fontWeight: 700 },
  statusPill: { fontSize: 11, color: '#fff', padding: '3px 10px', borderRadius: 10, fontWeight: 700 },
  loading: { padding: 32, color: '#888', textAlign: 'center' },
  empty: { padding: 32, color: '#bbb', textAlign: 'center' },
  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 28 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer' },
  modalFooter: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0ec' },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, background: '#fafaf8', outline: 'none', boxSizing: 'border-box' },
  divider: { borderTop: '1px solid #f0f0ec', margin: '16px 0' },
  hsDropdown: { background: '#fff', border: '1px solid #e0e0d8', borderRadius: 7, marginTop: 4, overflow: 'hidden' },
  hsResult: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f0' },
  hsName: { fontSize: 13, fontWeight: 600, color: '#333' },
  hsMeta: { fontSize: 11, color: '#888' },
  hsLinked: { fontSize: 11, color: '#16a34a', marginTop: 4 },
  saveBtn: { fontSize: 13, padding: '8px 20px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { fontSize: 13, padding: '8px 16px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 16 },
};
