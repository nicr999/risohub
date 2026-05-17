import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "Admin" | "Surveyor" | "Installer" | "Auditor";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
}

type AuthScreen = "login" | "2fa" | "forgot" | "setup-prompt";

// ─── API helpers ──────────────────────────────────────────────────────────────

interface LoginResponse {
  preAuthToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  twoFactorRequired: boolean;
  twoFactorSetupRequired?: boolean;
  user: Pick<AuthUser, "name" | "email" | "role">;
}

interface VerifyResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
  expiresIn?: number;
}

async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new Error("Incorrect email or password.");
  if (res.status === 429) throw new Error("Too many attempts — please wait 15 minutes.");
  if (!res.ok) throw new Error("Sign in failed. Please try again.");
  return res.json();
}

async function apiVerify2FA(preAuthToken: string, code: string): Promise<VerifyResponse> {
  const res = await fetch("/api/auth/verify-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preAuthToken, code }),
  });
  if (res.status === 401) throw new Error("Invalid or expired code. Please try again.");
  if (!res.ok) throw new Error("Verification failed. Please try again.");
  return res.json();
}

async function apiRequestPasswordReset(email: string): Promise<void> {
  await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  // Always succeeds silently (avoid email enumeration)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div style={{ width: 44, height: 44, background: "#7A8465", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, margin: "0 auto 14px", fontFamily: "'Satoshi', sans-serif" }}>
      RH
    </div>
  );
}

function StepDots({ active }: { active: 0 | 1 }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }}>
      {[0, 1].map(i => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === active ? "#7A8465" : "#DBD2C4", transition: "background .2s" }} />
      ))}
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div style={{ fontSize: 11, color: "#b03030", marginTop: 4 }}>{message}</div>;
}

function PrimaryButton({ onClick, disabled, loading, children }: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        fontFamily: "'Satoshi', sans-serif",
        fontSize: 13, fontWeight: 700,
        padding: "11px 0", borderRadius: 8,
        border: "none",
        background: disabled || loading ? "#C9C8BE" : "#7A8465",
        color: "#fff",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "background .15s",
      }}
    >
      {loading && (
        <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "rh-spin .7s linear infinite" }} />
      )}
      {children}
    </button>
  );
}

// ─── 2FA digit input ──────────────────────────────────────────────────────────

function TwoFactorInput({ onChange }: { onChange: (code: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [values, setValues] = useState(["", "", "", "", "", ""]);

  const handleInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...values];
    next[idx] = digit;
    setValues(next);
    onChange(next.join(""));
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
      onChange(pasted);
      refs.current[5]?.focus();
      e.preventDefault();
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }} onPaste={handlePaste}>
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
            width: 44, height: 52,
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 20, fontWeight: 700,
            textAlign: "center",
            border: `1px solid ${v ? "#7A8465" : "#DBD2C4"}`,
            borderRadius: 8, color: "#333", background: "#fff",
            outline: "none", transition: "border-color .15s",
          }}
          aria-label={`Digit ${i + 1} of 6`}
        />
      ))}
    </div>
  );
}

// ─── Screen: Login ────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: {
  onSuccess: (res: LoginResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password);
      onSuccess(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess]);

  return (
    <div style={css.card}>
      <div style={css.cardHead}>
        <LogoMark />
        <div style={css.cardTitle}>Sign in to RISO HUB</div>
        <div style={css.cardSub}>MCS compliance management for RISO HOME</div>
      </div>
      <div style={css.cardBody}>
        <StepDots active={0} />
        <div>
          <label style={css.fieldLabel}>Email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="you@risohome.co.uk"
            autoComplete="email"
            style={{ ...css.input, ...(error ? { borderColor: "#f0a0a0" } : {}) }}
          />
        </div>
        <div>
          <label style={css.fieldLabel}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ ...css.input, ...(error ? { borderColor: "#f0a0a0" } : {}) }}
          />
        </div>
        <FieldError message={error} />
        <PrimaryButton onClick={handleSubmit} loading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </PrimaryButton>
      </div>
      <div style={css.cardFoot}>
        Problems signing in?{" "}
        <a href="mailto:support@risohome.co.uk" style={css.footLink}>Contact support</a>
      </div>
    </div>
  );
}

// ─── Screen: 2FA ──────────────────────────────────────────────────────────────

function TwoFactorScreen({ preAuthToken, onSuccess, onBack }: {
  preAuthToken: string;
  onSuccess: (tokens: VerifyResponse) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiVerify2FA(preAuthToken, code);
      onSuccess(res);
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setLoading(false);
    }
  }, [code, preAuthToken, onSuccess]);

  return (
    <div style={css.card}>
      <div style={css.cardHead}>
        <LogoMark />
        <div style={css.cardTitle}>Two-factor verification</div>
        <div style={css.cardSub}>Enter the 6-digit code from your authenticator app</div>
      </div>
      <div style={css.cardBody}>
        <StepDots active={1} />
        <TwoFactorInput onChange={v => { setCode(v); if (error) setError(null); }} />
        <FieldError message={error} />
        <div style={{ background: "#f0f1ec", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#5a6348", lineHeight: 1.6 }}>
          2FA is mandatory for Admin accounts. Your code resets every 30 seconds. Paste supported.
        </div>
        <PrimaryButton onClick={handleVerify} disabled={code.length < 6} loading={loading}>
          {loading ? "Verifying…" : "Verify"}
        </PrimaryButton>
        <div style={{ textAlign: "center", fontSize: 12, color: "#aaa" }}>
          <span style={css.footLink} onClick={onBack}>← Back to sign in</span>
        </div>
      </div>
    </div>
  );
}

// ─── Screen: Forgot password ──────────────────────────────────────────────────

function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async () => {
    setLoading(true);
    await apiRequestPasswordReset(email.trim());
    setLoading(false);
    setSent(true);
    setTimeout(onBack, 3000);
  }, [email, onBack]);

  return (
    <div style={css.card}>
      <div style={css.cardHead}>
        <LogoMark />
        <div style={css.cardTitle}>Reset password</div>
        <div style={css.cardSub}>Enter your email and we'll send a reset link</div>
      </div>
      <div style={css.cardBody}>
        {sent ? (
          <div style={{ background: "#e8f5f0", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#2a7a5a", textAlign: "center" }}>
            Reset link sent — check your inbox.
          </div>
        ) : (
          <>
            <div>
              <label style={css.fieldLabel}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@risohome.co.uk" style={css.input} />
            </div>
            <PrimaryButton onClick={handleSend} disabled={!email.trim()} loading={loading}>
              Send reset link
            </PrimaryButton>
          </>
        )}
        <div style={{ textAlign: "center", fontSize: 12, color: "#aaa" }}>
          <span style={css.footLink} onClick={onBack}>← Back to sign in</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main LoginPage component ─────────────────────────────────────────────────

interface LoginPageProps {
  onAuthenticated: (user: AuthUser, accessToken: string, refreshToken?: string, setupRequired?: boolean) => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [screen, setScreen] = useState<AuthScreen>("login");
  const [preAuthToken, setPreAuthToken] = useState("");

  const handleLoginSuccess = useCallback((res: LoginResponse) => {
    if (res.twoFactorRequired && res.preAuthToken) {
      setPreAuthToken(res.preAuthToken);
      setScreen("2fa");
      return;
    }
    if (res.accessToken) {
      onAuthenticated(res.user as AuthUser, res.accessToken, undefined, res.twoFactorSetupRequired);
    }
  }, [onAuthenticated]);

  const handleVerifySuccess = useCallback((res: VerifyResponse) => {
    onAuthenticated(res.user, res.accessToken);
  }, [onAuthenticated]);

  return (
    <>
      <style>{`@keyframes rh-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "#F5F5F2", borderRadius: 12 }}>
        {screen === "login" && (
          <LoginScreen onSuccess={handleLoginSuccess} />
        )}
        {screen === "2fa" && (
          <TwoFactorScreen
            preAuthToken={preAuthToken}
            onSuccess={handleVerifySuccess}
            onBack={() => setScreen("login")}
          />
        )}
        {screen === "forgot" && (
          <ForgotScreen onBack={() => setScreen("login")} />
        )}
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const css: Record<string, React.CSSProperties> = {
  card: { background: "#fff", borderRadius: 14, border: "1px solid #DBD2C4", width: "100%", maxWidth: 380, overflow: "hidden" },
  cardHead: { padding: "28px 28px 20px", textAlign: "center", borderBottom: "1px solid #f0f1ec" },
  cardTitle: { fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 4 },
  cardSub: { fontSize: 13, color: "#666" },
  cardBody: { padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 },
  cardFoot: { padding: "14px 28px 20px", borderTop: "1px solid #f0f1ec", textAlign: "center", fontSize: 13, color: "#666" },
  fieldLabel: { display: "block", fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 },
  input: { width: "100%", fontFamily: "'Satoshi', sans-serif", fontSize: 13, padding: "9px 12px", border: "1px solid #DBD2C4", borderRadius: 8, color: "#333", background: "#fff", outline: "none" },
  footLink: { color: "#7A8465", fontWeight: 500, cursor: "pointer", textDecoration: "none" },
};
