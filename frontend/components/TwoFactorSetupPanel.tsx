// TwoFactorSetupPanel.tsx
// Enable / disable TOTP-based 2FA for the logged-in user.
// Rendered inside SettingsPage (security section) and shown as a banner
// for Admin users who haven't configured 2FA yet.

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupResponse {
  secret:       string;
  otpauthUrl:   string;
  qrCodeDataUrl: string;
}

type Panel = "idle" | "enabling" | "confirming" | "disabling" | "done_enabled" | "done_disabled";

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeader(): HeadersInit {
  const token = localStorage.getItem("riso_access_token") ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiSetup2FA(): Promise<SetupResponse> {
  const res = await fetch("/api/auth/setup-2fa", { method: "POST", headers: authHeader() });
  if (!res.ok) throw new Error("Failed to start 2FA setup.");
  return res.json();
}

async function apiConfirm2FA(secret: string, code: string): Promise<void> {
  const res = await fetch("/api/auth/confirm-2fa", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ secret, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to confirm 2FA.");
}

async function apiDisable2FA(password: string, code: string): Promise<void> {
  const res = await fetch("/api/auth/disable-2fa", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ password, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to disable 2FA.");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CodeInput({ onComplete }: { onComplete: (code: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [values, setValues] = useState(["", "", "", "", "", ""]);

  const handleInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...values];
    next[idx] = digit;
    setValues(next);
    if (next.every(v => v)) onComplete(next.join(""));
    else onComplete("");
    if (digit && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split("");
      setValues(next);
      onComplete(pasted);
      refs.current[5]?.focus();
      e.preventDefault();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8 }} onPaste={handlePaste}>
      {values.map((v, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={v}
          onChange={e => handleInput(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          style={{
            width: 40, height: 48,
            fontSize: 18, fontWeight: 700, textAlign: "center",
            border: `1px solid ${v ? "#7A8465" : "#DBD2C4"}`,
            borderRadius: 8, color: "#333", background: "#fff", outline: "none",
            fontFamily: "'Satoshi', sans-serif",
          }}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

function Btn({ onClick, disabled, loading, children, variant = "primary" }: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "danger" | "ghost";
}) {
  const bg = variant === "primary" ? "#7A8465" : variant === "danger" ? "#b03030" : "transparent";
  const color = variant === "ghost" ? "#7A8465" : "#fff";
  const border = variant === "ghost" ? "1px solid #DBD2C4" : "none";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        fontFamily: "'Satoshi', sans-serif", fontSize: 13, fontWeight: 700,
        padding: "10px 18px", borderRadius: 8, border,
        background: disabled || loading ? (variant === "ghost" ? "transparent" : "#C9C8BE") : bg,
        color: disabled || loading ? "#aaa" : color,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {loading && (
        <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "rh-spin .7s linear infinite" }} />
      )}
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TwoFactorSetupPanelProps {
  enabled: boolean;              // current 2FA status for this user
  onStatusChange?: (enabled: boolean) => void;
  compact?: boolean;             // show as a compact banner (for post-login setup prompt)
}

export default function TwoFactorSetupPanel({ enabled, onStatusChange, compact }: TwoFactorSetupPanelProps) {
  const [panel, setPanel] = useState<Panel>("idle");
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const startSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiSetup2FA();
      setSetup(data);
      setPanel("enabling");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmSetup = useCallback(async () => {
    if (!setup || code.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await apiConfirm2FA(setup.secret, code);
      setPanel("done_enabled");
      onStatusChange?.(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setup, code, onStatusChange]);

  const confirmDisable = useCallback(async () => {
    if (!password || disableCode.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await apiDisable2FA(password, disableCode);
      setPanel("done_disabled");
      onStatusChange?.(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [password, disableCode, onStatusChange]);

  const reset = () => {
    setPanel("idle");
    setSetup(null);
    setCode("");
    setPassword("");
    setDisableCode("");
    setError(null);
    setShowSecret(false);
  };

  const S = compact ? compactStyle : cardStyle;

  // ── Done states ──

  if (panel === "done_enabled") {
    return (
      <div style={S.wrap}>
        <div style={S.row}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={S.title}>Two-factor authentication enabled</div>
            <div style={S.sub}>Your account is now protected with TOTP. You'll be asked for a code each time you sign in.</div>
          </div>
        </div>
      </div>
    );
  }

  if (panel === "done_disabled") {
    return (
      <div style={S.wrap}>
        <div style={S.row}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={S.title}>Two-factor authentication disabled</div>
            <div style={S.sub}>Your account no longer requires a TOTP code at sign-in.</div>
          </div>
          {!compact && (
            <Btn onClick={startSetup} loading={loading} variant="primary">Re-enable</Btn>
          )}
        </div>
        {error && <div style={S.error}>{error}</div>}
      </div>
    );
  }

  // ── Enabling: show QR + confirm ──

  if (panel === "enabling" && setup) {
    return (
      <div style={S.wrap}>
        <style>{`@keyframes rh-spin { to { transform: rotate(360deg) } }`}</style>
        <div style={S.title}>Scan this QR code</div>
        <div style={S.sub}>Open Google Authenticator, Authy, or another TOTP app and scan the code below.</div>

        <div style={{ textAlign: "center", margin: "16px 0" }}>
          <img
            src={setup.qrCodeDataUrl}
            alt="TOTP QR Code"
            style={{ width: 180, height: 180, borderRadius: 8, border: "1px solid #DBD2C4" }}
          />
        </div>

        <button
          onClick={() => setShowSecret(s => !s)}
          style={{ background: "none", border: "none", color: "#7A8465", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          {showSecret ? "Hide" : "Can't scan? Show"} manual entry key
        </button>

        {showSecret && (
          <div style={{ background: "#f5f5f2", borderRadius: 8, padding: "10px 12px", fontFamily: "monospace", fontSize: 13, letterSpacing: 2, marginBottom: 12, wordBreak: "break-all", color: "#333" }}>
            {setup.secret}
          </div>
        )}

        <div style={S.sub}>Then enter the 6-digit code your app shows:</div>
        <div style={{ margin: "12px 0" }}>
          <CodeInput onComplete={setCode} />
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={confirmSetup} disabled={code.length < 6} loading={loading} variant="primary">
            Confirm and enable
          </Btn>
          <Btn onClick={reset} variant="ghost">Cancel</Btn>
        </div>
      </div>
    );
  }

  // ── Disabling: password + code ──

  if (panel === "disabling") {
    return (
      <div style={S.wrap}>
        <style>{`@keyframes rh-spin { to { transform: rotate(360deg) } }`}</style>
        <div style={S.title}>Disable two-factor authentication</div>
        <div style={S.sub}>Enter your current password and a live authenticator code to confirm.</div>

        <div style={{ margin: "12px 0 8px" }}>
          <label style={S.label}>Current password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            style={S.input}
            placeholder="••••••••••••"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Authenticator code</label>
          <CodeInput onComplete={setDisableCode} />
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={confirmDisable} disabled={!password || disableCode.length < 6} loading={loading} variant="danger">
            Disable 2FA
          </Btn>
          <Btn onClick={reset} variant="ghost">Cancel</Btn>
        </div>
      </div>
    );
  }

  // ── Idle: show status + action ──

  return (
    <div style={S.wrap}>
      <style>{`@keyframes rh-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <div style={S.row}>
            <span style={{ fontSize: compact ? 18 : 20 }}>{enabled ? "🔐" : "🔓"}</span>
            <div>
              <div style={S.title}>
                Two-factor authentication
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "3px 8px",
                  borderRadius: 10, background: enabled ? "#d4eddf" : "#fde8a8",
                  color: enabled ? "#1a6040" : "#6b4800",
                }}>
                  {enabled ? "ENABLED" : "NOT SET UP"}
                </span>
              </div>
              <div style={S.sub}>
                {enabled
                  ? "Your account requires a TOTP code at every sign-in."
                  : compact
                  ? "Admin accounts must have 2FA enabled. Please set it up now."
                  : "Add an extra layer of security using Google Authenticator or Authy."}
              </div>
            </div>
          </div>
        </div>
        <div>
          {enabled ? (
            <Btn onClick={() => setPanel("disabling")} variant="ghost">Disable</Btn>
          ) : (
            <Btn onClick={startSetup} loading={loading} variant="primary">
              {compact ? "Set up 2FA" : "Enable 2FA"}
            </Btn>
          )}
        </div>
      </div>
      {error && <div style={S.error}>{error}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const base = {
  title: { fontSize: 14, fontWeight: 700, color: "#222", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  sub:   { fontSize: 13, color: "#555", lineHeight: 1.55 } as React.CSSProperties,
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 6 },
  input: { width: "100%", fontFamily: "'Satoshi', sans-serif", fontSize: 13, padding: "9px 12px", border: "1px solid #C8C0B4", borderRadius: 8, color: "#222", background: "#fff", outline: "none", boxSizing: "border-box" as const },
  error: { fontSize: 13, color: "#b03030", marginTop: 4 } as React.CSSProperties,
  row:   { display: "flex", alignItems: "flex-start", gap: 12 } as React.CSSProperties,
};

const cardStyle = {
  ...base,
  wrap: { background: "#fff", border: "1px solid #DBD2C4", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column" as const, gap: 10 } as React.CSSProperties,
};

const compactStyle = {
  ...base,
  wrap: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column" as const, gap: 8 } as React.CSSProperties,
};
