// ============================================================
// RISO HUB — SignaturePage.tsx (v5 — polished)
// Public-facing customer signature page.
// Accessed via one-time token link in email.
// No auth required. Fully branded for customer trust.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

type PageState = 'loading' | 'ready' | 'signing' | 'signed' | 'declined' | 'already_signed' | 'expired' | 'error';

interface SigInfo {
  customerName: string;
  address: string;
  projectType: string;
  documentType: string;
  documentUrl: string;
  requestedBy: string;
}

export default function SignaturePage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<SigInfo | null>(null);
  const [error, setError] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  useEffect(() => {
    if (!token) { setState('error'); setError('Invalid link — no token found.'); return; }
    loadInfo();
  }, [token]);

  async function loadInfo() {
    try {
      const res = await axios.get(`/api/signatures/${token}/info`);
      setInfo(res.data);
      setState('ready');
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 410) setState(e.response.data?.error?.includes('already') ? 'already_signed' : 'expired');
      else { setState('error'); setError('Unable to load this signature request.'); }
    }
  }

  // ── Canvas drawing ─────────────────────────────────────────

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src = 'touches' in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function onStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#333';
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSig(true);
  }

  function onEnd() { isDrawing.current = false; }

  function clearSig() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  // ── Submit signature ───────────────────────────────────────

  async function handleSign() {
    if (!hasSig) return;
    setSubmitting(true);
    setState('signing');
    try {
      const canvas = canvasRef.current!;
      const signatureData = canvas.toDataURL('image/png');
      await axios.post(`/api/signatures/${token}/sign`, { signatureData });
      setState('signed');
    } catch {
      setState('error');
      setError('Something went wrong submitting your signature. Please try again or contact RISO HOME.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!declineReason.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/signatures/${token}/decline`, { reason: declineReason });
      setState('declined');
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}>RH</div>
          <div>
            <div style={s.brand}>RISO HOME</div>
            <div style={s.brandSub}>MCS Certified Heat Pump Installers</div>
          </div>
        </div>

        {/* Body */}
        <div style={s.body}>
          {state === 'loading' && <StatusView icon="⏳" title="Loading your document…" />}

          {state === 'error' && <StatusView icon="⚠️" title="Something went wrong" body={error} />}

          {state === 'expired' && (
            <StatusView icon="🕐" title="Link expired"
              body="This signature link has expired. Please contact RISO HOME to request a new one." />
          )}

          {state === 'already_signed' && (
            <StatusView icon="✅" title="Already signed"
              body="This document has already been signed. Thank you! Please contact RISO HOME if you have any questions." />
          )}

          {state === 'declined' && (
            <StatusView icon="✗" title="Signature declined"
              body="We've recorded your response. A member of the RISO HOME team will be in touch shortly." />
          )}

          {state === 'signed' && (
            <StatusView icon="✅" title="Thank you!"
              body="Your signature has been received and your handover document is now complete. RISO HOME will send you a copy for your records." />
          )}

          {(state === 'ready' || state === 'signing') && info && (
            <>
              {/* Document info */}
              <div style={s.docInfo}>
                <h2 style={s.docTitle}>
                  {info.documentType === 'handover' ? 'Handover Certificate'
                    : info.documentType === 'commissioning' ? 'Commissioning Record'
                    : 'Document'} — Signature Required
                </h2>
                <p style={s.intro}>
                  Your {info.projectType} installation has been completed by RISO HOME.
                  Please review the document and sign below to confirm you are satisfied with the work.
                </p>
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Customer</span>
                  <span>{info.customerName}</span>
                </div>
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Address</span>
                  <span>{info.address}</span>
                </div>
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Installation</span>
                  <span>{info.projectType}</span>
                </div>
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Prepared by</span>
                  <span>{info.requestedBy}</span>
                </div>
                {info.documentUrl && (
                  <a href={info.documentUrl} target="_blank" rel="noreferrer" style={s.viewDoc}>
                    📄 View full document before signing
                  </a>
                )}
              </div>

              {/* Signature canvas */}
              {!showDecline && (
                <>
                  <div style={s.sigSection}>
                    <div style={s.sigLabel}>Sign below</div>
                    <div style={s.canvasWrap}>
                      <canvas
                        ref={canvasRef}
                        width={480}
                        height={160}
                        style={s.canvas}
                        onMouseDown={onStart}
                        onMouseMove={onMove}
                        onMouseUp={onEnd}
                        onMouseLeave={onEnd}
                        onTouchStart={onStart}
                        onTouchMove={onMove}
                        onTouchEnd={onEnd}
                      />
                      {!hasSig && <div style={s.sigPlaceholder}>Draw your signature here</div>}
                    </div>
                    <button style={s.clearBtn} onClick={clearSig}>Clear</button>
                  </div>

                  <p style={s.declaration}>
                    By signing, I confirm that the {info.projectType} installation at {info.address} has been completed to my satisfaction
                    and in accordance with MCS standards. I understand that this document will be stored securely.
                  </p>

                  <div style={s.actionRow}>
                    <button
                      style={s.signBtn}
                      onClick={handleSign}
                      disabled={!hasSig || submitting}
                    >
                      {submitting ? 'Submitting…' : '✓ Submit Signature'}
                    </button>
                    <button style={s.declineLink} onClick={() => setShowDecline(true)}>
                      I want to decline
                    </button>
                  </div>
                </>
              )}

              {/* Decline flow */}
              {showDecline && (
                <div style={s.declineBox}>
                  <h3 style={s.declineTitle}>Decline signature</h3>
                  <p style={s.declineDesc}>Please let us know why you're declining. A member of our team will contact you.</p>
                  <textarea
                    style={s.declineInput}
                    placeholder="Please describe the issue…"
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={4}
                  />
                  {error && <div style={s.errorMsg}>{error}</div>}
                  <div style={s.declineActions}>
                    <button style={s.cancelBtn} onClick={() => setShowDecline(false)}>Go back</button>
                    <button
                      style={s.declineBtn}
                      onClick={handleDecline}
                      disabled={!declineReason.trim() || submitting}
                    >
                      {submitting ? 'Submitting…' : 'Submit Decline'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div>RISO HOME · MCS Certified · Reg. No. XXXXX</div>
          <div>Questions? Call us or email <a href="mailto:info@risohome.co.uk" style={{ color: '#7A8465' }}>info@risohome.co.uk</a></div>
        </div>
      </div>
    </div>
  );
}

// ── Status view helper ────────────────────────────────────────

function StatusView({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ fontSize: 20, color: '#333', margin: '0 0 12px' }}>{title}</h2>
      {body && <p style={{ fontSize: 14, color: '#666', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>{body}</p>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#F5F5F2', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', fontFamily: 'Satoshi, -apple-system, sans-serif' },
  card: { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', overflow: 'hidden' },
  header: { background: '#7A8465', padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 14 },
  logo: { width: 42, height: 42, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 },
  brand: { color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em' },
  brandSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  body: { padding: '28px' },
  docInfo: { marginBottom: 24 },
  docTitle: { fontSize: 18, fontWeight: 700, color: '#333', margin: '0 0 10px' },
  intro: { fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 16px' },
  detailRow: { display: 'flex', gap: 12, fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f5f5f0' },
  detailLabel: { fontWeight: 600, color: '#7A8465', minWidth: 100 },
  viewDoc: { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 13, color: '#7A8465', textDecoration: 'none', fontWeight: 600 },
  sigSection: { marginBottom: 16 },
  sigLabel: { fontSize: 12, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  canvasWrap: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e0e0d8', background: '#fafaf8' },
  canvas: { display: 'block', width: '100%', touchAction: 'none', cursor: 'crosshair' },
  sigPlaceholder: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ccc', fontSize: 13, pointerEvents: 'none', userSelect: 'none' },
  clearBtn: { marginTop: 6, fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  declaration: { fontSize: 11, color: '#aaa', lineHeight: 1.6, margin: '0 0 20px' },
  actionRow: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' },
  signBtn: { background: '#7A8465', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  declineLink: { background: 'none', border: 'none', color: '#bbb', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '4px 0' },
  declineBox: { background: '#fef9f9', border: '1px solid #fca5a5', borderRadius: 8, padding: 20 },
  declineTitle: { fontSize: 15, fontWeight: 700, color: '#333', margin: '0 0 8px' },
  declineDesc: { fontSize: 13, color: '#666', margin: '0 0 14px' },
  declineInput: { width: '100%', fontSize: 13, padding: '10px', border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', outline: 'none' },
  declineActions: { display: 'flex', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, padding: '9px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 },
  declineBtn: { flex: 1, padding: '9px', border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  errorMsg: { fontSize: 12, color: '#dc2626', marginTop: 8 },
  footer: { background: '#f0f1ec', padding: '14px 28px', fontSize: 11, color: '#aaa', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
};
