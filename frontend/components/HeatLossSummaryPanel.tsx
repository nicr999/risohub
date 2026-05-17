// ============================================================
// RISO HUB — HeatLossSummaryPanel.tsx
// Project panel for entering/editing heat loss data + file upload
// ============================================================

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface HeatLossSummary {
  id?: number;
  designFlowTemp?: number;
  heatDemandKW?: number;
  heatLossKW?: number;
  groundFloorArea?: number;
  fabricLossKW?: number;
  ventilationLossKW?: number;
  softwareUsed?: string;
  calculatedAt?: string;
  notes?: string;
  uploadedFile?: { id: number; fileUrl: string };
  calculator?: { name: string };
}

interface Props {
  projectId: number;
  readOnly?: boolean;
}

const SOFTWARE_OPTIONS = ['HeatEngineer', 'CoolCalc', 'BuildDesk', 'PHPP', 'SAP', 'Other'];

export default function HeatLossSummaryPanel({ projectId, readOnly = false }: Props) {
  const [summary, setSummary] = useState<HeatLossSummary | null>(null);
  const [form, setForm] = useState<HeatLossSummary>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileId, setUploadedFileId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSummary();
  }, [projectId]);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/heat-loss/${projectId}`);
      setSummary(res.data);
      setForm(res.data);
      setUploadedFileId(res.data.uploadedFileId || null);
    } catch (e: any) {
      if (e.response?.status !== 404) setError('Failed to load heat loss data');
      else setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Get presigned URL
      const presignRes = await axios.post('/api/files/presign', {
        fileName: file.name,
        fileType: file.type,
        projectId,
        category: 'heat_loss',
        stage: 'design',
      });

      // Upload to S3
      await axios.put(presignRes.data.url, file, { headers: { 'Content-Type': file.type } });

      // Register file in RISO HUB
      const fileRes = await axios.post('/api/files/upload', {
        projectId,
        fileUrl: presignRes.data.fileUrl,
        category: 'heat_loss',
        stage: 'design',
        fileName: file.name,
      });

      setUploadedFileId(fileRes.data.id);
      setSuccess('File uploaded');
    } catch {
      setError('File upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = { ...form, uploadedFileId };
      const method = summary ? 'patch' : 'post';
      const res = await axios[method](`/api/heat-loss/${projectId}`, payload);
      setSummary(res.data);
      setForm(res.data);
      setEditing(false);
      setSuccess('Heat loss summary saved');
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof HeatLossSummary, label: string, unit?: string, type: string = 'number') => (
    <div style={styles.field}>
      <label style={styles.label}>{label}{unit && <span style={styles.unit}>{unit}</span>}</label>
      {editing ? (
        <input
          type={type}
          style={styles.input}
          value={(form[key] as any) || ''}
          onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? parseFloat(e.target.value) || '' : e.target.value }))}
          step={type === 'number' ? '0.1' : undefined}
        />
      ) : (
        <div style={styles.value}>
          {summary?.[key] != null ? `${summary[key]}${unit ? ` ${unit}` : ''}` : <span style={styles.empty}>—</span>}
        </div>
      )}
    </div>
  );

  if (loading) return <div style={styles.loading}>Loading heat loss data…</div>;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Heat Loss Summary</h3>
          <p style={styles.desc}>Key figures from external heat loss calculation software</p>
        </div>
        {!readOnly && (
          <div style={styles.headerActions}>
            {editing ? (
              <>
                <button style={styles.cancelBtn} onClick={() => { setEditing(false); setForm(summary || {}); }}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </>
            ) : (
              <button style={styles.editBtn} onClick={() => setEditing(true)}>{summary ? 'Edit' : '+ Add'}</button>
            )}
          </div>
        )}
      </div>

      {(error || success) && (
        <div style={error ? styles.errorBanner : styles.successBanner}>{error || success}</div>
      )}

      <div style={styles.grid}>
        {field('heatDemandKW', 'Heat Demand', 'kW')}
        {field('heatLossKW', 'Total Heat Loss', 'kW')}
        {field('designFlowTemp', 'Design Flow Temp', '°C')}
        {field('groundFloorArea', 'Ground Floor Area', 'm²')}
        {field('fabricLossKW', 'Fabric Loss', 'kW')}
        {field('ventilationLossKW', 'Ventilation Loss', 'kW')}
      </div>

      <div style={styles.fieldRow}>
        <div style={styles.field}>
          <label style={styles.label}>Software Used</label>
          {editing ? (
            <select
              style={styles.input}
              value={form.softwareUsed || ''}
              onChange={e => setForm(f => ({ ...f, softwareUsed: e.target.value }))}
            >
              <option value="">Select…</option>
              {SOFTWARE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <div style={styles.value}>{summary?.softwareUsed || <span style={styles.empty}>—</span>}</div>
          )}
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Calculation Date</label>
          {editing ? (
            <input
              type="date"
              style={styles.input}
              value={form.calculatedAt ? form.calculatedAt.split('T')[0] : ''}
              onChange={e => setForm(f => ({ ...f, calculatedAt: e.target.value }))}
            />
          ) : (
            <div style={styles.value}>
              {summary?.calculatedAt
                ? new Date(summary.calculatedAt).toLocaleDateString('en-GB')
                : <span style={styles.empty}>—</span>}
            </div>
          )}
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Notes</label>
        {editing ? (
          <textarea
            style={{ ...styles.input, height: 64, resize: 'vertical' }}
            value={form.notes || ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        ) : (
          <div style={styles.value}>{summary?.notes || <span style={styles.empty}>—</span>}</div>
        )}
      </div>

      {/* File attachment */}
      <div style={styles.fileSection}>
        <label style={styles.label}>Calculation Output File</label>
        {summary?.uploadedFile ? (
          <div style={styles.fileChip}>
            <span>📄</span>
            <a href={summary.uploadedFile.fileUrl} target="_blank" rel="noreferrer" style={styles.fileLink}>
              View uploaded file
            </a>
            {editing && (
              <button style={styles.replaceBtn} onClick={() => document.getElementById('heatLossFile')?.click()}>
                Replace
              </button>
            )}
          </div>
        ) : editing ? (
          <div style={styles.uploadArea} onClick={() => document.getElementById('heatLossFile')?.click()}>
            {uploading ? 'Uploading…' : '+ Upload calculation file (PDF, XLSX, etc.)'}
          </div>
        ) : (
          <div style={styles.empty}>No file uploaded</div>
        )}
        <input id="heatLossFile" type="file" hidden onChange={handleFileUpload} accept=".pdf,.xlsx,.csv,.xml" />
        {uploadedFileId && !summary?.uploadedFile && (
          <div style={styles.uploadSuccess}>✓ File ready to save</div>
        )}
      </div>

      {summary?.calculator && (
        <div style={styles.meta}>Last updated by {summary.calculator.name}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  desc: { fontSize: 12, color: '#888', margin: '3px 0 0' },
  headerActions: { display: 'flex', gap: 8 },
  editBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  saveBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancelBtn: { fontSize: 12, padding: '6px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 24px', marginBottom: 16 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' },
  unit: { fontWeight: 400, color: '#999', marginLeft: 4 },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', width: '100%', boxSizing: 'border-box' },
  value: { fontSize: 14, color: '#333', fontWeight: 500, padding: '4px 0' },
  empty: { color: '#ccc', fontSize: 13 },
  fileSection: { marginTop: 16, padding: '12px 0', borderTop: '1px solid #f0f0ec' },
  fileChip: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  fileLink: { fontSize: 12, color: '#7A8465', textDecoration: 'none' },
  replaceBtn: { fontSize: 11, padding: '3px 9px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: '#fff' },
  uploadArea: { marginTop: 6, padding: '14px', border: '1.5px dashed #d0d0c8', borderRadius: 6, textAlign: 'center', fontSize: 12, color: '#999', cursor: 'pointer' },
  uploadSuccess: { fontSize: 11, color: '#22c55e', marginTop: 6 },
  meta: { fontSize: 11, color: '#bbb', marginTop: 12 },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
};
