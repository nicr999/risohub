// ============================================================
// RISO HUB — SatisfactionSurveyPage.tsx
// Public-facing customer survey (no auth required)
// Route: /survey?token=xxx
// ============================================================

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SurveyInfo {
  customerName: string;
  address: string;
  projectType: string;
  status: string;
}

type Step = 'loading' | 'not_found' | 'already_done' | 'expired' | 'form' | 'submitted';

export default function SatisfactionSurveyPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [rating, setRating] = useState(0);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hovered, setHovered] = useState(0);

  useEffect(() => {
    if (!token) { setStep('not_found'); return; }
    axios.get(`/api/surveys/public/${token}`)
      .then(res => { setInfo(res.data); setStep('form'); })
      .catch(e => {
        const status = e.response?.status;
        const msg = e.response?.data?.error || '';
        if (status === 410 && msg.includes('already')) setStep('already_done');
        else if (status === 410 && msg.includes('expired')) setStep('expired');
        else setStep('not_found');
      });
  }, [token]);

  async function handleSubmit() {
    if (!rating) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/surveys/public/${token}`, { rating, npsScore, wouldRecommend, comments });
      setStep('submitted');
    } catch {
      setSubmitting(false);
    }
  }

  // ── States ─────────────────────────────────────────────────

  if (step === 'loading') return <Shell><div style={s.loading}>Loading your survey…</div></Shell>;

  if (step === 'not_found') return (
    <Shell>
      <div style={s.stateIcon}>🔍</div>
      <h2 style={s.stateTitle}>Survey not found</h2>
      <p style={s.stateDesc}>This survey link is invalid or has already been removed.</p>
    </Shell>
  );

  if (step === 'already_done') return (
    <Shell>
      <div style={s.stateIcon}>✅</div>
      <h2 style={s.stateTitle}>Already submitted</h2>
      <p style={s.stateDesc}>You've already completed this survey. Thank you for your feedback!</p>
    </Shell>
  );

  if (step === 'expired') return (
    <Shell>
      <div style={s.stateIcon}>⏰</div>
      <h2 style={s.stateTitle}>Survey expired</h2>
      <p style={s.stateDesc}>This survey link has expired. Please contact RISO HOME if you have any feedback.</p>
    </Shell>
  );

  if (step === 'submitted') return (
    <Shell>
      <div style={s.stateIcon}>🙏</div>
      <h2 style={s.stateTitle}>Thank you, {info?.customerName?.split(' ')[0]}!</h2>
      <p style={s.stateDesc}>Your feedback has been received and helps us improve our service.</p>
      <div style={s.thankYouBox}>
        <p style={s.thankYouText}>
          If you have any questions or concerns about your installation, please don't hesitate to contact us.
        </p>
        <div style={s.thankYouContact}>📧 hello@risohome.co.uk</div>
      </div>
    </Shell>
  );

  // ── Form ────────────────────────────────────────────────────

  return (
    <Shell>
      <div style={s.introSection}>
        <div style={s.installType}>{info?.projectType === 'ASHP' ? 'Air Source Heat Pump' : 'Ground Source Heat Pump'} Installation</div>
        <h2 style={s.formTitle}>How did we do, {info?.customerName?.split(' ')[0]}?</h2>
        <p style={s.formAddress}>{info?.address}</p>
      </div>

      {/* ── Star rating ── */}
      <div style={s.section}>
        <label style={s.sectionLabel}>Overall satisfaction <span style={s.required}>*</span></label>
        <div style={s.stars}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              style={{ ...s.star, color: n <= (hovered || rating) ? '#f59e0b' : '#ddd' }}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
            >
              ★
            </button>
          ))}
        </div>
        {rating > 0 && (
          <div style={s.ratingLabel}>
            {['', 'Poor', 'Below expectations', 'Satisfactory', 'Good', 'Excellent'][rating]}
          </div>
        )}
      </div>

      {/* ── NPS ── */}
      <div style={s.section}>
        <label style={s.sectionLabel}>How likely are you to recommend RISO HOME to a friend or neighbour?</label>
        <div style={s.npsRow}>
          {[...Array(11)].map((_, n) => (
            <button
              key={n}
              style={{
                ...s.npsBtn,
                ...(npsScore === n ? s.npsBtnActive : {}),
                ...(n <= 6 ? s.npsBtnRed : n <= 8 ? s.npsBtnYellow : s.npsBtnGreen),
              }}
              onClick={() => setNpsScore(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={s.npsScale}>
          <span style={s.npsLabel}>Not at all likely</span>
          <span style={s.npsLabel}>Extremely likely</span>
        </div>
      </div>

      {/* ── Recommend ── */}
      <div style={s.section}>
        <label style={s.sectionLabel}>Would you use RISO HOME again?</label>
        <div style={s.recommendRow}>
          {[{ val: true, label: '👍 Yes' }, { val: false, label: '👎 No' }].map(opt => (
            <button
              key={String(opt.val)}
              style={{ ...s.recommendBtn, ...(wouldRecommend === opt.val ? s.recommendBtnActive : {}) }}
              onClick={() => setWouldRecommend(opt.val)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Comments ── */}
      <div style={s.section}>
        <label style={s.sectionLabel}>Any other comments?</label>
        <textarea
          style={s.textarea}
          placeholder="Tell us what went well, or what we could improve…"
          value={comments}
          onChange={e => setComments(e.target.value)}
          rows={4}
        />
      </div>

      <button
        style={{ ...s.submitBtn, ...(!rating ? s.submitBtnDisabled : {}) }}
        onClick={handleSubmit}
        disabled={!rating || submitting}
      >
        {submitting ? 'Submitting…' : 'Submit feedback'}
      </button>

      <p style={s.privacyNote}>Your response is used by RISO HOME to improve our service and is kept confidential.</p>
    </Shell>
  );
}

// ── Shell layout ───────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo / header */}
        <div style={s.brandBar}>
          <div style={s.logoBox}>RH</div>
          <div style={s.brandName}>RISO HOME</div>
        </div>
        {children}
      </div>
      <div style={s.footer}>© RISO HOME · {new Date().getFullYear()}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#F5F5F2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'Satoshi, -apple-system, sans-serif' },
  card: { background: '#fff', borderRadius: 14, boxShadow: '0 2px 24px rgba(0,0,0,0.07)', padding: '32px 36px', maxWidth: 520, width: '100%' },
  brandBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #f0f0ec' },
  logoBox: { width: 36, height: 36, background: '#7A8465', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.05em' },
  brandName: { fontSize: 14, fontWeight: 700, color: '#7A8465', letterSpacing: '0.1em' },
  introSection: { marginBottom: 24 },
  installType: { fontSize: 11, fontWeight: 700, color: '#7A8465', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 },
  formTitle: { fontSize: 22, fontWeight: 700, color: '#333', margin: '0 0 6px' },
  formAddress: { fontSize: 13, color: '#888', margin: 0 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 14, fontWeight: 600, color: '#444', display: 'block', marginBottom: 10 },
  required: { color: '#ef4444' },
  stars: { display: 'flex', gap: 6 },
  star: { fontSize: 40, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, transition: 'color 0.1s' },
  ratingLabel: { fontSize: 13, color: '#7A8465', fontWeight: 600, marginTop: 6 },
  npsRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  npsBtn: { width: 36, height: 36, border: '1.5px solid #e0e0e0', borderRadius: 6, background: '#fafafa', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555', transition: 'all 0.1s' },
  npsBtnActive: { borderWidth: 2, fontWeight: 800, transform: 'scale(1.1)' },
  npsBtnRed: {},
  npsBtnYellow: {},
  npsBtnGreen: {},
  npsScale: { display: 'flex', justifyContent: 'space-between', marginTop: 6 },
  npsLabel: { fontSize: 11, color: '#bbb' },
  recommendRow: { display: 'flex', gap: 10 },
  recommendBtn: { flex: 1, padding: '10px', border: '1.5px solid #e0e0e0', borderRadius: 8, background: '#fafafa', cursor: 'pointer', fontSize: 14, color: '#555', transition: 'all 0.15s' },
  recommendBtnActive: { borderColor: '#7A8465', background: '#f0f1ec', color: '#7A8465', fontWeight: 600 },
  textarea: { width: '100%', fontSize: 13, padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', color: '#333', background: '#fafaf8' },
  submitBtn: { width: '100%', padding: '13px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 },
  submitBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  privacyNote: { fontSize: 11, color: '#bbb', textAlign: 'center', margin: 0 },
  stateIcon: { fontSize: 48, textAlign: 'center' as const, marginBottom: 16 },
  stateTitle: { fontSize: 20, fontWeight: 700, color: '#333', margin: '0 0 8px', textAlign: 'center' as const },
  stateDesc: { fontSize: 14, color: '#777', textAlign: 'center' as const, lineHeight: 1.6, margin: 0 },
  thankYouBox: { background: '#f0f1ec', borderRadius: 8, padding: '16px', marginTop: 20 },
  thankYouText: { fontSize: 13, color: '#555', margin: '0 0 8px', textAlign: 'center' as const },
  thankYouContact: { fontSize: 13, color: '#7A8465', fontWeight: 600, textAlign: 'center' as const },
  loading: { textAlign: 'center' as const, padding: '32px 0', color: '#888', fontSize: 14 },
  footer: { marginTop: 20, fontSize: 11, color: '#bbb' },
};
