// ============================================================
// RISO HUB — pages/PartnerAcceptPage.tsx
// Public page — no auth required.
// Subcontractors land here from their invite email.
//
// Route: /partner-accept?token=...
// Add to RisoHub.jsx public route check:
//   if (path === '/partner-accept') return <PartnerAcceptPage />;
// ============================================================

import React, { useEffect, useState } from 'react';

type PageState = 'loading' | 'ready' | 'submitting' | 'done' | 'invalid' | 'expired';

interface InviteInfo {
  email: string;
  expiresAt: string;
  subcontractor: {
    id: number;
    name: string;
    company: string;
    trade: string;
  } | null;
}

export default function PartnerAcceptPage() {
  const [state,   setState]   = useState<PageState>('loading');
  const [info,    setInfo]    = useState<InviteInfo | null>(null);
  const [name,    setName]    = useState('');
  const [pass,    setPass]    = useState('');
  const [pass2,   setPass2]   = useState('');
  const [error,   setError]   = useState('');
  const [token,   setToken]   = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) { setState('invalid'); return; }

    fetch(`/api/partners/accept/${encodeURIComponent(t)}`)
      .then(async r => {
        if (r.status === 404) { setState('expired'); return; }
        if (!r.ok)            { setState('invalid'); return; }
        const data = await r.json();
        setInfo(data);
        setName(data.subcontractor?.name || '');
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (pass.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (pass !== pass2)  { setError('Passwords do not match'); return; }

    setState('submitting');
    try {
      const r = await fetch(`/api/partners/accept/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: pass }),
      });

      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Something went wrong');
        setState('ready');
        return;
      }

      setState('done');
    } catch {
      setError('Could not connect. Please try again.');
      setState('ready');
    }
  };

  const expiryLabel = info?.expiresAt
    ? new Date(info.expiresAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : '';

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <svg width="36" height="36" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <text x="21" y="33" textAnchor="middle"
              fontFamily="Georgia,'Times New Roman',serif"
              fontSize="30" fontWeight="400"
              fill="rgba(255,255,255,0.92)" letterSpacing="-1.2">RH</text>
          </svg>
          <div>
            <div style={s.brand}>RISO HOME</div>
            <div style={s.subBrand}>PARTNER PORTAL</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={s.content}>

        {state === 'loading' && (
          <div style={s.centre}>
            <div style={s.spinner} />
            <p style={s.muted}>Loading your invite…</p>
          </div>
        )}

        {state === 'invalid' && (
          <div style={s.card}>
            <div style={s.iconLg}>✕</div>
            <h2 style={s.title}>Invite not found</h2>
            <p style={s.body}>This invite link is not valid or has already been used. Please contact RISO HOME if you believe this is an error.</p>
          </div>
        )}

        {state === 'expired' && (
          <div style={s.card}>
            <div style={s.iconLg}>⏱</div>
            <h2 style={s.title}>Invite expired</h2>
            <p style={s.body}>This invite link has expired. Please ask RISO HOME to send you a new invite.</p>
          </div>
        )}

        {state === 'done' && (
          <div style={s.card}>
            <div style={{ ...s.iconLg, color: '#4a9a6a' }}>✓</div>
            <h2 style={s.title}>Account created</h2>
            <p style={s.body}>You can now sign in to RISO HUB with your email and password to access your assigned projects.</p>
            <a href="/login" style={s.btn}>Sign in →</a>
          </div>
        )}

        {(state === 'ready' || state === 'submitting') && info && (
          <div style={s.card}>
            <h2 style={s.title}>Create your RISO HUB account</h2>
            <p style={s.body}>
              You've been invited by RISO HOME to access project documents as a partner.
            </p>

            {/* Invite details */}
            <div style={s.infoBox}>
              {info.subcontractor && (
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Organisation</span>
                  <span style={s.infoVal}>{info.subcontractor.company || info.subcontractor.name}</span>
                </div>
              )}
              {info.subcontractor?.trade && (
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Trade</span>
                  <span style={s.infoVal}>{info.subcontractor.trade}</span>
                </div>
              )}
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Email</span>
                <span style={s.infoVal}>{info.email}</span>
              </div>
              <div style={s.infoRow}>
                <span style={s.infoLabel}>Invite expires</span>
                <span style={s.infoVal}>{expiryLabel}</span>
              </div>
            </div>

            {/* Form */}
            <div style={s.form}>
              <label style={s.label}>Your full name</label>
              <input
                style={s.input}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Smith"
                autoComplete="name"
              />

              <label style={s.label}>Choose a password</label>
              <input
                style={s.input}
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />

              <label style={s.label}>Confirm password</label>
              <input
                style={s.input}
                type="password"
                value={pass2}
                onChange={e => setPass2(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />

              {error && <div style={s.error}>{error}</div>}

              <button
                style={{ ...s.btn, opacity: state === 'submitting' ? 0.7 : 1, width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }}
                onClick={handleSubmit}
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Creating account…' : 'Create account →'}
              </button>
            </div>

            <p style={s.footnote}>
              By creating an account you agree to RISO HOME's data processing terms.
              Your access is limited to projects you are assigned to.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight:     '100vh',
    background:    '#F5F5F2',
    fontFamily:    "'Satoshi', 'Inter', Arial, sans-serif",
    color:         '#333',
    display:       'flex',
    flexDirection: 'column',
  },
  header: {
    background: '#7A8465',
    padding:    '16px 24px',
  },
  headerInner: {
    maxWidth:   480,
    margin:     '0 auto',
    display:    'flex',
    alignItems: 'center',
    gap:        12,
  },
  brand: {
    fontFamily:    "Georgia, 'Times New Roman', serif",
    fontSize:      14,
    fontWeight:    400,
    letterSpacing: '0.08em',
    color:         '#fff',
    lineHeight:    1,
  },
  subBrand: {
    fontSize:      10,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: '0.08em',
    marginTop:     3,
  },
  content: {
    flex:    1,
    maxWidth: 480,
    width:   '100%',
    margin:  '32px auto',
    padding: '0 16px 48px',
  },
  centre: {
    textAlign: 'center',
    padding:   '48px 0',
  },
  spinner: {
    width:        36,
    height:       36,
    border:       '3px solid #dbd2c4',
    borderTop:    '3px solid #7A8465',
    borderRadius: '50%',
    margin:       '0 auto 20px',
    animation:    'spin 0.8s linear infinite',
  },
  muted: {
    color:    '#aaa',
    fontSize: 14,
    margin:   0,
  },
  card: {
    background:   '#fff',
    borderRadius: 12,
    padding:      '28px 28px 24px',
    border:       '0.5px solid #e8e6e0',
  },
  iconLg: {
    fontSize:     40,
    marginBottom: 14,
    color:        '#333',
  },
  title: {
    fontSize:   20,
    fontWeight: 600,
    color:      '#222',
    margin:     '0 0 10px',
  },
  body: {
    fontSize:   14,
    color:      '#666',
    lineHeight: 1.6,
    margin:     '0 0 20px',
  },
  infoBox: {
    background:   '#f7f7f5',
    borderRadius: 8,
    padding:      '12px 14px',
    marginBottom: 20,
  },
  infoRow: {
    display:        'flex',
    justifyContent: 'space-between',
    gap:            12,
    padding:        '6px 0',
    borderBottom:   '0.5px solid #efefed',
    fontSize:       13,
  },
  infoLabel: {
    color:       '#aaa',
    fontWeight:  600,
    fontSize:    11,
    letterSpacing:'0.05em',
    textTransform:'uppercase',
    paddingTop:  2,
    flexShrink:  0,
  },
  infoVal: {
    color:     '#333',
    textAlign: 'right',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
  },
  label: {
    fontSize:      11,
    fontWeight:    600,
    color:         '#888',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginTop:     12,
    marginBottom:  5,
    display:       'block',
  },
  input: {
    width:        '100%',
    height:       40,
    border:       '1px solid #dbd2c4',
    borderRadius: 8,
    padding:      '0 12px',
    fontSize:     14,
    color:        '#333',
    background:   '#fafaf8',
    outline:      'none',
    boxSizing:    'border-box',
  },
  error: {
    background:   '#fde8e8',
    color:        '#8b2020',
    borderRadius: 8,
    padding:      '10px 14px',
    fontSize:     13,
    marginTop:    10,
  },
  btn: {
    marginTop:      16,
    background:     '#7A8465',
    color:          '#fff',
    border:         'none',
    borderRadius:   8,
    padding:        '12px 24px',
    fontSize:       14,
    fontWeight:     600,
    cursor:         'pointer',
    display:        'inline-block',
    textDecoration: 'none',
  },
  footnote: {
    fontSize:   12,
    color:      '#bbb',
    lineHeight: 1.6,
    marginTop:  18,
    margin:     '18px 0 0',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('partner-spin')) {
  const s2 = document.createElement('style');
  s2.id = 'partner-spin';
  s2.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s2);
}
