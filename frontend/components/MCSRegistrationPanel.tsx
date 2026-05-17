// ============================================================
// RISO HUB — MCSRegistrationPanel.tsx
// Enter and manage the MCS certificate number for a project.
// Also handles submission to the MCS API via POST /api/mcs/:id/submit
// ============================================================

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface MCSRegistration {
  id?: number;
  mcsNumber: string;
  registeredAt?: string;
  certificateUrl?: string;
  notes?: string;
  submittedToMCS?: boolean;
  submittedAt?: string;
  registrar?: { name: string };
}

interface MCSSubmitForm {
  installerMcsNumber:          string;
  manufacturerName:            string;
  modelName:                   string;
  serialNumber:                string;
  systemCapacityKW:            string;
  commissioningDate:           string;
  isReplacement:               boolean;
  customerConsentObtained:     boolean;
  epcLodgementRef:             string;
  heatLossCalculationSoftware: string;
  designHeatDemandKW:          string;
  scop:                        string;
}

interface Props {
  projectId: number;
  readOnly?: boolean;
}

const EMPTY_SUBMIT_FORM: MCSSubmitForm = {
  installerMcsNumber: '', manufacturerName: '', modelName: '', serialNumber: '',
  systemCapacityKW: '', commissioningDate: '', isReplacement: true,
  customerConsentObtained: true, epcLodgementRef: '', heatLossCalculationSoftware: '',
  designHeatDemandKW: '', scop: '',
};

export default function MCSRegistrationPanel({ projectId, readOnly = false }: Props) {
  const [reg, setReg] = useState<MCSRegistration | null>(null);
  const [form, setForm] = useState<Partial<MCSRegistration>>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certFileUrl, setCertFileUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // MCS API submit state
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitForm, setSubmitForm]         = useState<MCSSubmitForm>(EMPTY_SUBMIT_FORM);
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState('');
  const [submitResult, setSubmitResult]     = useState<{ certificateNumber: string; message: string } | null>(null);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/mcs/${projectId}`);
      setReg(res.data);
      setForm(res.data);
      setCertFileUrl(res.data.certificateUrl || '');
    } catch (e: any) {
      if (e.response?.status !== 404) setError('Failed to load MCS registration');
    } finally {
      setLoading(false);
    }
  }

  async function handleCertUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const presign = await axios.post('/api/files/presign', {
        fileName: file.name, fileType: file.type, projectId, category: 'mcs_certificate', stage: 'audit',
      });
      await axios.put(presign.data.url, file, { headers: { 'Content-Type': file.type } });
      await axios.post('/api/files/upload', {
        projectId, fileUrl: presign.data.fileUrl, category: 'mcs_certificate', stage: 'audit', fileName: file.name,
      });
      setCertFileUrl(presign.data.fileUrl);
      setForm(f => ({ ...f, certificateUrl: presign.data.fileUrl }));
      setSuccess('Certificate uploaded');
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitToMCS() {
    const { installerMcsNumber, manufacturerName, modelName, systemCapacityKW, commissioningDate } = submitForm;
    if (!installerMcsNumber || !manufacturerName || !modelName || !systemCapacityKW || !commissioningDate) {
      setSubmitError('Installer MCS number, manufacturer, model, capacity and commissioning date are required.');
      return;
    }
    const capacityVal = parseFloat(systemCapacityKW);
    if (isNaN(capacityVal)) {
      setSubmitError('System capacity must be a valid number.');
      return;
    }
    setSubmitting(true); setSubmitError('');
    try {
      const token = localStorage.getItem('riso_access_token');

      // Pre-validate installer MCS number before committing
      try {
        const verify = await axios.get(
          `/api/mcs/verify-installer/${encodeURIComponent(installerMcsNumber)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!verify.data.active) {
          setSubmitError('Installer MCS number is not currently active. Please check and try again.');
          setSubmitting(false);
          return;
        }
      } catch (verifyErr: any) {
        if (verifyErr.response?.status === 404) {
          setSubmitError('Installer MCS number not found. Please verify it is correct.');
          setSubmitting(false);
          return;
        }
        // Verify endpoint unavailable — proceed with submission
      }

      const payload: Record<string, unknown> = {
        installerMcsNumber,
        manufacturerName,
        modelName,
        systemCapacityKW:  capacityVal,
        commissioningDate,
        isReplacement:     submitForm.isReplacement,
        customerConsentObtained: submitForm.customerConsentObtained,
      };
      if (submitForm.serialNumber)                payload.serialNumber                = submitForm.serialNumber;
      if (submitForm.epcLodgementRef)             payload.epcLodgementRef             = submitForm.epcLodgementRef;
      if (submitForm.heatLossCalculationSoftware) payload.heatLossCalculationSoftware = submitForm.heatLossCalculationSoftware;
      if (submitForm.designHeatDemandKW) {
        const v = parseFloat(submitForm.designHeatDemandKW);
        if (!isNaN(v)) payload.designHeatDemandKW = v;
      }
      if (submitForm.scop) {
        const v = parseFloat(submitForm.scop);
        if (!isNaN(v)) payload.scop = v;
      }

      const res = await axios.post(`/api/mcs/${projectId}/submit`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubmitResult(res.data);
      setShowSubmitForm(false);
      await load(); // refresh to show new cert number + submittedToMCS flag
    } catch (e: any) {
      const detail = e.response?.data?.mcsError ?? e.response?.data?.error ?? 'Submission failed';
      setSubmitError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave() {
    if (!form.mcsNumber?.trim()) { setError('MCS number is required'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = { ...form, certificateUrl: certFileUrl || form.certificateUrl };
      const method = reg ? 'patch' : 'post';
      const res = await axios[method](`/api/mcs/${projectId}`, payload);
      setReg(res.data); setForm(res.data); setEditing(false); setSuccess('MCS registration saved');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={s.loading}>Loading MCS registration…</div>;

  const isRegistered = !!reg?.mcsNumber;

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <h3 style={s.title}>MCS Registration</h3>
            <p style={s.desc}>Post-installation MCS certificate number</p>
          </div>
          {isRegistered && <span style={s.badge}>✓ Registered</span>}
        </div>
        {!readOnly && (
          <div style={s.actions}>
            {editing ? (
              <>
                <button style={s.cancel} onClick={() => { setEditing(false); setForm(reg || {}); }}>Cancel</button>
                <button style={s.save} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </>
            ) : (
              <button style={s.edit} onClick={() => setEditing(true)}>{reg ? 'Edit' : '+ Register'}</button>
            )}
          </div>
        )}
      </div>

      {(error || success) && (
        <div style={error ? s.errorBanner : s.successBanner}>{error || success}</div>
      )}

      {!reg && !editing && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🏷</div>
          <div style={s.emptyText}>No MCS number registered yet</div>
          <div style={s.emptyDesc}>Add the MCS certificate number once the installation has been registered with MCS.</div>
        </div>
      )}

      {(reg || editing) && (
        <div style={s.body}>
          <div style={s.fieldRow}>
            <div style={s.field}>
              <label style={s.label}>MCS Certificate Number <span style={s.required}>*</span></label>
              {editing ? (
                <input
                  style={s.input}
                  value={form.mcsNumber || ''}
                  onChange={e => setForm(f => ({ ...f, mcsNumber: e.target.value }))}
                  placeholder="e.g. MCS-ASHP-2026-XXXXX"
                />
              ) : (
                <div style={s.mcsNumber}>{reg?.mcsNumber}</div>
              )}
            </div>
            <div style={s.field}>
              <label style={s.label}>Registration Date</label>
              {editing ? (
                <input
                  type="date"
                  style={s.input}
                  value={form.registeredAt ? form.registeredAt.split('T')[0] : ''}
                  onChange={e => setForm(f => ({ ...f, registeredAt: e.target.value }))}
                />
              ) : (
                <div style={s.value}>
                  {reg?.registeredAt
                    ? new Date(reg.registeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : <span style={s.na}>—</span>}
                </div>
              )}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Notes</label>
            {editing ? (
              <textarea
                style={{ ...s.input, height: 60, resize: 'vertical' }}
                value={form.notes || ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes…"
              />
            ) : (
              <div style={s.value}>{reg?.notes || <span style={s.na}>—</span>}</div>
            )}
          </div>

          {/* Certificate file */}
          <div style={s.certSection}>
            <label style={s.label}>MCS Certificate Document</label>
            {(certFileUrl || reg?.certificateUrl) ? (
              <div style={s.fileChip}>
                <span>📄</span>
                <a href={certFileUrl || reg?.certificateUrl} target="_blank" rel="noreferrer" style={s.fileLink}>
                  View certificate
                </a>
                {editing && (
                  <button style={s.replaceBtn} onClick={() => document.getElementById('mcsCert')?.click()}>
                    {uploading ? 'Uploading…' : 'Replace'}
                  </button>
                )}
              </div>
            ) : editing ? (
              <div style={s.uploadArea} onClick={() => document.getElementById('mcsCert')?.click()}>
                {uploading ? 'Uploading…' : '+ Upload MCS certificate (PDF)'}
              </div>
            ) : (
              <div style={s.na}>No certificate uploaded</div>
            )}
            <input id="mcsCert" type="file" hidden onChange={handleCertUpload} accept=".pdf,.png,.jpg" />
          </div>

          {reg?.registrar && (
            <div style={s.meta}>Registered by {reg.registrar.name}</div>
          )}

          {/* MCS API submit section — shown only when not yet submitted */}
          {!readOnly && reg && !reg.submittedToMCS && !editing && (
            <div style={s.submitSection}>
              <div style={s.submitHeader}>
                <div>
                  <div style={s.submitTitle}>Submit to MCS API</div>
                  <div style={s.submitDesc}>Send installation details directly to MCS Certified and receive a certificate number.</div>
                </div>
                <button
                  style={showSubmitForm ? s.cancel : s.submitBtn}
                  onClick={() => { setShowSubmitForm(v => !v); setSubmitError(''); setSubmitResult(null); }}
                >
                  {showSubmitForm ? 'Cancel' : 'Submit to MCS →'}
                </button>
              </div>

              {submitResult && (
                <div style={s.submitSuccess}>
                  ✓ Submitted — Certificate: <strong>{submitResult.certificateNumber}</strong>
                </div>
              )}

              {showSubmitForm && (
                <div style={s.submitForm}>
                  {submitError && <div style={s.errorBanner}>{submitError}</div>}

                  <div style={s.fieldRow}>
                    <div style={s.field}>
                      <label style={s.label}>Installer MCS Number <span style={s.required}>*</span></label>
                      <input style={s.input} placeholder="e.g. NAP-12345"
                        value={submitForm.installerMcsNumber}
                        onChange={e => setSubmitForm(f => ({ ...f, installerMcsNumber: e.target.value }))} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Commissioning Date <span style={s.required}>*</span></label>
                      <input style={s.input} type="date"
                        value={submitForm.commissioningDate}
                        onChange={e => setSubmitForm(f => ({ ...f, commissioningDate: e.target.value }))} />
                    </div>
                  </div>

                  <div style={s.fieldRow}>
                    <div style={s.field}>
                      <label style={s.label}>Manufacturer <span style={s.required}>*</span></label>
                      <input style={s.input} placeholder="e.g. Mitsubishi Electric"
                        value={submitForm.manufacturerName}
                        onChange={e => setSubmitForm(f => ({ ...f, manufacturerName: e.target.value }))} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Model Name <span style={s.required}>*</span></label>
                      <input style={s.input} placeholder="e.g. Ecodan PUHZ-SW120VKA"
                        value={submitForm.modelName}
                        onChange={e => setSubmitForm(f => ({ ...f, modelName: e.target.value }))} />
                    </div>
                  </div>

                  <div style={s.fieldRow}>
                    <div style={s.field}>
                      <label style={s.label}>System Capacity (kW) <span style={s.required}>*</span></label>
                      <input style={s.input} type="number" step="0.1" placeholder="e.g. 12"
                        value={submitForm.systemCapacityKW}
                        onChange={e => setSubmitForm(f => ({ ...f, systemCapacityKW: e.target.value }))} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Serial Number</label>
                      <input style={s.input} placeholder="e.g. SN20240101"
                        value={submitForm.serialNumber}
                        onChange={e => setSubmitForm(f => ({ ...f, serialNumber: e.target.value }))} />
                    </div>
                  </div>

                  <div style={s.fieldRow}>
                    <div style={s.field}>
                      <label style={s.label}>Design Heat Demand (kW)</label>
                      <input style={s.input} type="number" step="0.1" placeholder="e.g. 9.5"
                        value={submitForm.designHeatDemandKW}
                        onChange={e => setSubmitForm(f => ({ ...f, designHeatDemandKW: e.target.value }))} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>SCOP</label>
                      <input style={s.input} type="number" step="0.01" placeholder="e.g. 3.2"
                        value={submitForm.scop}
                        onChange={e => setSubmitForm(f => ({ ...f, scop: e.target.value }))} />
                    </div>
                  </div>

                  <div style={s.fieldRow}>
                    <div style={s.field}>
                      <label style={s.label}>EPC Lodgement Ref</label>
                      <input style={s.input} placeholder="e.g. 0123-4567-8910-1112-1314"
                        value={submitForm.epcLodgementRef}
                        onChange={e => setSubmitForm(f => ({ ...f, epcLodgementRef: e.target.value }))} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Heat Loss Software</label>
                      <input style={s.input} placeholder="e.g. HeatLoss Pro"
                        value={submitForm.heatLossCalculationSoftware}
                        onChange={e => setSubmitForm(f => ({ ...f, heatLossCalculationSoftware: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={submitForm.isReplacement}
                        onChange={e => setSubmitForm(f => ({ ...f, isReplacement: e.target.checked }))} />
                      Replacement installation
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={submitForm.customerConsentObtained}
                        onChange={e => setSubmitForm(f => ({ ...f, customerConsentObtained: e.target.checked }))} />
                      Customer consent obtained
                    </label>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <button style={s.submitConfirmBtn} onClick={handleSubmitToMCS} disabled={submitting}>
                      {submitting ? 'Submitting to MCS…' : 'Confirm & Submit to MCS'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Already submitted badge */}
          {reg?.submittedToMCS && (
            <div style={s.submittedBadge}>
              ✓ Submitted to MCS
              {reg.submittedAt && (
                <span style={{ fontWeight: 400, marginLeft: 8 }}>
                  on {new Date(reg.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  desc: { fontSize: 12, color: '#888', margin: '3px 0 0' },
  badge: { fontSize: 11, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 12, padding: '3px 10px', fontWeight: 600 },
  actions: { display: 'flex', gap: 8 },
  edit: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  save: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancel: { fontSize: 12, padding: '6px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
  body: { display: 'flex', flexDirection: 'column', gap: 14 },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' },
  required: { color: '#ef4444' },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', width: '100%', boxSizing: 'border-box' },
  mcsNumber: { fontSize: 18, fontWeight: 700, color: '#7A8465', letterSpacing: '0.03em', padding: '4px 0' },
  value: { fontSize: 14, color: '#333', padding: '4px 0' },
  na: { color: '#ccc', fontSize: 13 },
  certSection: { paddingTop: 12, borderTop: '1px solid #f0f0ec', display: 'flex', flexDirection: 'column', gap: 6 },
  fileChip: { display: 'flex', alignItems: 'center', gap: 8 },
  fileLink: { fontSize: 12, color: '#7A8465', textDecoration: 'none' },
  replaceBtn: { fontSize: 11, padding: '3px 9px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: '#fff' },
  uploadArea: { padding: 14, border: '1.5px dashed #d0d0c8', borderRadius: 6, textAlign: 'center', fontSize: 12, color: '#999', cursor: 'pointer' },
  meta: { fontSize: 11, color: '#bbb', paddingTop: 4 },
  empty: { textAlign: 'center', padding: '24px 0' },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 4 },
  emptyDesc: { fontSize: 12, color: '#999', maxWidth: 360, margin: '0 auto' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
  // MCS submit section
  submitSection: { paddingTop: 16, marginTop: 8, borderTop: '1px solid #f0f0ec' },
  submitHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  submitTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 2 },
  submitDesc: { fontSize: 12, color: '#888' },
  submitBtn: { fontSize: 12, padding: '6px 14px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  submitConfirmBtn: { fontSize: 13, padding: '9px 20px', background: '#1B4F72', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  submitForm: { marginTop: 16, paddingTop: 16, borderTop: '1px dashed #e8e8e4', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  submitSuccess: { marginTop: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#16a34a' },
  submittedBadge: { marginTop: 14, padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#16a34a' },
};
