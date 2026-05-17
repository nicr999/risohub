// ============================================================
// RISO HUB — BUSEligibilityPanel.tsx
// Run, display and track BUS eligibility assessments
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface BUSCriterion {
  id: string;
  label: string;
  pass: boolean;
  blocker: boolean;
  detail: string;
  value?: string | number | boolean;
}

interface BUSAssessment {
  id: number;
  verdict: 'eligible' | 'ineligible' | 'likely_eligible' | 'requires_review';
  criteria: BUSCriterion[];
  blockers: string[];
  warnings: string[];
  grantAmount?: number;
  summary: string;
  assessedAt: string;
  notes?: string;
  assessor?: { name: string };
}

interface Props {
  projectId: number;
  projectType: 'ASHP' | 'GSHP';
  hasEPC: boolean;
  readOnly?: boolean;
}

// ── Verdict config ─────────────────────────────────────────────

const VERDICT_CONFIG = {
  eligible: {
    label: 'Eligible',
    bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', icon: '✓',
  },
  likely_eligible: {
    label: 'Likely Eligible',
    bg: '#fffbeb', border: '#fde68a', text: '#ca8a04', icon: '~',
  },
  requires_review: {
    label: 'Requires Review',
    bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', icon: '?',
  },
  ineligible: {
    label: 'Not Eligible',
    bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', icon: '✗',
  },
};

// ── Main component ─────────────────────────────────────────────

export default function BUSEligibilityPanel({ projectId, projectType, hasEPC, readOnly = false }: Props) {
  const [assessment, setAssessment] = useState<BUSAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState({
    isNewBuild: false,
    isListedBuilding: false,
    ownerOccupied: true,
    insulationNotFeasible: false,
    existingSystemFuel: '',
  });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/bus/project/${projectId}`);
      setAssessment(res.data);
      setNotes(res.data.notes || '');
    } catch (e: any) {
      if (e.response?.status !== 404) setError('Failed to load BUS assessment');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleAssess() {
    setAssessing(true); setError(''); setSuccess('');
    try {
      const res = await axios.post(`/api/bus/project/${projectId}/assess`, {
        overrides: {
          ...overrides,
          existingSystemFuel: overrides.existingSystemFuel || undefined,
        },
        notes: notes || undefined,
      });
      setAssessment(res.data);
      setShowOverrides(false);
      setSuccess('Assessment complete');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Assessment failed');
    } finally {
      setAssessing(false);
    }
  }

  async function handleSaveNotes() {
    if (!assessment) return;
    try {
      await axios.patch(`/api/bus/${assessment.id}/notes`, { notes });
      setSuccess('Notes saved');
    } catch {
      setError('Failed to save notes');
    }
  }

  if (loading) return <div style={s.loading}>Loading BUS eligibility…</div>;

  const grantLabel = GRANT_LABELS[projectType];

  return (
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h3 style={s.title}>Boiler Upgrade Scheme Eligibility</h3>
          <p style={s.desc}>
            {grantLabel} — up to <strong>£7,500</strong> grant via Ofgem BUS
          </p>
        </div>
        {!readOnly && (
          <button
            style={s.assessBtn}
            onClick={() => setShowOverrides(v => !v)}
          >
            {assessment ? '↺ Re-assess' : '+ Run Assessment'}
          </button>
        )}
      </div>

      {(error || success) && (
        <div style={error ? s.errorBanner : s.successBanner}>{error || success}</div>
      )}

      {/* EPC warning */}
      {!hasEPC && (
        <div style={s.warningBanner}>
          ⚠ No EPC fetched for this project. Fetch the EPC above for a more accurate assessment.
        </div>
      )}

      {/* Override panel */}
      {showOverrides && (
        <div style={s.overridesBox}>
          <div style={s.overridesTitle}>Assessment Options</div>
          <p style={s.overridesDesc}>
            These options supplement the EPC data. Only set values you know — leave defaults otherwise.
          </p>
          <div style={s.overridesGrid}>
            <Toggle
              label="New build property"
              value={overrides.isNewBuild}
              onChange={v => setOverrides(o => ({ ...o, isNewBuild: v }))}
            />
            <Toggle
              label="Listed building"
              value={overrides.isListedBuilding}
              onChange={v => setOverrides(o => ({ ...o, isListedBuilding: v }))}
            />
            <Toggle
              label="Owner-occupied (not social housing)"
              value={overrides.ownerOccupied}
              onChange={v => setOverrides(o => ({ ...o, ownerOccupied: v }))}
            />
            <Toggle
              label="Insulation not technically feasible"
              value={overrides.insulationNotFeasible}
              onChange={v => setOverrides(o => ({ ...o, insulationNotFeasible: v }))}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Existing heating fuel (if not in EPC)</label>
            <select
              style={s.select}
              value={overrides.existingSystemFuel}
              onChange={e => setOverrides(o => ({ ...o, existingSystemFuel: e.target.value }))}
            >
              <option value="">Use EPC value</option>
              <option value="mains gas">Mains gas</option>
              <option value="oil">Oil</option>
              <option value="lpg">LPG</option>
              <option value="electric storage heaters">Electric storage heaters</option>
              <option value="electricity">Direct electric</option>
              <option value="coal">Coal/solid fuel</option>
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>Notes (optional)</label>
            <textarea
              style={{ ...s.select, height: 60, resize: 'vertical' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any context for this assessment…"
            />
          </div>
          <div style={s.overridesActions}>
            <button style={s.cancelBtn} onClick={() => setShowOverrides(false)}>Cancel</button>
            <button style={s.runBtn} onClick={handleAssess} disabled={assessing}>
              {assessing ? 'Assessing…' : 'Run Assessment'}
            </button>
          </div>
        </div>
      )}

      {/* Assessment result */}
      {assessment && !showOverrides && (
        <div>
          {/* Verdict banner */}
          <VerdictBanner
            verdict={assessment.verdict}
            grantAmount={assessment.grantAmount}
            summary={assessment.summary}
          />

          {/* Criteria list */}
          <div style={s.criteriaSection}>
            <div style={s.criteriaTitle}>Eligibility Criteria</div>
            {assessment.criteria.map(c => (
              <CriterionRow key={c.id} criterion={c} />
            ))}
          </div>

          {/* Warnings */}
          {assessment.warnings.length > 0 && (
            <div style={s.warningsSection}>
              <div style={s.criteriaTitle}>Warnings</div>
              {assessment.warnings.map((w, i) => (
                <div key={i} style={s.warningRow}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div style={s.notesSection}>
            <label style={s.label}>Assessment Notes</label>
            {readOnly ? (
              <div style={s.notesText}>{assessment.notes || <span style={{ color: '#ccc' }}>No notes</span>}</div>
            ) : (
              <div style={s.notesRow}>
                <textarea
                  style={s.notesInput}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this assessment…"
                  rows={2}
                />
                <button style={s.saveNotesBtn} onClick={handleSaveNotes}>Save</button>
              </div>
            )}
          </div>

          <div style={s.meta}>
            Assessed {new Date(assessment.assessedAt).toLocaleDateString('en-GB')}
            {assessment.assessor ? ` by ${assessment.assessor.name}` : ''}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!assessment && !showOverrides && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>💰</div>
          <div style={s.emptyText}>No BUS assessment yet</div>
          {!readOnly && (
            <button style={s.assessBtn} onClick={() => setShowOverrides(true)}>
              Run eligibility check
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function VerdictBanner({ verdict, grantAmount, summary }: {
  verdict: BUSAssessment['verdict'];
  grantAmount?: number;
  summary: string;
}) {
  const cfg = VERDICT_CONFIG[verdict];
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: cfg.text, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {cfg.icon}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: cfg.text }}>{cfg.label}</span>
        {grantAmount && (
          <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: cfg.text }}>
            £{grantAmount.toLocaleString()} grant
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>{summary}</p>
    </div>
  );
}

function CriterionRow({ criterion: c }: { criterion: BUSCriterion }) {
  const [expanded, setExpanded] = useState(!c.pass && c.blocker);
  return (
    <div style={{ ...s.criterionRow, borderLeftColor: c.pass ? '#22c55e' : c.blocker ? '#ef4444' : '#f59e0b' }}>
      <div style={s.criterionHeader} onClick={() => setExpanded(v => !v)}>
        <span style={{ ...s.criterionStatus, color: c.pass ? '#16a34a' : c.blocker ? '#dc2626' : '#ca8a04' }}>
          {c.pass ? '✓' : c.blocker ? '✗' : '⚠'}
        </span>
        <span style={s.criterionLabel}>{c.label}</span>
        {c.blocker && !c.pass && (
          <span style={s.blockerTag}>BLOCKER</span>
        )}
        <span style={s.expandChevron}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={s.criterionDetail}>{c.detail}</div>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={s.toggleRow} onClick={() => onChange(!value)}>
      <div style={{ ...s.toggleSwitch, background: value ? '#7A8465' : '#ddd' }}>
        <div style={{ ...s.toggleThumb, transform: value ? 'translateX(16px)' : 'translateX(0)' }} />
      </div>
      <span style={s.toggleLabel}>{label}</span>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────

const GRANT_LABELS: Record<string, string> = {
  ASHP: 'Air Source Heat Pump',
  GSHP: 'Ground Source Heat Pump',
};

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  desc: { fontSize: 12, color: '#888', margin: '3px 0 0' },
  assessBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  overridesBox: { background: '#fafaf8', border: '1px solid #e8e8e4', borderRadius: 8, padding: 18, marginBottom: 16 },
  overridesTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 4 },
  overridesDesc: { fontSize: 12, color: '#888', margin: '0 0 14px' },
  overridesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 },
  overridesActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 },
  select: { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', outline: 'none', boxSizing: 'border-box' },
  cancelBtn: { fontSize: 12, padding: '6px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
  runBtn: { fontSize: 12, padding: '6px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  criteriaSection: { marginBottom: 16 },
  criteriaTitle: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  criterionRow: { borderLeft: '3px solid', paddingLeft: 12, marginBottom: 8, cursor: 'pointer' },
  criterionHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  criterionStatus: { fontSize: 14, fontWeight: 700, width: 18, flexShrink: 0 },
  criterionLabel: { fontSize: 13, color: '#333', flex: 1 },
  blockerTag: { fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em' },
  expandChevron: { fontSize: 9, color: '#bbb' },
  criterionDetail: { fontSize: 12, color: '#666', lineHeight: 1.5, padding: '6px 0 4px', paddingLeft: 26 },
  warningsSection: { marginBottom: 16 },
  warningRow: { fontSize: 12, color: '#ca8a04', padding: '5px 0', borderBottom: '1px solid #fef9e7' },
  warningBanner: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 12 },
  notesSection: { borderTop: '1px solid #f0f0ec', paddingTop: 14, marginTop: 4, marginBottom: 8 },
  notesText: { fontSize: 13, color: '#555', marginTop: 6 },
  notesRow: { display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 },
  notesInput: { flex: 1, fontSize: 12, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', outline: 'none' },
  saveNotesBtn: { fontSize: 11, padding: '6px 12px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0 },
  meta: { fontSize: 11, color: '#bbb', marginTop: 8 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' },
  toggleSwitch: { width: 36, height: 20, borderRadius: 10, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 13, color: '#333' },
  empty: { textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 13, color: '#bbb' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
};
