/**
 * SignaturePage.tsx
 *
 * Public-facing page — no JWT auth required.
 * Customer / installer opens a link like:
 *   https://app.risohome.co.uk/sign?token=<one-time-token>
 *
 * Flow:
 *   1. Validate token  →  GET /api/signatures/:token/info
 *   2. Show document preview + legal consent copy
 *   3. Customer draws signature on canvas pad
 *   4. Submit            →  POST /api/signatures/:token/sign
 *   5. Show confirmation with download link
 *
 * Mount this as a standalone route in your router, outside AuthGuard:
 *   <Route path="/sign" element={<SignaturePage />} />
 *
 * Uses react-signature-canvas for the drawing pad.
 * Install: npm install react-signature-canvas
 *          npm install --save-dev @types/react-signature-canvas
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import SignatureCanvas from "react-signature-canvas";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = "loading" | "invalid" | "expired" | "already-signed" | "ready" | "submitting" | "done" | "declined";

interface SignatureInfo {
  id: string;
  customerName: string;
  address: string;
  projectType: "ASHP" | "GSHP";
  documentTitle: string;
  documentUrl: string;   // Presigned S3 URL for preview iframe
  role: string;          // "customer" | "installer"
  expiresAt: string;
  companyName: string;
  companyLogoUrl?: string;
  mcsNumber: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function getGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RHLogo({ size = 40 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, background: "#7A8465", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: size * 0.36, letterSpacing: "-0.03em", fontFamily: "Satoshi, sans-serif" }}>RH</span>
    </div>
  );
}

function StateScreen({ icon, title, body, cta }: { icon: string; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div style={sp.centreWrap}>
      <div style={sp.stateIcon}>{icon}</div>
      <h2 style={sp.stateTitle}>{title}</h2>
      <p style={sp.stateBody}>{body}</p>
      {cta}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SignaturePage() {
  const token = getToken();
  const [state, setState]     = useState<PageState>("loading");
  const [info, setInfo]       = useState<SignatureInfo | null>(null);
  const [error, setError]     = useState("");
  const [consent, setConsent] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview]   = useState(false);

  const sigCanvasRef = useRef<SignatureCanvas | null>(null);

  // ── 1. Validate token ────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) { setState("invalid"); return; }

    fetch(`/api/signatures/${encodeURIComponent(token)}/info`)
      .then(r => {
        if (r.status === 404) { setState("invalid"); throw null; }
        if (r.status === 410) { setState("expired"); throw null; }
        if (r.status === 409) { setState("already-signed"); throw null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: SignatureInfo) => {
        setInfo(data);
        setState("ready");
      })
      .catch(err => { if (err) setState("invalid"); });
  }, [token]);

  // ── 2. Clear pad ────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    sigCanvasRef.current?.clear();
    setIsEmpty(true);
  }, []);

  // ── 3. Submit ────────────────────────────────────────────────────────────

  const handleSign = useCallback(async () => {
    if (!consent) { setError("Please check the consent box before signing."); return; }
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setError("Please draw your signature above."); return;
    }
    setError("");
    setState("submitting");

    const signatureData = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
    const gps = await getGPS();

    try {
      const res = await fetch(`/api/signatures/${encodeURIComponent(token!)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureData,
          consent: true,
          metadata: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            gps,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Submission failed");
      }

      const result = await res.json();
      setSignedPdfUrl(result.pdfUrl ?? null);
      setState("done");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      setState("ready");
    }
  }, [consent, token]);

  // ── 4. Decline ───────────────────────────────────────────────────────────

  const handleDecline = useCallback(async () => {
    if (!window.confirm("Are you sure you want to decline this document? The installation team will be notified.")) return;
    setState("submitting");
    try {
      await fetch(`/api/signatures/${encodeURIComponent(token!)}/decline`, { method: "POST" });
      setState("declined");
    } catch {
      setState("ready");
    }
  }, [token]);

  // ── Render states ────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div style={sp.page}>
        <div style={sp.centreWrap}>
          <div style={sp.spinner} />
          <p style={sp.stateBody}>Verifying your signature link…</p>
        </div>
      </div>
    );
  }

  if (state === "invalid") return <div style={sp.page}><StateScreen icon="⚠" title="Link not found" body="This signature link is invalid or has already been used. Please contact your installation team if you need a new link." /></div>;
  if (state === "expired") return <div style={sp.page}><StateScreen icon="⏱" title="Link expired" body="This signature link has expired. Please contact RISO HOME to request a new one." /></div>;
  if (state === "already-signed") return <div style={sp.page}><StateScreen icon="✓" title="Already signed" body="This document has already been signed. Thank you — your installation team has been notified." /></div>;
  if (state === "declined") return <div style={sp.page}><StateScreen icon="✕" title="Document declined" body="You have declined to sign this document. Your installation team has been notified and will be in touch." /></div>;

  if (state === "done") {
    return (
      <div style={sp.page}>
        <StateScreen
          icon="✓"
          title="Signature captured"
          body="Thank you — your signature has been securely recorded. A copy of the signed document will be emailed to you shortly."
          cta={
            signedPdfUrl ? (
              <a href={signedPdfUrl} target="_blank" rel="noopener noreferrer" style={sp.downloadBtn}>
                ↓ Download signed document
              </a>
            ) : undefined
          }
        />
      </div>
    );
  }

  // ── Main signing UI ──────────────────────────────────────────────────────

  const isSubmitting = state === "submitting";

  return (
    <div style={sp.page}>
      <div style={sp.card}>

        {/* Header */}
        <div style={sp.cardHeader}>
          <RHLogo size={38} />
          <div style={sp.headerText}>
            <div style={sp.brand}>RISO HOME</div>
            {info?.mcsNumber && <div style={sp.mcsNum}>MCS {info.mcsNumber}</div>}
          </div>
        </div>

        {/* Document info */}
        <div style={sp.docInfo}>
          <div style={sp.docTitle}>{info?.documentTitle ?? "Handover Document"}</div>
          <div style={sp.docMeta}>
            {info?.customerName} · {info?.address} · {info?.projectType}
          </div>
          <button style={sp.previewBtn} onClick={() => setShowPreview(v => !v)}>
            {showPreview ? "▲ Hide document" : "▼ Preview document"}
          </button>
          {showPreview && info?.documentUrl && (
            <iframe
              src={info.documentUrl}
              style={sp.docIframe}
              title="Handover document preview"
            />
          )}
        </div>

        <hr style={sp.divider} />

        {/* Signing role */}
        <div style={sp.signingAs}>
          Signing as: <strong>{info?.role === "customer" ? "Customer / Homeowner" : "Installer"}</strong>
        </div>

        {/* Canvas */}
        <div style={sp.canvasLabel}>Draw your signature below</div>
        <div style={sp.canvasWrap}>
          <SignatureCanvas
            ref={sigCanvasRef}
            penColor="#1a1a1a"
            canvasProps={{ style: sp.canvas, className: "sig-canvas" }}
            onBegin={() => setIsEmpty(false)}
          />
          {isEmpty && (
            <div style={sp.canvasPlaceholder}>Sign here with your mouse or finger</div>
          )}
        </div>
        <button style={sp.clearBtn} onClick={handleClear} disabled={isEmpty}>
          Clear
        </button>

        <hr style={sp.divider} />

        {/* Consent */}
        <label style={sp.consentLabel}>
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            style={sp.consentCheck}
          />
          <span style={sp.consentText}>
            I confirm that I have read and understood the handover document, that the information
            is accurate, and I consent to this electronic signature being legally binding under
            the Electronic Communications Act 2000.
          </span>
        </label>

        {/* Error */}
        {error && <div style={sp.errorMsg}>{error}</div>}

        {/* Actions */}
        <div style={sp.actions}>
          <button
            style={sp.declineBtn}
            onClick={handleDecline}
            disabled={isSubmitting}
          >
            Decline
          </button>
          <button
            style={{
              ...sp.signBtn,
              ...(isSubmitting || isEmpty || !consent ? sp.signBtnDisabled : {}),
            }}
            onClick={handleSign}
            disabled={isSubmitting || isEmpty || !consent}
          >
            {isSubmitting ? "Submitting…" : "Sign document →"}
          </button>
        </div>

        {/* Legal footer */}
        <div style={sp.legalFooter}>
          This signature is cryptographically hashed and time-stamped. Your IP address and
          device information are recorded for security purposes. Signed documents are retained
          for a minimum of 7 years in accordance with MCS MIS 3005.
        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sp: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F5F5F2",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "40px 16px 60px",
    fontFamily: "Satoshi, sans-serif",
    color: "#333",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 4px 40px rgba(0,0,0,0.08)",
    width: "100%",
    maxWidth: 580,
    padding: "32px 36px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  headerText: {},
  brand: { fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#333" },
  mcsNum: { fontSize: 11, color: "#9a9a8e", letterSpacing: "0.05em", marginTop: 2 },

  docInfo: { marginBottom: 20 },
  docTitle: { fontSize: 17, fontWeight: 700, color: "#333", marginBottom: 4, letterSpacing: "-0.01em" },
  docMeta: { fontSize: 13, color: "#888", marginBottom: 12 },
  previewBtn: {
    background: "none", border: "1px solid #e0ded8", borderRadius: 6,
    fontSize: 12, fontWeight: 600, color: "#7A8465", cursor: "pointer",
    padding: "5px 12px",
  },
  docIframe: {
    width: "100%", height: 360, border: "1px solid #e0ded8",
    borderRadius: 8, marginTop: 12,
  },

  divider: { border: "none", borderTop: "1px solid #f0f1ec", margin: "22px 0" },

  signingAs: { fontSize: 13, color: "#666", marginBottom: 14 },

  canvasLabel: {
    fontSize: 12, fontWeight: 600, color: "#999",
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
  },
  canvasWrap: {
    position: "relative",
    border: "2px solid #e0ded8",
    borderRadius: 10,
    background: "#fafaf8",
    overflow: "hidden",
    height: 180,
    marginBottom: 8,
  },
  canvas: {
    width: "100%",
    height: "100%",
    touchAction: "none",
  } as any,
  canvasPlaceholder: {
    position: "absolute",
    top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 13, color: "#ccc",
    pointerEvents: "none",
    userSelect: "none",
  },
  clearBtn: {
    background: "none", border: "none",
    fontSize: 12, color: "#aaa", cursor: "pointer",
    padding: "4px 0", marginBottom: 4,
  },

  consentLabel: {
    display: "flex", alignItems: "flex-start", gap: 10,
    marginBottom: 18, cursor: "pointer",
  },
  consentCheck: { marginTop: 3, accentColor: "#7A8465", flexShrink: 0, width: 16, height: 16 },
  consentText: { fontSize: 13, color: "#555", lineHeight: 1.5 },

  errorMsg: {
    background: "#fdf0f0", border: "1px solid #e8b4b4",
    color: "#a05050", borderRadius: 8,
    padding: "10px 14px", fontSize: 13, marginBottom: 16,
  },

  actions: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  declineBtn: {
    padding: "10px 20px", background: "none",
    border: "1px solid #e0ded8", borderRadius: 8,
    fontSize: 14, color: "#aaa", cursor: "pointer",
  },
  signBtn: {
    padding: "11px 26px", background: "#7A8465",
    color: "#fff", border: "none", borderRadius: 8,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    letterSpacing: "-0.01em",
  },
  signBtnDisabled: {
    background: "#c5c8bc",
    cursor: "not-allowed",
  },

  legalFooter: {
    marginTop: 24, fontSize: 11, color: "#bbb", lineHeight: 1.6,
    borderTop: "1px solid #f0f1ec", paddingTop: 16,
  },

  // State screens
  centreWrap: {
    textAlign: "center", maxWidth: 420, margin: "80px auto 0",
    padding: "0 24px",
  },
  stateIcon: { fontSize: 48, marginBottom: 20, opacity: 0.5 },
  stateTitle: { fontSize: 22, fontWeight: 700, color: "#333", margin: "0 0 10px", letterSpacing: "-0.02em" },
  stateBody: { fontSize: 14.5, color: "#777", lineHeight: 1.6, margin: "0 0 24px" },
  downloadBtn: {
    display: "inline-block", padding: "11px 24px",
    background: "#7A8465", color: "#fff",
    borderRadius: 8, fontSize: 14, fontWeight: 600,
    textDecoration: "none",
  },
  spinner: {
    width: 36, height: 36, border: "3px solid #e0ded8",
    borderTopColor: "#7A8465", borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 20px",
  },
};
