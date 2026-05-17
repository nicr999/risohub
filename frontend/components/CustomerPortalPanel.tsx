// ============================================================
// RISO HUB — components/CustomerPortalPanel.tsx
// Staff-facing panel inside ProjectDetailPage.
//
// Shows:
//   - Current portal link status (active / none)
//   - Send / Resend portal invite button
//   - Copy portal link to clipboard
//   - Revoke link (Admin only)
//
// Add to ProjectDetailPage.tsx:
//   import CustomerPortalPanel from '../components/CustomerPortalPanel';
//   // In TABS array:
//   { id: 'portal', label: 'Customer Portal' }
//   // In tab render:
//   {activeTab === 'portal' && (
//     <CustomerPortalPanel
//       projectId={project.id}
//       customerEmail={project.customerEmail}
//       token={token}
//       userRole={user.role}
//     />
//   )}
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface Props {
  projectId:     string | number;
  customerEmail: string;
  token:         string;  // JWT
  userRole:      string;
}

interface PortalStatus {
  active:     boolean;
  expiresAt?: string;
}

export default function CustomerPortalPanel({ projectId, customerEmail, token, userRole }: Props) {
  const [status,   setStatus]   = useState<PortalStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState('');
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/portal/${projectId}/status`, { headers });
      setStatus(res.data);
    } catch {
      setStatus({ active: false });
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSend = async () => {
    setError('');
    setSending(true);
    try {
      const res = await axios.post(`/api/portal/${projectId}/invite`, {}, { headers });
      setPortalUrl(res.data.portalUrl);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to send portal invite');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this portal link? The customer will no longer be able to access their documents via this link.')) return;
    setError('');
    setRevoking(true);
    try {
      await axios.delete(`/api/portal/${projectId}/revoke`, { headers });
      setPortalUrl(null);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to revoke link');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async () => {
    const url = portalUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const expiryLabel = status?.expiresAt
    ? new Date(status.expiresAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <h2 style={s.title}>Customer Portal</h2>
        <p style={s.subtitle}>
          Send the customer a secure link to view their signed documents and system information — no login required.
        </p>
      </div>

      {loading ? (
        <div style={s.loadingRow}>Loading…</div>
      ) : (
        <>
          {/* Status card */}
          <div style={{ ...s.statusCard, borderColor: status?.active ? '#b8d4c4' : '#dbd2c4' }}>
            <div style={s.statusRow}>
              <span style={{
                ...s.statusDot,
                background: status?.active ? '#4a9a6a' : '#ccc',
              }} />
              <span style={s.statusText}>
                {status?.active
                  ? `Portal link active — expires ${expiryLabel}`
                  : 'No active portal link'}
              </span>
            </div>

            {customerEmail && (
              <div style={s.emailRow}>
                <span style={s.emailLabel}>Customer email</span>
                <span style={s.emailValue}>{customerEmail}</span>
              </div>
            )}
          </div>

          {/* New link generated this session */}
          {portalUrl && (
            <div style={s.urlBlock}>
              <div style={s.urlLabel}>Portal link (sent to customer)</div>
              <div style={s.urlRow}>
                <div style={s.urlText}>{portalUrl}</div>
                <button onClick={handleCopy} style={s.copyBtn}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {error && <div style={s.error}>{error}</div>}

          {/* Actions */}
          <div style={s.actions}>
            <button
              onClick={handleSend}
              disabled={sending}
              style={{ ...s.primaryBtn, opacity: sending ? 0.7 : 1 }}
            >
              {sending
                ? 'Sending…'
                : status?.active
                ? 'Resend portal invite'
                : 'Send portal invite'}
            </button>

            {status?.active && userRole === 'Admin' && (
              <button
                onClick={handleRevoke}
                disabled={revoking}
                style={{ ...s.dangerBtn, opacity: revoking ? 0.7 : 1 }}
              >
                {revoking ? 'Revoking…' : 'Revoke link'}
              </button>
            )}
          </div>

          <div style={s.note}>
            <strong>How it works</strong><br />
            An email is sent to the customer with a secure, personal link valid for 90 days.
            The link gives read-only access to their signed documents, MCS registration,
            system design figures and EPC rating. No account is required.<br /><br />
            Resending generates a new link and invalidates the old one.
            Only signed documents are available to download.
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth:      680,
  },
  header: {
    marginBottom:  24,
  },
  title: {
    fontSize:      18,
    fontWeight:    700,
    color:         '#333',
    margin:        '0 0 6px',
  },
  subtitle: {
    fontSize:      14,
    color:         '#888',
    margin:        0,
    lineHeight:    1.6,
  },
  loadingRow: {
    color:    '#aaa',
    fontSize: 14,
    padding:  '16px 0',
  },
  statusCard: {
    border:       '1px solid #dbd2c4',
    borderRadius: 10,
    padding:      '16px 20px',
    marginBottom: 16,
    background:   '#fafaf8',
  },
  statusRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    marginBottom: 10,
  },
  statusDot: {
    width:        10,
    height:       10,
    borderRadius: '50%',
    flexShrink:   0,
  },
  statusText: {
    fontSize:   14,
    fontWeight: 600,
    color:      '#444',
  },
  emailRow: {
    display:   'flex',
    gap:       12,
    fontSize:  13,
    color:     '#888',
  },
  emailLabel: {
    fontWeight: 600,
    textTransform:'uppercase',
    letterSpacing:'0.05em',
    fontSize:   11,
    color:      '#aaa',
  },
  emailValue: {
    color: '#555',
  },
  urlBlock: {
    background:   '#f0f1ec',
    borderRadius: 8,
    padding:      '14px 16px',
    marginBottom: 16,
  },
  urlLabel: {
    fontSize:     11,
    fontWeight:   700,
    color:        '#888',
    letterSpacing:'0.06em',
    textTransform:'uppercase',
    marginBottom: 8,
  },
  urlRow: {
    display:    'flex',
    gap:        10,
    alignItems: 'flex-start',
  },
  urlText: {
    flex:       1,
    fontSize:   12,
    color:      '#555',
    fontFamily: 'monospace',
    wordBreak:  'break-all',
    lineHeight: 1.5,
  },
  copyBtn: {
    background:   '#7A8465',
    color:        '#fff',
    border:       'none',
    borderRadius: 6,
    padding:      '6px 14px',
    fontSize:     12,
    fontWeight:   700,
    cursor:       'pointer',
    flexShrink:   0,
    whiteSpace:   'nowrap',
  },
  error: {
    background:   '#fde8e8',
    color:        '#8b2020',
    borderRadius: 8,
    padding:      '12px 16px',
    fontSize:     13,
    marginBottom: 16,
  },
  actions: {
    display:   'flex',
    gap:       10,
    flexWrap:  'wrap',
    marginBottom: 24,
  },
  primaryBtn: {
    background:   '#7A8465',
    color:        '#fff',
    border:       'none',
    borderRadius: 8,
    padding:      '11px 22px',
    fontSize:     14,
    fontWeight:   700,
    cursor:       'pointer',
  },
  dangerBtn: {
    background:   'transparent',
    color:        '#b03030',
    border:       '1px solid #e8c0c0',
    borderRadius: 8,
    padding:      '11px 22px',
    fontSize:     14,
    fontWeight:   600,
    cursor:       'pointer',
  },
  note: {
    fontSize:   13,
    color:      '#aaa',
    lineHeight: 1.7,
    background: '#f7f7f5',
    borderRadius: 8,
    padding:    '14px 16px',
  },
};
