// ============================================================
// RISO HUB — components/DocumentTemplateEditor.tsx
// Admin settings panel for editing PDF document templates.
// Changes take effect on next document generation — no redeploy.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const DOC_TYPES = [
  { id: 'handover', label: 'Handover Certificate' },
  { id: 'commissioning', label: 'Commissioning Record' },
  { id: 'final_pack', label: 'Final Installation Pack' },
  { id: 'job_sheet', label: 'Installer Job Sheet' },
  { id: 'recc_notice', label: 'RECC Cancellation Notice' },
];

interface TemplateSection { id: string; label: string; enabled: boolean; customText?: string; order: number; }
interface Template {
  docType: string;
  coverTagline?: string;
  coverBgColour?: string;
  coverShowLogo: boolean;
  sections: TemplateSection[];
  footerCompanyName?: string;
  footerAddress?: string;
  footerPhone?: string;
  footerEmail?: string;
  footerMcsNumber?: string;
  footerReccNumber?: string;
  footerCustomText?: string;
  includeHeatLoss: boolean;
  includeEpc: boolean;
  includeMcsRegistration: boolean;
  includeRecommendations: boolean;
  includePhotos: boolean;
  fontSizeBody: number;
  fontSizeHeading: number;
  isDefault?: boolean;
}

export default function DocumentTemplateEditor() {
  const [activeType, setActiveType] = useState('handover');
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const load = useCallback(async (docType: string) => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await axios.get(`/api/document-templates/${docType}`);
      setTemplate(res.data);
    } catch { setError('Failed to load template'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(activeType); }, [activeType, load]);

  async function save() {
    if (!template) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await axios.patch(`/api/document-templates/${activeType}`, template);
      setSuccess('Template saved — takes effect on next document generation');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  async function generatePreview() {
    if (!previewProjectId) return;
    setPreviewing(true);
    try {
      const res = await axios.post(`/api/document-templates/${activeType}/preview`, {
        testProjectId: parseInt(previewProjectId),
      });
      window.open(res.data.previewUrl, '_blank');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Preview failed');
    } finally { setPreviewing(false); }
  }

  function update(key: keyof Template, val: any) {
    setTemplate(t => t ? { ...t, [key]: val } : t);
  }

  function toggleSection(sectionId: string, enabled: boolean) {
    setTemplate(t => t ? {
      ...t,
      sections: t.sections.map(s => s.id === sectionId ? { ...s, enabled } : s),
    } : t);
  }

  function updateSectionText(sectionId: string, customText: string) {
    setTemplate(t => t ? {
      ...t,
      sections: t.sections.map(s => s.id === sectionId ? { ...s, customText } : s),
    } : t);
  }

  if (loading) return <div style={s.loading}>Loading template…</div>;
  if (!template) return null;

  return (
    <div style={s.container}>
      {/* Doc type tabs */}
      <div style={s.typeTabs}>
        {DOC_TYPES.map(dt => (
          <button
            key={dt.id}
            style={{ ...s.typeTab, ...(activeType === dt.id ? s.typeTabActive : {}) }}
            onClick={() => setActiveType(dt.id)}
          >
            {dt.label}
          </button>
        ))}
      </div>

      {(error || success) && (
        <div style={error ? s.errorBanner : s.successBanner}>{error || success}</div>
      )}

      {template.isDefault && (
        <div style={s.defaultBanner}>
          ℹ Using default template — save changes to create a custom version for this document type.
        </div>
      )}

      <div style={s.editorGrid}>
        {/* Left — settings */}
        <div style={s.settingsCol}>

          {/* Cover page */}
          <Section title="Cover Page">
            <Field label="Tagline">
              <input style={s.input} value={template.coverTagline || ''} onChange={e => update('coverTagline', e.target.value)} placeholder="MCS Certified Heat Pump Installation" />
            </Field>
            <Field label="Cover Background Colour">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={template.coverBgColour || '#7A8465'} onChange={e => update('coverBgColour', e.target.value)} style={{ width: 44, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                <input style={{ ...s.input, width: 100, fontFamily: 'monospace' }} value={template.coverBgColour || '#7A8465'} onChange={e => update('coverBgColour', e.target.value)} />
              </div>
            </Field>
            <Toggle label="Show logo on cover" value={template.coverShowLogo} onChange={v => update('coverShowLogo', v)} />
          </Section>

          {/* Content toggles */}
          <Section title="Content Sections">
            <Toggle label="Include heat loss summary" value={template.includeHeatLoss} onChange={v => update('includeHeatLoss', v)} />
            <Toggle label="Include EPC data" value={template.includeEpc} onChange={v => update('includeEpc', v)} />
            <Toggle label="Include MCS registration" value={template.includeMcsRegistration} onChange={v => update('includeMcsRegistration', v)} />
            <Toggle label="Include EPC recommendations" value={template.includeRecommendations} onChange={v => update('includeRecommendations', v)} />
            <Toggle label="Include site photos" value={template.includePhotos} onChange={v => update('includePhotos', v)} />
          </Section>

          {/* Typography */}
          <Section title="Typography">
            <Field label={`Body font size (${template.fontSizeBody}pt)`}>
              <input type="range" min={8} max={12} value={template.fontSizeBody} onChange={e => update('fontSizeBody', parseInt(e.target.value))} style={{ width: '100%' }} />
            </Field>
            <Field label={`Heading font size (${template.fontSizeHeading}pt)`}>
              <input type="range" min={10} max={20} value={template.fontSizeHeading} onChange={e => update('fontSizeHeading', parseInt(e.target.value))} style={{ width: '100%' }} />
            </Field>
          </Section>

          {/* Footer */}
          <Section title="Footer Details">
            <Field label="Company Name">
              <input style={s.input} value={template.footerCompanyName || ''} onChange={e => update('footerCompanyName', e.target.value)} placeholder="RISO HOME" />
            </Field>
            <Field label="Address">
              <input style={s.input} value={template.footerAddress || ''} onChange={e => update('footerAddress', e.target.value)} placeholder="123 Example Street, London" />
            </Field>
            <Field label="Phone">
              <input style={s.input} value={template.footerPhone || ''} onChange={e => update('footerPhone', e.target.value)} placeholder="01234 567890" />
            </Field>
            <Field label="Email">
              <input style={s.input} value={template.footerEmail || ''} onChange={e => update('footerEmail', e.target.value)} placeholder="info@risohome.co.uk" />
            </Field>
            <Field label="MCS Number">
              <input style={s.input} value={template.footerMcsNumber || ''} onChange={e => update('footerMcsNumber', e.target.value)} placeholder="MCS/XXXXX" />
            </Field>
            <Field label="RECC Number">
              <input style={s.input} value={template.footerReccNumber || ''} onChange={e => update('footerReccNumber', e.target.value)} placeholder="RECC/XXXXX" />
            </Field>
            <Field label="Custom footer text">
              <input style={s.input} value={template.footerCustomText || ''} onChange={e => update('footerCustomText', e.target.value)} placeholder="e.g. Reg. in England & Wales No. XXXXXXX" />
            </Field>
          </Section>
        </div>

        {/* Right — section order and custom text */}
        <div style={s.sectionsCol}>
          <Section title="Sections & Order">
            <p style={s.hint}>Toggle sections on/off. Click a section to add custom introductory text.</p>
            {template.sections.length === 0 && (
              <div style={s.noSections}>No sections configured for this document type.</div>
            )}
            {template.sections.sort((a, b) => a.order - b.order).map(section => (
              <div key={section.id} style={s.sectionRow}>
                <div style={s.sectionToggleRow}>
                  <Toggle
                    label={section.label}
                    value={section.enabled}
                    onChange={v => toggleSection(section.id, v)}
                  />
                  <button
                    style={s.editTextBtn}
                    onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                  >
                    {activeSection === section.id ? 'Done' : 'Edit text'}
                  </button>
                </div>
                {activeSection === section.id && (
                  <div style={s.sectionTextArea}>
                    <label style={s.label}>Custom introductory text (optional)</label>
                    <textarea
                      style={{ ...s.input, height: 60, resize: 'vertical' }}
                      value={section.customText || ''}
                      onChange={e => updateSectionText(section.id, e.target.value)}
                      placeholder="Leave blank to use default text…"
                    />
                  </div>
                )}
              </div>
            ))}
          </Section>
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <div style={s.previewRow}>
          <input
            style={{ ...s.input, width: 160 }}
            placeholder="Project ID for preview"
            value={previewProjectId}
            onChange={e => setPreviewProjectId(e.target.value)}
          />
          <button style={s.previewBtn} onClick={generatePreview} disabled={previewing || !previewProjectId}>
            {previewing ? 'Generating…' : '👁 Preview PDF'}
          </button>
        </div>
        <button style={s.saveBtn} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={s.sectionBlock}>
      <div style={s.sectionBlockTitle}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={s.toggleRow} onClick={() => onChange(!value)}>
      <div style={{ ...s.toggleSwitch, background: value ? '#7A8465' : '#ddd' }}>
        <div style={{ ...s.toggleThumb, transform: value ? 'translateX(18px)' : 'translateX(0)' }} />
      </div>
      <span style={s.toggleLabel}>{label}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'Satoshi, sans-serif' },
  typeTabs: { display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' },
  typeTab: { fontSize: 12, padding: '7px 14px', border: '1px solid #e0e0d8', borderRadius: 7, background: '#fff', color: '#666', cursor: 'pointer', fontWeight: 500 },
  typeTabActive: { background: '#7A8465', color: '#fff', borderColor: '#7A8465', fontWeight: 700 },
  editorGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },
  settingsCol: {},
  sectionsCol: {},
  sectionBlock: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '16px 18px', marginBottom: 14 },
  sectionBlockTitle: { fontSize: 12, fontWeight: 700, color: '#7A8465', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14, borderBottom: '1px solid #f0f0ec', paddingBottom: 8 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  input: { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10, userSelect: 'none' },
  toggleSwitch: { width: 40, height: 22, borderRadius: 11, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 13, color: '#333' },
  sectionRow: { borderBottom: '1px solid #f5f5f0', paddingBottom: 8, marginBottom: 8 },
  sectionToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  editTextBtn: { fontSize: 11, color: '#7A8465', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  sectionTextArea: { marginTop: 8 },
  noSections: { fontSize: 12, color: '#bbb', padding: '12px 0' },
  hint: { fontSize: 12, color: '#888', marginBottom: 12 },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0ec', paddingTop: 16 },
  previewRow: { display: 'flex', gap: 8, alignItems: 'center' },
  previewBtn: { fontSize: 12, padding: '7px 14px', background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' },
  saveBtn: { fontSize: 13, padding: '8px 20px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
  defaultBanner: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '8px 14px', fontSize: 12, color: '#2563eb', marginBottom: 14 },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 14 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 14 },
};
