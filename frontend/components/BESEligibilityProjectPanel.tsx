// BESEligibilityProjectPanel.tsx
// Project-level BES / Ofgem grant eligibility assessment UI.
// Shown on the EPC & BUS tab of ProjectDetailPage.

import React, { useState } from 'react';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

type InstallType =
  | 'Air Source Heat Pump' | 'Ground Source Heat Pump' | 'Solar PV'
  | 'Solar PV + Battery' | 'Battery Storage' | 'Biomass Boiler'
  | 'Solar Water Heating' | 'Flat Plate Solar Thermal'
  | 'Cavity Wall Insulation' | 'Solid Wall Insulation (External)'
  | 'Solid Wall Insulation (Internal)' | 'Loft Insulation'
  | 'Underfloor Insulation' | 'Double Glazing';

type EpcRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type TenureType = 'Owner Occupier' | 'Private Rented' | 'Social Housing';
type Region = 'England' | 'Wales' | 'Scotland';

interface EligibilityInput {
  installType: InstallType;
  propertyType: string;
  tenure: TenureType;
  epcRating: EpcRating;
  householdIncomeBand: 'under_31k' | '31k_to_50k' | 'over_50k' | 'unknown';
  onBenefits: boolean;
  isRural: boolean;
  region: Region;
  currentHeatingFuel?: string;
}

interface GrantResult {
  schemeName: string;
  schemeRef: string;
  eligible: boolean;
  grantAmount: number | null;
  grantDescription: string;
  conditions: string[];
  incompatibilities: string[];
  notes?: string;
  lastUpdated: string;
}

interface EligibilityReport {
  installType: InstallType;
  totalPotentialGrant: number;
  grants: GrantResult[];
  summary: string;
  warnings: string[];
  assessedAt: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: number;
  projectType: 'ASHP' | 'GSHP';
  postcode?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectRegionFromPostcode(postcode: string): Region {
  const clean = postcode.toUpperCase().replace(/\s/g, '');
  if (clean.startsWith('BT')) return 'England'; // Northern Ireland — falls back to England (no BUS)
  const scottishPrefixes = ['AB','DD','DG','EH','FK','G','HS','IV','KA','KW','KY','ML','PA','PH','TD','ZE'];
  if (scottishPrefixes.some(p => clean.startsWith(p))) return 'Scotland';
  const welshPrefixes = ['CF','CH','LD','LL','NP','SA','SY'];
  if (welshPrefixes.some(p => clean.startsWith(p))) return 'Wales';
  return 'England';
}

const INSTALL_TYPE_MAP: Record<'ASHP' | 'GSHP', InstallType> = {
  ASHP: 'Air Source Heat Pump',
  GSHP: 'Ground Source Heat Pump',
};

// ─── Grant badge ─────────────────────────────────────────────────────────────

function GrantBadge({ grant }: { grant: GrantResult }) {
  const bg = grant.eligible ? '#e8f5f0' : '#f5f5f2';
  const border = grant.eligible ? '#9fd4b8' : '#DBD2C4';
  const colour = grant.eligible ? '#2a7a5a' : '#aaa';

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{grant.eligible ? '✓' : '○'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: grant.eligible ? '#1a5a3a' : '#666' }}>
              {grant.schemeName}
            </span>
            <span style={{ fontSize: 10, color: '#888', fontFamily: 'monospace' }}>{grant.schemeRef}</span>
          </div>
          <div style={{ fontSize: 12, color: '#777', marginTop: 4, marginLeft: 24 }}>
            {grant.grantDescription}
          </div>
          {grant.eligible && grant.conditions.length > 0 && (
            <ul style={{ margin: '8px 0 0 24px', padding: 0, listStyle: 'disc', fontSize: 11, color: '#555' }}>
              {grant.conditions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
          {grant.notes && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6, marginLeft: 24, fontStyle: 'italic' }}>
              {grant.notes}
            </div>
          )}
          {grant.incompatibilities.length > 0 && grant.eligible && (
            <div style={{ fontSize: 11, color: '#c07020', marginTop: 6, marginLeft: 24 }}>
              ⚠ {grant.incompatibilities.join('; ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {grant.eligible ? (
            grant.grantAmount != null ? (
              <div style={{ fontSize: 18, fontWeight: 700, color }}>£{grant.grantAmount.toLocaleString()}</div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 700, color }}>Variable</div>
            )
          ) : (
            <div style={{ fontSize: 12, color: '#bbb' }}>Not eligible</div>
          )}
          <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
            Updated {grant.lastUpdated}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BESEligibilityProjectPanel({ projectId, projectType, postcode }: Props) {
  const defaultRegion: Region = postcode ? detectRegionFromPostcode(postcode) : 'England';

  const [form, setForm] = useState<EligibilityInput>({
    installType: INSTALL_TYPE_MAP[projectType],
    propertyType: 'Detached',
    tenure: 'Owner Occupier',
    epcRating: 'D',
    householdIncomeBand: 'unknown',
    onBenefits: false,
    isRural: false,
    region: defaultRegion,
    currentHeatingFuel: 'Gas',
  });

  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assess = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/eligibility/assess', form);
      setReport(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Assessment failed');
    } finally {
      setLoading(false);
    }
  };

  const field = (
    label: string,
    value: string | boolean,
    onChange: (v: any) => void,
    options?: { type?: 'select' | 'checkbox'; items?: string[] }
  ) => (
    <div style={{ marginBottom: 12 }}>
      <label style={s.label}>{label}</label>
      {options?.type === 'checkbox' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={e => onChange(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: '#555' }}>Yes</span>
        </label>
      ) : options?.type === 'select' && options.items ? (
        <select
          style={s.input}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        >
          {options.items.map(item => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      ) : (
        <input
          style={s.input}
          value={value as string}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.panelHeader}>
        <div>
          <h3 style={s.title}>Grant Eligibility Assessment</h3>
          <p style={s.subtitle}>BUS, ECO4, GBIS, SEG and regional schemes — assessed for this property</p>
        </div>
        {report && (
          <div style={s.totalGrant}>
            <div style={s.totalLabel}>Confirmed grant value</div>
            <div style={s.totalAmount}>
              {report.totalPotentialGrant > 0
                ? `£${report.totalPotentialGrant.toLocaleString()}`
                : 'Variable'}
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <div style={s.form}>
        <div style={s.formGrid}>
          {field('Install Type', form.installType, v => setForm(f => ({ ...f, installType: v })), {
            type: 'select',
            items: [
              'Air Source Heat Pump', 'Ground Source Heat Pump', 'Solar PV',
              'Solar PV + Battery', 'Battery Storage', 'Biomass Boiler',
              'Solar Water Heating', 'Flat Plate Solar Thermal',
              'Cavity Wall Insulation', 'Solid Wall Insulation (External)',
              'Solid Wall Insulation (Internal)', 'Loft Insulation',
              'Underfloor Insulation', 'Double Glazing',
            ],
          })}
          {field('Region', form.region, v => setForm(f => ({ ...f, region: v })), {
            type: 'select',
            items: ['England', 'Wales', 'Scotland'],
          })}
          {field('EPC Rating', form.epcRating, v => setForm(f => ({ ...f, epcRating: v })), {
            type: 'select',
            items: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
          })}
          {field('Tenure', form.tenure, v => setForm(f => ({ ...f, tenure: v })), {
            type: 'select',
            items: ['Owner Occupier', 'Private Rented', 'Social Housing'],
          })}
          {field('Property Type', form.propertyType, v => setForm(f => ({ ...f, propertyType: v })), {
            type: 'select',
            items: ['Detached', 'Semi-Detached', 'Terraced', 'Flat', 'Bungalow', 'End of Terrace'],
          })}
          {field('Household Income Band', form.householdIncomeBand, v => setForm(f => ({ ...f, householdIncomeBand: v })), {
            type: 'select',
            items: ['under_31k', '31k_to_50k', 'over_50k', 'unknown'],
          })}
          {field('Current Heating Fuel', form.currentHeatingFuel ?? 'Gas', v => setForm(f => ({ ...f, currentHeatingFuel: v })), {
            type: 'select',
            items: ['Gas', 'Oil', 'Electric', 'Solid Fuel', 'LPG', 'None'],
          })}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <label style={s.label}>On qualifying benefits?</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.onBenefits}
                onChange={e => setForm(f => ({ ...f, onBenefits: e.target.checked }))}
              />
              <span style={{ fontSize: 13, color: '#555' }}>Yes</span>
            </label>
          </div>
          <div>
            <label style={s.label}>Rural / off-gas-grid?</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isRural}
                onChange={e => setForm(f => ({ ...f, isRural: e.target.checked }))}
              />
              <span style={{ fontSize: 13, color: '#555' }}>Yes</span>
            </label>
          </div>
        </div>

        <button style={s.assessBtn} onClick={assess} disabled={loading}>
          {loading ? 'Assessing…' : 'Run Eligibility Assessment'}
        </button>
        {error && <div style={s.errorBanner}>{error}</div>}
      </div>

      {/* Results */}
      {report && (
        <div style={s.results}>
          {/* Summary banner */}
          <div style={s.summaryBanner}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{report.summary}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Assessed at {new Date(report.assessedAt).toLocaleString('en-GB')}
            </div>
          </div>

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div style={s.warnBox}>
              {report.warnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < report.warnings.length - 1 ? 6 : 0 }}>
                  <span>⚠</span>
                  <span style={{ fontSize: 12 }}>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Grant list — eligible first */}
          <div style={{ marginTop: 16 }}>
            <div style={s.sectionLabel}>Eligible schemes</div>
            {report.grants.filter(g => g.eligible).length === 0 ? (
              <div style={s.noGrants}>No schemes are eligible based on the inputs provided.</div>
            ) : (
              report.grants.filter(g => g.eligible).map(g => <GrantBadge key={g.schemeRef} grant={g} />)
            )}
            {report.grants.some(g => !g.eligible) && (
              <>
                <div style={{ ...s.sectionLabel, marginTop: 16 }}>Not eligible</div>
                {report.grants.filter(g => !g.eligible).map(g => <GrantBadge key={g.schemeRef} grant={g} />)}
              </>
            )}
          </div>

          <div style={s.disclaimer}>
            Grant amounts shown are indicative based on Ofgem rates (Oct 2024). Always verify with the relevant scheme administrator before quoting to customers.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: 'Satoshi, sans-serif', background: '#F5F5F2', borderRadius: 12, overflow: 'hidden' },
  panelHeader: { background: '#fff', borderBottom: '1px solid #DBD2C4', padding: '16px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  subtitle: { fontSize: 12, color: '#888', margin: '4px 0 0' },
  totalGrant: { textAlign: 'right', flexShrink: 0 },
  totalLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '.05em' },
  totalAmount: { fontSize: 22, fontWeight: 700, color: '#2a7a5a' },
  form: { background: '#fff', borderBottom: '1px solid #DBD2C4', padding: '18px 22px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px 16px', marginBottom: 16 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase' as const, letterSpacing: '.04em', marginBottom: 5 },
  input: { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, background: '#fafaf8', outline: 'none', boxSizing: 'border-box' as const },
  assessBtn: { marginTop: 16, fontSize: 13, fontWeight: 700, padding: '9px 24px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' },
  errorBanner: { marginTop: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#dc2626' },
  results: { padding: '20px 22px' },
  summaryBanner: { background: '#fff', border: '1px solid #DBD2C4', borderRadius: 10, padding: '14px 16px', marginBottom: 16 },
  warnBox: { background: '#fef3e2', border: '1px solid #f5c87a', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#7a5010', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 10 },
  noGrants: { fontSize: 13, color: '#aaa', padding: '12px 0' },
  disclaimer: { marginTop: 20, fontSize: 11, color: '#bbb', borderTop: '1px solid #f0f0ec', paddingTop: 12 },
};
