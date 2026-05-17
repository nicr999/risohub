// ============================================================
// RISO HUB — pages/CustomerPortalPage.tsx
// Public customer portal — no login required.
//
// Customer opens: https://app.risohome.co.uk/portal?token=...
//
// Displays:
//   - Project summary (address, type, MCS number)
//   - Signed documents with download buttons
//   - MCS registration details
//   - Heat loss summary figures
//   - EPC rating (current → potential)
//   - MIS 3005 compliance summary (pass rate, no item detail)
//   - Company contact details
//
// Mount as a standalone route outside AuthGuard in RisoHub.jsx:
//   <Route path="/portal" element={<CustomerPortalPage />} />
// ============================================================

import React, { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'ready' | 'invalid' | 'expired' | 'error';

interface PortalDocument {
  id:           string;
  docType:      string;
  version:      number;
  generatedAt:  string;
  sha256Hash:   string;
  signed:       boolean;
  signedAt:     string | null;
  presignedUrl: string | null;
}

interface ChecklistSummary {
  total:        number;
  complete:     number;
  noncompliant: number;
  na:           number;
  pending:      number;
}

interface PortalData {
  project: {
    customerName: string;
    address:      string;
    postcode:     string;
    projectType:  'ASHP' | 'GSHP';
    status:       string;
    assignee:     string | null;
  };
  documents:       PortalDocument[];
  checklistSummary: ChecklistSummary;
  mcsRegistration: { mcsNumber: string; registeredAt: string } | null;
  heatLoss: {
    softwareUsed:     string;
    heatDemandKW:     number;
    heatLossKW:       number;
    designFlowTemp:   number;
    designReturnTemp: number;
  } | null;
  epc: {
    currentEnergyRating:     string;
    potentialEnergyRating:   string;
    currentEnergyEfficiency: number;
    propertyType:            string;
  } | null;
  company: {
    name:       string;
    phone:      string;
    email:      string;
    address:    string;
    mcsNumber:  string;
    reccNumber: string;
    logoUrl:    string | null;
  };
  portalExpiresAt: string;
}

// ─── EPC rating helpers ───────────────────────────────────────────────────────

const EPC_COLOURS: Record<string, string> = {
  A: '#1a7a2a', B: '#4a9a35', C: '#8ab440',
  D: '#f0c030', E: '#e88020', F: '#d84020', G: '#c01010',
};

function EpcBadge({ rating }: { rating: string }) {
  return (
    <span style={{
      display:         'inline-block',
      background:      EPC_COLOURS[rating] ?? '#999',
      color:           '#fff',
      fontWeight:      700,
      fontSize:        18,
      width:           36,
      height:          36,
      lineHeight:      '36px',
      textAlign:       'center',
      borderRadius:    6,
      fontFamily:      'Arial, sans-serif',
    }}>
      {rating}
    </span>
  );
}

// ─── Doc type labels ──────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  handover:       'Handover Certificate',
  commissioning:  'Commissioning Report',
  riskassessment: 'Risk Assessment',
  final_pack:     'Final Pack',
  job_sheet:      'Job Sheet',
  recc_notice:    'RECC Notice',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CustomerPortalPage() {
  const [state,       setState]       = useState<PageState>('loading');
  const [data,        setData]        = useState<PortalData | null>(null);
  const [errMsg,      setErrMsg]      = useState('');
  const [liveStatus,  setLiveStatus]  = useState<string | null>(null);
  const [liveDocAdded, setLiveDocAdded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');

    if (!token) {
      setState('invalid');
      return;
    }

    // Initial data load
    fetch(`/api/portal/view/${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 410) { setState('expired'); return; }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setErrMsg(body.error ?? 'Something went wrong');
          setState('invalid');
          return;
        }
        const json = await r.json();
        setData(json);
        setState('ready');
      })
      .catch(() => {
        setErrMsg('Could not connect to the server. Please try again.');
        setState('error');
      });

    // WebSocket for live updates
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host.replace(/:\d+$/, '') + ':4000'; // API port
    const wsUrl  = `${wsProtocol}//${wsHost}/ws/portal?token=${encodeURIComponent(token)}`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Portal WS] Connected');
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'project.status_changed') {
            setLiveStatus(msg.newStatus);
            setData(prev => prev ? { ...prev, project: { ...prev.project, status: msg.newStatus } } : prev);
          }
          if (msg.type === 'document.added') {
            setLiveDocAdded(true);
            // Refetch portal data to get new document in list
            fetch(`/api/portal/view/${encodeURIComponent(token)}`)
              .then(r => r.ok ? r.json() : null)
              .then(json => { if (json) setData(json); });
          }
        } catch {}
      };

      ws.onclose = () => {
        // Reconnect after 5s (handles server restart / network blip)
        reconnectTimer = setTimeout(connect, 5_000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return (
    <div style={s.page}>
      <Header company={data?.company} />

      <div style={s.content}>
        {state === 'loading' && <LoadingState />}
        {state === 'invalid' && <ErrorState message={errMsg || 'This portal link is not valid or has been revoked.'} />}
        {state === 'expired' && <ErrorState message="This portal link has expired. Please contact your installer for a new link." expired />}
        {state === 'error'   && <ErrorState message={errMsg} />}
        {state === 'ready'   && data && (
          <>
            {liveStatus && (
              <div style={{
                margin: '16px 0 0',
                background: '#e8f5f0',
                border: '1px solid #9fd4b8',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 13,
                color: '#2a5a3a',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 16 }}>🔴</span>
                <span><strong>Live update:</strong> Your project status changed to <strong>{liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)}</strong>.</span>
              </div>
            )}
            {liveDocAdded && !liveStatus && (
              <div style={{
                margin: '16px 0 0',
                background: '#e8f0f8',
                border: '1px solid #9ab8d4',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 13,
                color: '#1a3a5a',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <span><strong>New document added</strong> — the document list has been refreshed.</span>
              </div>
            )}
            <PortalContent data={data} />
          </>
        )}
      </div>

      <Footer company={data?.company} />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ company }: { company?: PortalData['company'] }) {
  const SERIF = "Georgia, 'Times New Roman', serif";
  return (
    <div style={s.header}>
      <div style={s.headerInner}>
        <svg width="38" height="38" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
          <text x="21" y="33" textAnchor="middle" fontFamily={SERIF} fontSize="30" fontWeight="400" fill="rgba(255,255,255,0.92)" letterSpacing="-1.2">RH</text>
        </svg>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 400, letterSpacing: '0.1em', color: '#fff', lineHeight: 1 }}>
            {company?.name ?? 'RISO HOME'}
          </div>
          <div style={s.subBrand}>INSTALLATION DOCUMENTS</div>
        </div>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer({ company }: { company?: PortalData['company'] }) {
  return (
    <div style={s.footer}>
      <div style={s.footerInner}>
        {company?.name && <span>{company.name}</span>}
        {company?.mcsNumber && <span>MCS: {company.mcsNumber}</span>}
        {company?.phone && (
          <a href={`tel:${company.phone}`} style={s.footerLink}>{company.phone}</a>
        )}
        {company?.email && (
          <a href={`mailto:${company.email}`} style={s.footerLink}>{company.email}</a>
        )}
      </div>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={s.centreBlock}>
      <div style={s.spinner} />
      <p style={s.centreText}>Loading your documents…</p>
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

function ErrorState({ message, expired }: { message: string; expired?: boolean }) {
  return (
    <div style={s.centreBlock}>
      <div style={s.errorIcon}>{expired ? '⏱' : '✕'}</div>
      <h2 style={s.errorTitle}>{expired ? 'Link expired' : 'Link not found'}</h2>
      <p style={s.centreText}>{message}</p>
      <p style={{ ...s.centreText, fontSize: 13, color: '#aaa', marginTop: 24 }}>
        If you believe this is an error, please contact your installer directly.
      </p>
    </div>
  );
}

// ─── Main portal content ──────────────────────────────────────────────────────

function PortalContent({ data }: { data: PortalData }) {
  const { project, documents, checklistSummary, mcsRegistration, heatLoss, epc } = data;

  const signedDocs   = documents.filter(d => d.signed);
  const unsignedDocs = documents.filter(d => !d.signed);

  const complianceRate = checklistSummary.total > 0
    ? Math.round(
        (checklistSummary.complete /
          (checklistSummary.total - checklistSummary.na)) * 100
      )
    : 0;

  const expiresDate = new Date(data.portalExpiresAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div>
      {/* Project hero */}
      <div style={s.hero}>
        <div style={s.heroType}>{project.projectType === 'ASHP' ? 'Air Source Heat Pump' : 'Ground Source Heat Pump'}</div>
        <h1 style={s.heroName}>{project.address}, {project.postcode}</h1>
        <div style={s.heroMeta}>
          {mcsRegistration && (
            <span style={s.heroPill}>MCS {mcsRegistration.mcsNumber}</span>
          )}
          <span style={{ ...s.heroPill, background: '#e8ede0' }}>
            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
        </div>
        <p style={s.heroExpiry}>Portal link valid until {expiresDate}</p>
      </div>

      {/* Documents */}
      <Section title="Your Documents" icon="📄">
        {documents.length === 0 ? (
          <p style={s.emptyText}>No documents have been generated yet.</p>
        ) : (
          <div>
            {signedDocs.length > 0 && (
              <div style={s.docGroup}>
                <div style={s.docGroupLabel}>Signed documents</div>
                {signedDocs.map(doc => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </div>
            )}
            {unsignedDocs.length > 0 && (
              <div style={s.docGroup}>
                {signedDocs.length > 0 && <div style={s.docGroupLabel}>Other documents</div>}
                {unsignedDocs.map(doc => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* MCS Registration */}
      {mcsRegistration && (
        <Section title="MCS Registration" icon="🏅">
          <div style={s.infoGrid}>
            <InfoRow label="MCS Certificate Number" value={mcsRegistration.mcsNumber} mono />
            <InfoRow
              label="Registration Date"
              value={new Date(mcsRegistration.registeredAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
            />
            <InfoRow label="Scheme" value="Microgeneration Certification Scheme (MCS)" />
          </div>
        </Section>
      )}

      {/* MIS 3005 Compliance */}
      <Section title="MIS 3005 Compliance" icon="✓">
        <div style={s.complianceBlock}>
          <div style={s.compliancePct}>{isNaN(complianceRate) ? '—' : `${complianceRate}%`}</div>
          <div style={s.complianceBar}>
            <div style={{ ...s.complianceFill, width: `${complianceRate}%` }} />
          </div>
          <div style={s.complianceMeta}>
            <span style={s.chip}>{checklistSummary.complete} complete</span>
            {checklistSummary.noncompliant > 0 && (
              <span style={{ ...s.chip, background: '#fde8e8', color: '#b03030' }}>
                {checklistSummary.noncompliant} non-compliant
              </span>
            )}
            {checklistSummary.na > 0 && (
              <span style={{ ...s.chip, background: '#f0f0ee', color: '#888' }}>
                {checklistSummary.na} not applicable
              </span>
            )}
          </div>
          <p style={s.complianceNote}>
            Compliance is assessed against MCS MIS 3005 — the industry standard for heat pump installations.
          </p>
        </div>
      </Section>

      {/* Heat loss */}
      {heatLoss && (
        <Section title="System Design" icon="🌡">
          <div style={s.infoGrid}>
            <InfoRow label="Design Software"      value={heatLoss.softwareUsed} />
            <InfoRow label="Heat Demand"           value={`${heatLoss.heatDemandKW} kW`} />
            <InfoRow label="Total Heat Loss"       value={`${heatLoss.heatLossKW} kW`} />
            <InfoRow label="Design Flow Temp"      value={`${heatLoss.designFlowTemp}°C`} />
            <InfoRow label="Design Return Temp"    value={`${heatLoss.designReturnTemp}°C`} />
          </div>
        </Section>
      )}

      {/* EPC */}
      {epc && (
        <Section title="Energy Performance Certificate" icon="⚡">
          <div style={s.epcBlock}>
            <div style={s.epcRatings}>
              <div style={s.epcRatingGroup}>
                <div style={s.epcLabel}>Current rating</div>
                <div style={s.epcRatingRow}>
                  <EpcBadge rating={epc.currentEnergyRating} />
                  <span style={s.epcScore}>{epc.currentEnergyEfficiency} SAP</span>
                </div>
              </div>
              <div style={s.epcArrow}>→</div>
              <div style={s.epcRatingGroup}>
                <div style={s.epcLabel}>Potential rating</div>
                <div style={s.epcRatingRow}>
                  <EpcBadge rating={epc.potentialEnergyRating} />
                </div>
              </div>
            </div>
            {epc.propertyType && (
              <p style={s.epcNote}>Property type: {epc.propertyType}</p>
            )}
          </div>
        </Section>
      )}

      {/* Contact */}
      <Section title="Contact Your Installer" icon="📞">
        <div style={s.infoGrid}>
          {data.company.name    && <InfoRow label="Company"   value={data.company.name} />}
          {data.company.phone   && <InfoRow label="Phone"     value={data.company.phone} tel />}
          {data.company.email   && <InfoRow label="Email"     value={data.company.email} mailto />}
          {data.company.address && <InfoRow label="Address"   value={data.company.address} />}
        </div>
      </Section>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocRow({ doc }: { doc: PortalDocument }) {
  const label     = DOC_LABELS[doc.docType] ?? doc.docType;
  const genDate   = new Date(doc.generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const signedDate = doc.signedAt
    ? new Date(doc.signedAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <div style={s.docRow}>
      <div style={s.docInfo}>
        <div style={s.docTitle}>
          {label}
          {doc.version > 1 && <span style={s.docVersion}> v{doc.version}</span>}
        </div>
        <div style={s.docMeta}>
          Generated {genDate}
          {doc.signed && signedDate && ` · Signed ${signedDate}`}
        </div>
        {doc.sha256Hash && (
          <div style={s.docHash} title="Document integrity hash">
            SHA-256: {doc.sha256Hash.substring(0, 20)}…
          </div>
        )}
      </div>
      <div style={s.docActions}>
        {doc.signed && (
          <span style={s.signedBadge}>✓ Signed</span>
        )}
        {doc.presignedUrl ? (
          <a
            href={doc.presignedUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={s.downloadBtn}
          >
            ↓ Download
          </a>
        ) : (
          <span style={s.unavailable}>Unavailable</span>
        )}
      </div>
    </div>
  );
}

// ─── Reusable section wrapper ─────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHeader}>
        <span style={s.sectionIcon}>{icon}</span>
        <h2 style={s.sectionTitle}>{title}</h2>
      </div>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

// ─── Info row ────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono, tel, mailto }: {
  label: string; value: string; mono?: boolean; tel?: boolean; mailto?: boolean;
}) {
  const val = tel
    ? <a href={`tel:${value}`}     style={s.infoLink}>{value}</a>
    : mailto
    ? <a href={`mailto:${value}`}  style={s.infoLink}>{value}</a>
    : <span style={mono ? s.mono : undefined}>{value}</span>;

  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{val}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight:       '100vh',
    background:      '#F5F5F2',
    fontFamily:      "'Satoshi', 'Inter', Arial, sans-serif",
    color:           '#333333',
    display:         'flex',
    flexDirection:   'column',
  },
  header: {
    background:    '#7A8465',
    padding:       '20px 24px',
  },
  headerInner: {
    maxWidth:      680,
    margin:        '0 auto',
    display:       'flex',
    alignItems:    'center',
    gap:           14,
  },
  logo: {
    width:         40,
    height:        40,
    background:    'rgba(255,255,255,0.18)',
    borderRadius:  7,
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    fontWeight:    700,
    fontSize:      15,
    color:         '#fff',
    letterSpacing: '-0.03em',
    flexShrink:    0,
  },
  brand: {
    color:         '#fff',
    fontWeight:    700,
    fontSize:      15,
    letterSpacing: '0.05em',
  },
  subBrand: {
    color:         'rgba(255,255,255,0.65)',
    fontSize:      11,
    letterSpacing: '0.06em',
    marginTop:     2,
  },
  content: {
    flex:    1,
    maxWidth: 680,
    width:   '100%',
    margin:  '0 auto',
    padding: '0 16px 48px',
  },
  footer: {
    background:   '#f0f1ec',
    borderTop:    '1px solid #dbd2c4',
    padding:      '16px 24px',
    marginTop:    'auto',
  },
  footerInner: {
    maxWidth:     680,
    margin:       '0 auto',
    display:      'flex',
    gap:          20,
    flexWrap:     'wrap',
    fontSize:     12,
    color:        '#999',
  },
  footerLink: {
    color:          '#7A8465',
    textDecoration: 'none',
  },
  centreBlock: {
    textAlign: 'center',
    padding:   '64px 24px',
  },
  spinner: {
    width:        40,
    height:       40,
    border:       '3px solid #dbd2c4',
    borderTop:    '3px solid #7A8465',
    borderRadius: '50%',
    margin:       '0 auto 24px',
    animation:    'spin 0.8s linear infinite',
  },
  centreText: {
    color:    '#888',
    fontSize: 15,
    margin:   '0 auto',
    maxWidth: 400,
  },
  errorIcon: {
    fontSize:  48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize:  22,
    fontWeight: 600,
    color:     '#333',
    margin:    '0 0 12px',
  },
  // Hero
  hero: {
    background:   '#fff',
    borderRadius:  12,
    padding:      '32px 28px',
    margin:       '24px 0 0',
    boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
  },
  heroType: {
    fontSize:     12,
    fontWeight:   700,
    letterSpacing:'0.08em',
    color:        '#7A8465',
    textTransform:'uppercase',
    marginBottom: 8,
  },
  heroName: {
    fontSize:     24,
    fontWeight:   700,
    color:        '#222',
    margin:       '0 0 12px',
    lineHeight:   1.3,
  },
  heroMeta: {
    display:      'flex',
    gap:          8,
    flexWrap:     'wrap',
    marginBottom: 12,
  },
  heroPill: {
    background:   '#f0f1ec',
    color:        '#5a6350',
    fontSize:     12,
    fontWeight:   600,
    padding:      '4px 12px',
    borderRadius: 20,
  },
  heroExpiry: {
    fontSize:  12,
    color:     '#bbb',
    margin:    '8px 0 0',
  },
  // Section
  section: {
    background:   '#fff',
    borderRadius:  12,
    marginTop:    16,
    boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
    overflow:     'hidden',
  },
  sectionHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    padding:      '18px 24px 14px',
    borderBottom: '1px solid #f0f1ec',
  },
  sectionIcon: {
    fontSize:     18,
  },
  sectionTitle: {
    fontSize:     15,
    fontWeight:   700,
    color:        '#333',
    margin:       0,
  },
  sectionBody: {
    padding:      '16px 24px 20px',
  },
  emptyText: {
    color:    '#aaa',
    fontSize: 14,
    margin:   0,
  },
  // Info grid
  infoGrid: {
    display:       'flex',
    flexDirection: 'column',
    gap:           0,
  },
  infoRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    gap:            16,
    padding:        '10px 0',
    borderBottom:   '1px solid #f5f4f0',
    fontSize:       14,
  },
  infoLabel: {
    color:       '#888',
    fontWeight:  600,
    fontSize:    12,
    letterSpacing:'0.04em',
    textTransform:'uppercase',
    flexShrink:  0,
    paddingTop:  2,
  },
  infoValue: {
    color:     '#333',
    textAlign: 'right',
  },
  infoLink: {
    color:          '#7A8465',
    textDecoration: 'none',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize:   13,
  },
  // Documents
  docGroup: {
    marginBottom: 8,
  },
  docGroupLabel: {
    fontSize:     11,
    fontWeight:   700,
    letterSpacing:'0.07em',
    textTransform:'uppercase',
    color:        '#aaa',
    marginBottom: 8,
  },
  docRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    gap:            12,
    padding:        '12px 0',
    borderBottom:   '1px solid #f5f4f0',
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    fontWeight: 600,
    fontSize:   14,
    color:      '#333',
  },
  docVersion: {
    fontWeight: 400,
    color:      '#aaa',
    fontSize:   13,
  },
  docMeta: {
    fontSize:   12,
    color:      '#aaa',
    marginTop:  3,
  },
  docHash: {
    fontSize:   11,
    color:      '#ccc',
    fontFamily: 'monospace',
    marginTop:  4,
  },
  docActions: {
    display:    'flex',
    gap:        8,
    alignItems: 'center',
    flexShrink: 0,
  },
  signedBadge: {
    background:  '#edf7f1',
    color:       '#2a6a4a',
    fontSize:    11,
    fontWeight:  700,
    padding:     '3px 8px',
    borderRadius:12,
  },
  downloadBtn: {
    background:     '#7A8465',
    color:          '#fff',
    fontSize:       12,
    fontWeight:     700,
    padding:        '7px 14px',
    borderRadius:   8,
    textDecoration: 'none',
    display:        'inline-block',
    whiteSpace:     'nowrap',
  },
  unavailable: {
    color:    '#ccc',
    fontSize: 12,
  },
  // Compliance
  complianceBlock: {
    padding: '4px 0',
  },
  compliancePct: {
    fontSize:   36,
    fontWeight: 700,
    color:      '#7A8465',
    lineHeight: 1,
    marginBottom: 12,
  },
  complianceBar: {
    height:       8,
    background:   '#f0f1ec',
    borderRadius: 4,
    overflow:     'hidden',
    marginBottom: 12,
  },
  complianceFill: {
    height:       '100%',
    background:   '#7A8465',
    borderRadius: 4,
    transition:   'width 0.6s ease',
  },
  complianceMeta: {
    display:    'flex',
    gap:        8,
    flexWrap:   'wrap',
    marginBottom:12,
  },
  chip: {
    background:   '#f0f1ec',
    color:        '#5a6350',
    fontSize:     12,
    fontWeight:   600,
    padding:      '3px 10px',
    borderRadius: 12,
  },
  complianceNote: {
    fontSize: 12,
    color:    '#aaa',
    margin:   '8px 0 0',
    lineHeight:1.6,
  },
  // EPC
  epcBlock: {
    padding: '4px 0',
  },
  epcRatings: {
    display:    'flex',
    alignItems: 'center',
    gap:        24,
    marginBottom:12,
  },
  epcRatingGroup: {
    textAlign: 'center',
  },
  epcLabel: {
    fontSize:     11,
    color:        '#aaa',
    fontWeight:   700,
    letterSpacing:'0.06em',
    textTransform:'uppercase',
    marginBottom: 8,
  },
  epcRatingRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
  },
  epcScore: {
    fontSize:   15,
    color:      '#555',
    fontWeight: 600,
  },
  epcArrow: {
    fontSize: 24,
    color:    '#ccc',
  },
  epcNote: {
    fontSize:  12,
    color:     '#aaa',
    margin:    '4px 0 0',
  },
};

// Inject keyframe for spinner (only once)
if (typeof document !== 'undefined' && !document.getElementById('portal-spin-style')) {
  const style = document.createElement('style');
  style.id = 'portal-spin-style';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
