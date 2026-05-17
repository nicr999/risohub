/**
 * SignatureRequestPanel.tsx
 *
 * Mounted inside the Documents tab (or its own tab) once a document has been
 * generated. Lets a Surveyor / Admin:
 *   1. See existing signature requests and their statuses
 *   2. Send a new sign-off request to the customer or installer via email / SMS
 *   3. Manually verify a signature (Admin override)
 *   4. See the SHA-256 hash of each signed document for audit purposes
 *
 * Props:
 *   projectId  — current project UUID
 *   documentId — the generated document to be signed
 *   token      — JWT access token
 *   userRole   — "Admin" | "Surveyor" | "Installer" | "Auditor"
 */

import React, { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DeliveryMethod = "email" | "sms" | "both";
type SigStatus = "pending" | "signed" | "declined";

interface SignatureRequest {
  id: string;
  documentId: string;
  requestedBy: string;
  signedBy: string | null;
  role: string;
  status: SigStatus;
  signatureData: string | null; // Base64 PNG
  pdfUrl: string | null;
  hash: string | null;
  metadata: {
    ip?: string;
    userAgent?: string;
    gps?: { lat: number; lng: number };
    timestamp?: string;
  } | null;
  createdAt: string;
}

interface Props {
  projectId: string;
  documentId: string;
  token: string;
  userRole: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SigStatus, { label: string; color: string; bg: string }> = {
  pending:  { label: "Awaiting signature", color: "#8a7a50", bg: "#fdf6e3" },
  signed:   { label: "Signed",             color: "#4a7a5a", bg: "#edf7f1" },
  declined: { label: "Declined",           color: "#a05050", bg: "#fdf0f0" },
};

function truncateHash(hash: string | null) {
  if (!hash) return "—";
  return hash.slice(0, 8) + "…" + hash.slice(-8);
}

// ─── Send Request Modal ───────────────────────────────────────────────────────

function SendRequestModal({
  onClose,
  onSend,
  sending,
}: {
  onClose: () => void;
  onSend: (payload: {
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string;
    role: string;
    delivery: DeliveryMethod;
    message: string;
  }) => void;
  sending: boolean;
}) {
  const [recipientName, setRecipientName]   = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [role, setRole]                     = useState("customer");
  const [delivery, setDelivery]             = useState<DeliveryMethod>("email");
  const [message, setMessage]               = useState(
    "Please review and sign your heat pump installation handover document at the link below."
  );
  const [error, setError] = useState("");

  const validate = () => {
    if (!recipientName.trim()) return "Recipient name is required.";
    if ((delivery === "email" || delivery === "both") && !recipientEmail.trim())
      return "Email address is required.";
    if ((delivery === "sms" || delivery === "both") && !recipientPhone.trim())
      return "Phone number is required.";
    return "";
  };

  const handleSend = () => {
    const err = validate();
    if (err) { setError(err); return; }
    onSend({ recipientName, recipientEmail, recipientPhone, role, delivery, message });
  };

  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>
        <div style={ms.modalHeader}>
          <h2 style={ms.modalTitle}>Request Signature</h2>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>

        <div style={ms.field}>
          <label style={ms.label}>Signing as</label>
          <select style={ms.select} value={role} onChange={e => setRole(e.target.value)}>
            <option value="customer">Customer</option>
            <option value="installer">Installer</option>
            <option value="surveyor">Surveyor</option>
          </select>
        </div>

        <div style={ms.field}>
          <label style={ms.label}>Recipient name</label>
          <input style={ms.input} value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Jane Smith" />
        </div>

        <div style={ms.field}>
          <label style={ms.label}>Delivery method</label>
          <div style={ms.radioGroup}>
            {(["email", "sms", "both"] as DeliveryMethod[]).map(d => (
              <label key={d} style={ms.radioLabel}>
                <input type="radio" value={d} checked={delivery === d} onChange={() => setDelivery(d)} />
                {d === "email" ? "Email only" : d === "sms" ? "SMS only" : "Email + SMS"}
              </label>
            ))}
          </div>
        </div>

        {(delivery === "email" || delivery === "both") && (
          <div style={ms.field}>
            <label style={ms.label}>Email address</label>
            <input style={ms.input} type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
        )}

        {(delivery === "sms" || delivery === "both") && (
          <div style={ms.field}>
            <label style={ms.label}>Mobile number</label>
            <input style={ms.input} type="tel" value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} placeholder="+44 7700 900000" />
          </div>
        )}

        <div style={ms.field}>
          <label style={ms.label}>Message to recipient</label>
          <textarea style={ms.textarea} value={message} onChange={e => setMessage(e.target.value)} rows={3} />
        </div>

        {error && <div style={ms.errorMsg}>{error}</div>}

        <div style={ms.modalFooter}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={ms.sendBtn} onClick={handleSend} disabled={sending}>
            {sending ? "Sending…" : "Send signature request →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Signature Preview Drawer ─────────────────────────────────────────────────

function SignatureDrawer({ sig, onClose }: { sig: SignatureRequest; onClose: () => void }) {
  return (
    <div style={ms.overlay}>
      <div style={{ ...ms.modal, maxWidth: 480 }}>
        <div style={ms.modalHeader}>
          <h2 style={ms.modalTitle}>Signature Record</h2>
          <button onClick={onClose} style={ms.closeBtn}>✕</button>
        </div>

        {sig.signatureData && (
          <div style={sd.sigPreviewWrap}>
            <img src={sig.signatureData} alt="Captured signature" style={sd.sigPreview} />
          </div>
        )}

        <div style={sd.metaGrid}>
          <div style={sd.metaRow}>
            <span style={sd.metaKey}>Signed by</span>
            <span style={sd.metaVal}>{sig.signedBy ?? "—"}</span>
          </div>
          <div style={sd.metaRow}>
            <span style={sd.metaKey}>Role</span>
            <span style={sd.metaVal}>{sig.role}</span>
          </div>
          <div style={sd.metaRow}>
            <span style={sd.metaKey}>Timestamp</span>
            <span style={sd.metaVal}>
              {sig.metadata?.timestamp
                ? new Date(sig.metadata.timestamp).toLocaleString("en-GB")
                : "—"}
            </span>
          </div>
          <div style={sd.metaRow}>
            <span style={sd.metaKey}>IP address</span>
            <span style={sd.metaVal}>{sig.metadata?.ip ?? "—"}</span>
          </div>
          {sig.metadata?.gps && (
            <div style={sd.metaRow}>
              <span style={sd.metaKey}>GPS</span>
              <span style={sd.metaVal}>
                {sig.metadata.gps.lat.toFixed(5)}, {sig.metadata.gps.lng.toFixed(5)}
              </span>
            </div>
          )}
          <div style={sd.metaRow}>
            <span style={sd.metaKey}>Doc SHA-256</span>
            <span style={{ ...sd.metaVal, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
              {sig.hash ?? "—"}
            </span>
          </div>
        </div>

        {sig.pdfUrl && (
          <div style={{ marginTop: 20 }}>
            <a href={sig.pdfUrl} target="_blank" rel="noopener noreferrer" style={sd.downloadLink}>
              ↓ Download signed PDF
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SignatureRequestPanel({ projectId, documentId, token, userRole }: Props) {
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending]     = useState(false);
  const [toast, setToast]         = useState<string | null>(null);
  const [previewSig, setPreviewSig] = useState<SignatureRequest | null>(null);
  const [overrideId, setOverrideId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/signatures?projectId=${projectId}&documentId=${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRequests(data.signatures ?? []);
    } catch {
      /* silently fail — show empty state */
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId, token]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Poll every 15s for pending → signed transitions
  useEffect(() => {
    const hasPending = requests.some(r => r.status === "pending");
    if (!hasPending) return;
    const id = setInterval(fetchRequests, 15_000);
    return () => clearInterval(id);
  }, [requests, fetchRequests]);

  const handleSend = async (payload: any) => {
    setSending(true);
    try {
      const res = await fetch("/api/signatures/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId, documentId, ...payload }),
      });
      if (!res.ok) throw new Error();
      showToast("Signature request sent ✓");
      setShowModal(false);
      fetchRequests();
    } catch {
      showToast("Failed to send — please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleAdminOverride = async (sigId: string) => {
    setOverrideId(sigId);
    try {
      await fetch(`/api/signatures/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ signatureId: sigId, override: true }),
      });
      showToast("Admin override applied ✓");
      fetchRequests();
    } catch {
      showToast("Override failed — check audit log.");
    } finally {
      setOverrideId(null);
    }
  };

  const canRequest = ["Admin", "Surveyor"].includes(userRole);

  const allSigned = requests.length > 0 && requests.every(r => r.status === "signed");

  return (
    <div style={ps.wrap}>

      {/* Header */}
      <div style={ps.header}>
        <div>
          <h2 style={ps.title}>Sign-off Requests</h2>
          <p style={ps.subtitle}>
            {allSigned
              ? "All parties have signed. The handover document is complete."
              : "Send sign-off requests to the customer and installer."}
          </p>
        </div>
        {canRequest && (
          <button style={ps.primaryBtn} onClick={() => setShowModal(true)}>
            + New request
          </button>
        )}
      </div>

      {/* Status summary strip */}
      {requests.length > 0 && (
        <div style={ps.strip}>
          {(["customer", "installer"] as const).map(role => {
            const sig = requests.find(r => r.role === role);
            const cfg = sig ? STATUS_CONFIG[sig.status] : null;
            return (
              <div key={role} style={ps.stripItem}>
                <span style={ps.stripRole}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
                {cfg ? (
                  <span style={{ ...ps.statusPill, color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                ) : (
                  <span style={{ ...ps.statusPill, color: "#aaa", background: "#f5f5f2" }}>
                    Not requested
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Requests list */}
      {loading ? (
        <div style={ps.empty}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={ps.emptyState}>
          <div style={ps.emptyIcon}>✍</div>
          <p style={ps.emptyText}>No signature requests yet.</p>
          {canRequest && (
            <p style={ps.emptyHint}>Send a request to the customer or installer to collect their digital signature.</p>
          )}
        </div>
      ) : (
        <div style={ps.list}>
          {requests.map(sig => {
            const cfg = STATUS_CONFIG[sig.status];
            return (
              <div key={sig.id} style={ps.card}>
                <div style={ps.cardLeft}>
                  <div style={ps.cardRole}>{sig.role.charAt(0).toUpperCase() + sig.role.slice(1)}</div>
                  {sig.signedBy && <div style={ps.cardSigner}>{sig.signedBy}</div>}
                  <div style={ps.cardDate}>
                    Requested {new Date(sig.createdAt).toLocaleDateString("en-GB")}
                  </div>
                  {sig.hash && (
                    <div style={ps.cardHash} title={sig.hash}>
                      SHA-256: {truncateHash(sig.hash)}
                    </div>
                  )}
                </div>
                <div style={ps.cardRight}>
                  <span style={{ ...ps.statusPill, color: cfg.color, background: cfg.bg, marginBottom: 10 }}>
                    {cfg.label}
                  </span>
                  <div style={ps.cardActions}>
                    {sig.status === "signed" && (
                      <button style={ps.ghostBtn} onClick={() => setPreviewSig(sig)}>
                        View record
                      </button>
                    )}
                    {sig.status === "signed" && sig.pdfUrl && (
                      <a href={sig.pdfUrl} target="_blank" rel="noopener noreferrer" style={ps.ghostBtn}>
                        ↓ PDF
                      </a>
                    )}
                    {sig.status !== "signed" && userRole === "Admin" && (
                      <button
                        style={{ ...ps.ghostBtn, color: "#a05050" }}
                        onClick={() => handleAdminOverride(sig.id)}
                        disabled={overrideId === sig.id}
                      >
                        {overrideId === sig.id ? "Overriding…" : "Admin override"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <SendRequestModal
          onClose={() => setShowModal(false)}
          onSend={handleSend}
          sending={sending}
        />
      )}
      {previewSig && (
        <SignatureDrawer sig={previewSig} onClose={() => setPreviewSig(null)} />
      )}

      {/* Toast */}
      {toast && <div style={ps.toast}>{toast}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ps: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "Satoshi, sans-serif", color: "#333" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 18, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" },
  subtitle: { fontSize: 13.5, color: "#777", margin: 0 },
  primaryBtn: {
    padding: "9px 18px", background: "#7A8465", color: "#fff",
    border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13.5,
    cursor: "pointer", whiteSpace: "nowrap",
  },
  strip: {
    display: "flex", gap: 12, marginBottom: 20,
    padding: "14px 18px", background: "#f7f7f4",
    border: "1px solid #e8e6e0", borderRadius: 10,
  },
  stripItem: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  stripRole: { fontSize: 13, fontWeight: 600, color: "#555", minWidth: 70 },
  statusPill: {
    display: "inline-block", padding: "3px 11px", borderRadius: 20,
    fontSize: 12, fontWeight: 600,
  },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", background: "#fff",
    border: "1px solid #e8e6e0", borderRadius: 10,
  },
  cardLeft: { display: "flex", flexDirection: "column", gap: 3 },
  cardRole: { fontSize: 14, fontWeight: 700, color: "#333" },
  cardSigner: { fontSize: 13, color: "#7A8465" },
  cardDate: { fontSize: 12, color: "#aaa" },
  cardHash: { fontSize: 11, color: "#bbb", fontFamily: "monospace", marginTop: 4 },
  cardRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 },
  cardActions: { display: "flex", gap: 8 },
  ghostBtn: {
    padding: "5px 12px", background: "none",
    border: "1px solid #e0ded8", borderRadius: 6,
    fontSize: 12, fontWeight: 600, color: "#555",
    cursor: "pointer", textDecoration: "none", display: "inline-block",
  },
  empty: { color: "#aaa", fontSize: 14, padding: "24px 0" },
  emptyState: {
    textAlign: "center", padding: "48px 24px",
    background: "#fafaf8", border: "1px dashed #d8d6ce",
    borderRadius: 10,
  },
  emptyIcon: { fontSize: 36, marginBottom: 12, opacity: 0.3 },
  emptyText: { fontSize: 15, fontWeight: 600, color: "#555", margin: "0 0 6px" },
  emptyHint: { fontSize: 13, color: "#aaa", margin: 0 },
  toast: {
    position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
    background: "#333", color: "#fff", padding: "11px 22px",
    borderRadius: 8, fontSize: 13.5, fontWeight: 500, zIndex: 9999,
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
  },
};

// Modal styles
const ms: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(2px)",
  },
  modal: {
    background: "#fff", borderRadius: 14, padding: "28px 32px",
    width: "100%", maxWidth: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  closeBtn: { background: "none", border: "none", fontSize: 18, color: "#aaa", cursor: "pointer" },
  field: { marginBottom: 18 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#777", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  input: { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", boxSizing: "border-box", outline: "none" },
  select: { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", background: "#fff", cursor: "pointer" },
  textarea: { width: "100%", padding: "9px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 14, color: "#333", boxSizing: "border-box", resize: "vertical", fontFamily: "Satoshi, sans-serif" },
  radioGroup: { display: "flex", gap: 16 },
  radioLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: "pointer" },
  errorMsg: { background: "#fdf0f0", border: "1px solid #e8b4b4", color: "#a05050", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { padding: "9px 18px", border: "1px solid #e0ded8", borderRadius: 8, background: "#fff", color: "#555", fontSize: 14, cursor: "pointer" },
  sendBtn: { padding: "9px 20px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" },
};

// Signature drawer styles
const sd: Record<string, React.CSSProperties> = {
  sigPreviewWrap: { background: "#f7f7f4", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid #e8e6e0" },
  sigPreview: { width: "100%", maxHeight: 160, objectFit: "contain", display: "block" },
  metaGrid: { display: "flex", flexDirection: "column", gap: 10 },
  metaRow: { display: "flex", justifyContent: "space-between", gap: 16, paddingBottom: 10, borderBottom: "1px solid #f0f1ec" },
  metaKey: { fontSize: 12, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 100 },
  metaVal: { fontSize: 13, color: "#333", textAlign: "right" },
  downloadLink: { display: "inline-block", padding: "9px 18px", background: "#7A8465", color: "#fff", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none" },
};
