// ============================================================
// RISO HUB — components/PhotoGallery.tsx
// Grid viewer for project photos with lightbox
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface ProjectFile {
  id: number;
  fileUrl: string;
  category: string;
  uploadedAt: string;
  uploader?: { name: string };
}

const IMAGE_CATEGORIES = ['photo', 'checklist_evidence', 'commissioning_photo', 'site_photo'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function isImage(url: string): boolean {
  const lower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.includes(ext));
}

export default function PhotoGallery({ projectId }: { projectId: number }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<ProjectFile | null>(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/api/files/${projectId}`);
      setFiles(res.data.filter((f: ProjectFile) => isImage(f.fileUrl)));
    } catch { }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const categories = ['all', ...Array.from(new Set(files.map(f => f.category)))];
  const visible = filter === 'all' ? files : files.filter(f => f.category === filter);

  if (loading) return <div style={g.loading}>Loading photos…</div>;

  if (files.length === 0) return (
    <div style={g.empty}>
      <div style={g.emptyIcon}>📷</div>
      <div style={g.emptyText}>No photos uploaded to this project yet</div>
    </div>
  );

  return (
    <div style={g.container}>
      {/* Filter chips */}
      <div style={g.filterRow}>
        {categories.map(c => (
          <button
            key={c}
            style={{ ...g.chip, ...(filter === c ? g.chipActive : {}) }}
            onClick={() => setFilter(c)}
          >
            {c === 'all' ? `All (${files.length})` : `${c.replace(/_/g, ' ')} (${files.filter(f => f.category === c).length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={g.grid}>
        {visible.map(f => (
          <div key={f.id} style={g.thumb} onClick={() => setLightbox(f)}>
            <img src={f.fileUrl} alt={f.category} style={g.thumbImg} loading="lazy" />
            <div style={g.thumbOverlay}>
              <div style={g.thumbCategory}>{f.category.replace(/_/g, ' ')}</div>
              <div style={g.thumbDate}>{new Date(f.uploadedAt).toLocaleDateString('en-GB')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={g.lightboxOverlay} onClick={() => setLightbox(null)}>
          <div style={g.lightboxContent} onClick={e => e.stopPropagation()}>
            <img src={lightbox.fileUrl} alt="" style={g.lightboxImg} />
            <div style={g.lightboxMeta}>
              <div style={g.lightboxCategory}>{lightbox.category.replace(/_/g, ' ')}</div>
              <div style={g.lightboxDate}>
                {new Date(lightbox.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {lightbox.uploader ? ` · ${lightbox.uploader.name}` : ''}
              </div>
              <div style={g.lightboxActions}>
                <a href={lightbox.fileUrl} target="_blank" rel="noreferrer" style={g.downloadLink}>↓ Download</a>
                <button style={g.closeBtn} onClick={() => setLightbox(null)}>✕ Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const g: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'Satoshi, sans-serif' },
  filterRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  chip: { fontSize: 11, padding: '4px 12px', border: '1px solid #e0e0d8', borderRadius: 14, background: '#fff', color: '#666', cursor: 'pointer', fontWeight: 500 },
  chipActive: { background: '#7A8465', color: '#fff', borderColor: '#7A8465', fontWeight: 700 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 },
  thumb: { position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#f0f0ec' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.2s' },
  thumbOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', padding: '20px 8px 8px' },
  thumbCategory: { fontSize: 10, color: '#fff', fontWeight: 600, textTransform: 'capitalize' },
  thumbDate: { fontSize: 9, color: 'rgba(255,255,255,0.7)' },
  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 },
  lightboxContent: { background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
  lightboxImg: { maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' },
  lightboxMeta: { padding: '12px 16px', borderTop: '1px solid #f0f0ec' },
  lightboxCategory: { fontSize: 13, fontWeight: 600, color: '#333', textTransform: 'capitalize' },
  lightboxDate: { fontSize: 12, color: '#888', marginTop: 2 },
  lightboxActions: { display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end' },
  downloadLink: { fontSize: 13, color: '#7A8465', fontWeight: 600, textDecoration: 'none' },
  closeBtn: { fontSize: 13, color: '#555', background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' },
  loading: { padding: 24, color: '#888', fontSize: 13 },
  empty: { textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 13, color: '#bbb' },
};

// ============================================================
// components/CustomerCommsLogPanel.tsx
// Log and view customer communications for a project
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface CommsEntry {
  id: number;
  date: string;
  method: string;
  direction: 'inbound' | 'outbound';
  summary: string;
  logger?: { name: string };
}

const METHOD_ICONS: Record<string, string> = {
  phone: '📞', email: '📧', sms: '💬', site_visit: '🏠', letter: '✉️', portal: '💻', other: '📝',
};

export function CustomerCommsLogPanel({ projectId }: { projectId: number }) {
  const [entries, setEntries] = useState<CommsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], method: 'phone', direction: 'outbound', summary: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/api/customer-comms/${projectId}`);
      setEntries(res.data);
    } catch { }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function addEntry() {
    if (!form.summary.trim()) return setError('Summary is required');
    setSaving(true); setError('');
    try {
      await axios.post(`/api/customer-comms/${projectId}`, form);
      setShowForm(false);
      setForm({ date: new Date().toISOString().split('T')[0], method: 'phone', direction: 'outbound', summary: '' });
      load();
    } catch { setError('Failed to save'); }
    setSaving(false);
  }

  if (loading) return <div style={c.loading}>Loading communications log…</div>;

  return (
    <div style={c.panel}>
      <div style={c.header}>
        <div>
          <h3 style={c.title}>Customer Communications</h3>
          <p style={c.desc}>Log all calls, emails, site visits and correspondence</p>
        </div>
        <button style={c.addBtn} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Log Communication'}
        </button>
      </div>

      {error && <div style={c.errorBanner}>{error}</div>}

      {showForm && (
        <div style={c.form}>
          <div style={c.formRow}>
            <div style={c.field}>
              <label style={c.label}>Date</label>
              <input type="date" style={c.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={c.field}>
              <label style={c.label}>Method</label>
              <select style={c.input} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                {Object.keys(METHOD_ICONS).map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div style={c.field}>
              <label style={c.label}>Direction</label>
              <select style={c.input} value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as any }))}>
                <option value="outbound">Outbound (we contacted customer)</option>
                <option value="inbound">Inbound (customer contacted us)</option>
              </select>
            </div>
          </div>
          <div style={c.field}>
            <label style={c.label}>Summary</label>
            <textarea
              style={{ ...c.input, height: 70, resize: 'vertical' }}
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief description of the communication…"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={c.saveBtn} onClick={addEntry} disabled={saving}>{saving ? 'Saving…' : 'Log'}</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <div style={c.empty}>No communications logged yet</div>
      )}

      <div style={c.timeline}>
        {entries.map(e => (
          <div key={e.id} style={c.entry}>
            <div style={c.entryIcon}>{METHOD_ICONS[e.method] || '📝'}</div>
            <div style={c.entryContent}>
              <div style={c.entryHeader}>
                <span style={{ ...c.directionTag, background: e.direction === 'inbound' ? '#eff6ff' : '#f0fdf4', color: e.direction === 'inbound' ? '#2563eb' : '#16a34a' }}>
                  {e.direction}
                </span>
                <span style={c.entryMethod}>{e.method.replace(/_/g, ' ')}</span>
                <span style={c.entryDate}>{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <p style={c.entrySummary}>{e.summary}</p>
              {e.logger && <div style={c.entryLogger}>Logged by {e.logger.name}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const c: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  desc: { fontSize: 12, color: '#888', margin: '3px 0 0' },
  addBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  form: { background: '#fafaf8', border: '1px solid #e8e8e4', borderRadius: 8, padding: 16, marginBottom: 16 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' },
  saveBtn: { fontSize: 12, padding: '7px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 12 },
  entry: { display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f5f0' },
  entryIcon: { fontSize: 20, flexShrink: 0, marginTop: 2 },
  entryContent: { flex: 1 },
  entryHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  directionTag: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'capitalize' },
  entryMethod: { fontSize: 11, color: '#888', textTransform: 'capitalize' },
  entryDate: { fontSize: 11, color: '#bbb', marginLeft: 'auto' },
  entrySummary: { fontSize: 13, color: '#333', margin: 0, lineHeight: 1.5 },
  entryLogger: { fontSize: 11, color: '#bbb', marginTop: 4 },
  empty: { fontSize: 13, color: '#bbb', padding: '16px 0', textAlign: 'center' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
};

// ============================================================
// components/ComplianceFlagsPanel.tsx
// Part P notification + RECC cancellation notice tracking
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface Project {
  id: number;
  partPNotified: boolean;
  partPRef?: string;
  partPDate?: string;
  reccCancellationSent: boolean;
  reccCancellationDate?: string;
  reccCancellationMethod?: string;
}

export function ComplianceFlagsPanel({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Project>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`/api/projects/${projectId}`);
      setProject(res.data);
      setForm(res.data);
    } catch { }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      await axios.patch(`/api/projects/${projectId}`, {
        partPNotified: form.partPNotified,
        partPRef: form.partPRef,
        partPDate: form.partPDate,
        reccCancellationSent: form.reccCancellationSent,
        reccCancellationDate: form.reccCancellationDate,
        reccCancellationMethod: form.reccCancellationMethod,
      });
      setEditing(false);
      setSuccess('Compliance flags saved');
      load();
    } catch { }
    setSaving(false);
  }

  if (!project) return null;

  return (
    <div style={fl.panel}>
      <div style={fl.header}>
        <h3 style={fl.title}>Regulatory Compliance</h3>
        {!editing
          ? <button style={fl.editBtn} onClick={() => setEditing(true)}>Edit</button>
          : <div style={{ display: 'flex', gap: 8 }}>
              <button style={fl.cancelBtn} onClick={() => { setEditing(false); setForm(project); }}>Cancel</button>
              <button style={fl.saveBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
        }
      </div>

      {success && <div style={fl.successBanner}>{success}</div>}

      <div style={fl.grid}>
        {/* Part P */}
        <div style={fl.flagCard}>
          <div style={fl.flagHeader}>
            <span style={{ ...fl.flagBadge, background: project.partPNotified ? '#f0fdf4' : '#fef9f0', color: project.partPNotified ? '#16a34a' : '#ca8a04', borderColor: project.partPNotified ? '#bbf7d0' : '#fde68a' }}>
              {project.partPNotified ? '✓ Notified' : '○ Pending'}
            </span>
            <span style={fl.flagTitle}>Part P Notification</span>
          </div>
          <p style={fl.flagDesc}>Building regulations notification for electrical work. Required for heat pump electrical installation.</p>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={fl.checkRow}>
                <input type="checkbox" checked={!!form.partPNotified} onChange={e => setForm(f => ({ ...f, partPNotified: e.target.checked }))} />
                <span style={fl.checkLabel}>Part P notification submitted to local authority</span>
              </label>
              <input style={fl.input} placeholder="Reference number" value={form.partPRef || ''} onChange={e => setForm(f => ({ ...f, partPRef: e.target.value }))} />
              <input type="date" style={fl.input} value={form.partPDate || ''} onChange={e => setForm(f => ({ ...f, partPDate: e.target.value }))} />
            </div>
          ) : (
            project.partPNotified && (
              <div style={fl.flagDetails}>
                {project.partPRef && <span>Ref: <strong>{project.partPRef}</strong></span>}
                {project.partPDate && <span>Date: {new Date(project.partPDate).toLocaleDateString('en-GB')}</span>}
              </div>
            )
          )}
        </div>

        {/* RECC cancellation */}
        <div style={fl.flagCard}>
          <div style={fl.flagHeader}>
            <span style={{ ...fl.flagBadge, background: project.reccCancellationSent ? '#f0fdf4' : '#fef9f0', color: project.reccCancellationSent ? '#16a34a' : '#ca8a04', borderColor: project.reccCancellationSent ? '#bbf7d0' : '#fde68a' }}>
              {project.reccCancellationSent ? '✓ Sent' : '○ Pending'}
            </span>
            <span style={fl.flagTitle}>RECC 14-Day Notice</span>
          </div>
          <p style={fl.flagDesc}>Consumer cancellation rights notice required by RECC. Must be provided at point of contract signing.</p>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={fl.checkRow}>
                <input type="checkbox" checked={!!form.reccCancellationSent} onChange={e => setForm(f => ({ ...f, reccCancellationSent: e.target.checked }))} />
                <span style={fl.checkLabel}>14-day cancellation notice provided to customer</span>
              </label>
              <input type="date" style={fl.input} value={form.reccCancellationDate || ''} onChange={e => setForm(f => ({ ...f, reccCancellationDate: e.target.value }))} />
              <select style={fl.input} value={form.reccCancellationMethod || ''} onChange={e => setForm(f => ({ ...f, reccCancellationMethod: e.target.value }))}>
                <option value="">Method of delivery…</option>
                <option value="signed_document">Signed document</option>
                <option value="email">Email</option>
                <option value="post">Post</option>
                <option value="handed_in_person">Handed in person</option>
              </select>
            </div>
          ) : (
            project.reccCancellationSent && (
              <div style={fl.flagDetails}>
                {project.reccCancellationDate && <span>Date: {new Date(project.reccCancellationDate).toLocaleDateString('en-GB')}</span>}
                {project.reccCancellationMethod && <span>Via: {project.reccCancellationMethod.replace(/_/g, ' ')}</span>}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const fl: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  editBtn: { fontSize: 12, padding: '5px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  saveBtn: { fontSize: 12, padding: '5px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancelBtn: { fontSize: 12, padding: '5px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  flagCard: { background: '#fafaf8', border: '1px solid #e8e8e4', borderRadius: 8, padding: 14 },
  flagHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  flagBadge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, border: '1px solid' },
  flagTitle: { fontSize: 13, fontWeight: 600, color: '#333' },
  flagDesc: { fontSize: 12, color: '#888', margin: '0 0 10px', lineHeight: 1.5 },
  flagDetails: { display: 'flex', gap: 16, fontSize: 12, color: '#555' },
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' },
  checkLabel: { fontSize: 13, color: '#333' },
  input: { fontSize: 13, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12 },
};
