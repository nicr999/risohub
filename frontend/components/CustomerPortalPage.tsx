// ============================================================
// RISO HUB — components/CustomerPortalPage.tsx
// Public customer-facing portal page.
// No login required — access is via a secure token in the URL.
//
// Add to main router (OUTSIDE AuthGuard):
//   import CustomerPortalPage from './components/CustomerPortalPage';
//   <Route path="/portal/view/:token" element={<CustomerPortalPage />} />
//   <Route path="/portal"             element={<CustomerPortalPage />} />
//
// Token can be in URL param (/portal/view/:token) or query string (/portal?token=...)
// ============================================================

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

interface PortalDocument {
  id:           string;
  docType:      string;
  version:      number;
  generatedAt:  string;
  signed:       boolean;
  signedAt:     string | null;
  presignedUrl: string | null;
}

interface PortalData {
  project: {
    id:           string;
    customerName: string;
    address:      string;
    postcode:     string;
    projectType:  string;
    status:       string;
    assignee:     string | null;
  };
  documents:       PortalDocument[];
  checklistSummary:{
    total: number; complete: number; noncompliant: number; na: number; pending: number;
  };
  mcsRegistration: { mcsNumber: string; registeredAt: string | null } | null;
  heatLoss:        { heatDemandKW: number | null; heatLossKW: number | null; designFlowTemp: number | null; softwareUsed: string | null } | null;
  epc:             { currentEnergyRating: string | null; potentialEnergyRating: string | null; currentEnergyEfficiency: number | null; propertyType: string | null } | null;
  company:         { name: string; phone: string; email: string; logoUrl: string | null; mcsNumber: string };
  portalExpiresAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  survey: 'Survey', design: 'Design', install: 'Installation',
  commission: 'Commissioning', audit: 'Audit Complete',
};

const STATUS_COLOURS: Record<string, string> = {
  survey: '#6b7280', design: '#3b82f6', install: '#f59e0b',
  commission: '#8b5cf6', audit: '#22c55e',
};

const DOC_LABELS: Record<string, string> = {
  handover:      'Handover Certificate',
  commissioning: 'Commissioning Report',
  risk_assessment:'Risk Assessment',
  design:        'System Design',
};

export default function CustomerPortalPage() {
  const { token: paramToken }  = useParams<{ token?: string }>();
  const [searchParams]         = useSearchParams();
  const queryToken             = searchParams.get('token') ?? '';
  const token                  = paramToken ?? queryToken;

  const [data,    setData]    = useState<PortalData | null>(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('No portal token provided. Please use the link from your invitation email.');
      setLoading(false);
      return;
    }

    fetch(`/api/portal/view/${token}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load your portal.');
        }
        return r.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <FullPage><p style={s.loadingText}>Loading your portal…</p></FullPage>;

  if (error)   return (
    <FullPage>
      <div style={s.errorCard}>
        <div style={s.errorIcon}>!</div>
        <h2 style={s.errorTitle}>Link unavailable</h2>
        <p style={s.errorBody}>{error}</p>
        <p style={s.errorHint}>If your link has expired, please contact your installer for a new one.</p>
      </div>
    </FullPage>
  );

  if (!data) return null;

  const { project, documents, checklistSummary, mcsRegistration, heatLoss, epc, company } = data;
  const statusColour = STATUS_COLOURS[project.status] ?? '#7A8465';
  const signedDocs   = documents.filter(d => d.signed);
  const compliancePct = checklistSummary.total > 0
    ? Math.round((checklistSummary.complete / checklistSummary.total) * 100)
    : 0;

  return (
    <div style={s.page}>
      {/* Header / branding */}
      <header style={s.header}>
        <div style={s.headerInner}>
          {company.logoUrl
            ? <img src={company.logoUrl} alt={company.name} style={s.logo} />
            : <div style={s.logoText}>{company.name}</div>
          }
          <div style={s.headerRight}>
            {company.phone && <a href={`tel:${company.phone}`} style={s.headerContact}>{company.phone}</a>}
            {company.email && <a href={`mailto:${company.email}`} style={s.headerContact}>{company.email}</a>}
          </div>
        </div>
      </header>

      <main style={s.main}>
        {/* Project hero */}
        <section style={s.hero}>
          <div style={s.heroTop}>
            <div>
              <h1 style={s.heroName}>{project.customerName}</h1>
              <p style={s.heroAddress}>{project.address}, {project.postcode}</p>
            </div>
            <div style={{ ...s.statusBadge, background: statusColour }}>
              {STATUS_LABELS[project.status] ?? project.status}
            </div>
          </div>

          <div style={s.heroMeta}>
            <MetaChip label="System" value={project.projectType === 'ASHP' ? 'Air Source Heat Pump' : 'Ground Source Heat Pump'} />
            {project.assignee && <MetaChip label="Installer" value={project.assignee} />}
            {mcsRegistration && <MetaChip label="MCS No." value={mcsRegistration.mcsNumber} mono />}
          </div>

          {/* Compliance bar */}
          <div style={s.complianceSection}>
            <div style={s.complianceLabel}>
              <span>MCS Compliance</span>
              <span style={{ fontWeight: 700, color: compliancePct === 100 ? '#22c55e' : '#7A8465' }}>
                {compliancePct}%
              </span>
            </div>
            <div style={s.complianceBarBg}>
              <div style={{
                ...s.complianceBarFill,
                width: `${compliancePct}%`,
                background: compliancePct === 100 ? '#22c55e' : '#7A8465',
              }} />
            </div>
            {checklistSummary.noncompliant > 0 && (
              <p style={s.noncompliantWarn}>
                {checklistSummary.noncompliant} item{checklistSummary.noncompliant > 1 ? 's' : ''} require attention
              </p>
            )}
          </div>
        </section>

        {/* Documents */}
        <Section title="Your Documents">
          {signedDocs.length === 0 ? (
            <p style={s.emptyText}>No signed documents are available yet. Your installer will notify you when documents are ready.</p>
          ) : (
            signedDocs.map(doc => (
              <div key={doc.id} style={s.docRow}>
                <div style={s.docIcon}>📄</div>
                <div style={s.docInfo}>
                  <div style={s.docName}>{DOC_LABELS[doc.docType] ?? doc.docType}</div>
                  <div style={s.docMeta}>
                    Signed {doc.signedAt ? new Date(doc.signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    {doc.version > 1 && ` · v${doc.version}`}
                  </div>
                </div>
                <div style={s.docActions}>
                  {doc.presignedUrl && (
                    <a
                      href={doc.presignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={s.viewBtn}
                    >
                      View
                    </a>
                  )}
                  <a
                    href={`/api/portal/documents/${doc.id}/download?token=${token}`}
                    style={s.downloadBtn}
                  >
                    Download
                  </a>
                </div>
              </div>
            ))
          )}
        </Section>

        {/* System details */}
        {(heatLoss || epc || mcsRegistration) && (
          <Section title="System Details">
            {heatLoss && (
              <div style={s.detailGrid}>
                {heatLoss.heatDemandKW != null  && <Detail label="Heat Demand"       value={`${heatLoss.heatDemandKW} kW`} />}
                {heatLoss.heatLossKW != null     && <Detail label="Total Heat Loss"   value={`${heatLoss.heatLossKW} kW`} />}
                {heatLoss.designFlowTemp != null && <Detail label="Flow Temperature"  value={`${heatLoss.designFlowTemp}°C`} />}
                {heatLoss.softwareUsed           && <Detail label="Design Software"   value={heatLoss.softwareUsed} />}
              </div>
            )}
            {epc && (
              <div style={{ ...s.detailGrid, marginTop: heatLoss ? 16 : 0 }}>
                {epc.currentEnergyRating   && <Detail label="EPC Rating"          value={epc.currentEnergyRating} />}
                {epc.potentialEnergyRating && <Detail label="Potential Rating"     value={epc.potentialEnergyRating} />}
                {epc.currentEnergyEfficiency != null && <Detail label="Energy Efficiency" value={String(epc.currentEnergyEfficiency)} />}
                {epc.propertyType          && <Detail label="Property Type"        value={epc.propertyType} />}
              </div>
            )}
            {mcsRegistration?.registeredAt && (
              <div style={{ ...s.detailGrid, marginTop: 16 }}>
                <Detail label="MCS Registered" value={new Date(mcsRegistration.registeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
                {company.mcsNumber && <Detail label="Installer MCS No." value={company.mcsNumber} mono />}
              </div>
            )}
          </Section>
        )}

        {/* Footer */}
        <footer style={s.footer}>
          <p>Powered by <strong>{company.name}</strong> · Secured by RISO HUB</p>
          <p style={s.footerExpiry}>
            This portal link expires on {new Date(data.portalExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </footer>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F2', padding: 24 }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.sectionCard}>{children}</div>
    </section>
  );
}

function MetaChip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={s.metaChip}>
      <span style={s.metaChipLabel}>{label}</span>
      <span style={{ ...s.metaChipValue, ...(mono ? { fontFamily: 'monospace', fontSize: 12 } : {}) }}>{value}</span>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={s.detail}>
      <span style={s.detailLabel}>{label}</span>
      <span style={{ ...s.detailValue, ...(mono ? { fontFamily: 'monospace' } : {}) }}>{value}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:             { minHeight: '100vh', background: '#F5F5F2', fontFamily: "'Satoshi', 'Inter', sans-serif" },
  header:           { background: '#fff', borderBottom: '1px solid #e8e4de', position: 'sticky', top: 0, zIndex: 10 },
  headerInner:      { maxWidth: 800, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  logo:             { height: 36, objectFit: 'contain' },
  logoText:         { fontSize: 18, fontWeight: 800, color: '#7A8465', letterSpacing: '-0.02em' },
  headerRight:      { display: 'flex', gap: 16, flexWrap: 'wrap' },
  headerContact:    { fontSize: 13, color: '#555', textDecoration: 'none', fontWeight: 500 },
  main:             { maxWidth: 800, margin: '0 auto', padding: '32px 24px 64px' },
  hero:             { background: '#fff', borderRadius: 14, padding: '24px 28px', marginBottom: 24, border: '1px solid #e8e4de' },
  heroTop:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  heroName:         { fontSize: 22, fontWeight: 800, color: '#222', margin: '0 0 4px', letterSpacing: '-0.01em' },
  heroAddress:      { fontSize: 13, color: '#888', margin: 0 },
  statusBadge:      { borderRadius: 8, padding: '5px 14px', fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' },
  heroMeta:         { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  metaChip:         { background: '#f5f5f0', borderRadius: 8, padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  metaChipLabel:    { fontSize: 9, fontWeight: 700, color: '#7A8465', textTransform: 'uppercase', letterSpacing: '0.06em' },
  metaChipValue:    { fontSize: 13, fontWeight: 600, color: '#333' },
  complianceSection:{ marginTop: 4 },
  complianceLabel:  { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 6 },
  complianceBarBg:  { height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  complianceBarFill:{ height: '100%', borderRadius: 3, transition: 'width 0.6s ease' },
  noncompliantWarn: { fontSize: 11, color: '#f59e0b', margin: '6px 0 0', fontWeight: 600 },
  section:          { marginBottom: 20 },
  sectionTitle:     { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 },
  sectionCard:      { background: '#fff', borderRadius: 12, border: '1px solid #e8e4de', overflow: 'hidden' },
  docRow:           { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid #f5f5f0' },
  docIcon:          { fontSize: 24, flexShrink: 0 },
  docInfo:          { flex: 1, minWidth: 0 },
  docName:          { fontSize: 14, fontWeight: 700, color: '#333' },
  docMeta:          { fontSize: 12, color: '#888', marginTop: 2 },
  docActions:       { display: 'flex', gap: 8, flexShrink: 0 },
  viewBtn:          { fontSize: 12, color: '#7A8465', fontWeight: 600, textDecoration: 'none', padding: '6px 12px', border: '1px solid #7A8465', borderRadius: 6 },
  downloadBtn:      { fontSize: 12, color: '#fff', fontWeight: 700, textDecoration: 'none', padding: '6px 12px', background: '#7A8465', borderRadius: 6 },
  detailGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 0 },
  detail:           { display: 'flex', flexDirection: 'column', gap: 3, padding: '14px 20px', borderBottom: '1px solid #f5f5f0' },
  detailLabel:      { fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  detailValue:      { fontSize: 14, fontWeight: 600, color: '#333' },
  emptyText:        { color: '#aaa', fontSize: 13, padding: '20px', margin: 0, lineHeight: 1.6 },
  footer:           { marginTop: 40, textAlign: 'center', fontSize: 12, color: '#bbb', lineHeight: 1.8 },
  footerExpiry:     { marginTop: 4, fontSize: 11 },
  loadingText:      { color: '#888', fontSize: 14 },
  errorCard:        { background: '#fff', borderRadius: 14, padding: '40px 32px', textAlign: 'center', maxWidth: 420, border: '1px solid #e8e4de' },
  errorIcon:        { width: 48, height: 48, background: '#fde8e8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#b03030', margin: '0 auto 16px', fontWeight: 900 },
  errorTitle:       { fontSize: 18, fontWeight: 700, color: '#333', margin: '0 0 10px' },
  errorBody:        { fontSize: 14, color: '#666', margin: '0 0 8px', lineHeight: 1.6 },
  errorHint:        { fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.6 },
};
