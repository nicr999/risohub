/**
 * authService.ts
 * Backend authentication service — Node.js/Express layer.
 *
 * Covers:
 *   - Password hashing (bcrypt)
 *   - JWT access + refresh token issuance
 *   - Pre-auth token flow for 2FA
 *   - TOTP verification (otplib)
 *   - Password reset token generation
 *   - Audit logging of all auth events
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

export type UserRole = "Admin" | "Surveyor" | "Installer" | "Auditor";

// ─── Environment config ───────────────────────────────────────────────────────

const JWT_SECRET          = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_TTL    = "15m";
const REFRESH_TOKEN_TTL   = "7d";
const PRE_AUTH_TOKEN_TTL  = "5m";
const BCRYPT_ROUNDS       = 12;
const RESET_TOKEN_BYTES   = 32;
const RESET_TOKEN_TTL_MS  = 15 * 60 * 1000;

// Allow 1 step tolerance (30s window each side of the current period)
authenticator.options = { window: 1 };

// ─── DB interface ─────────────────────────────────────────────────────────────

interface DBUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  twoFactorEnabled: boolean;
  totpSecret: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

interface DBRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string;
  userAgent: string;
}

interface DBPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

// ─── Token payloads ───────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  twoFactorEnabled: boolean;
  twoFactorVerified: boolean;
  iat: number;
  exp: number;
}

export interface PreAuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  preAuth: true;
  iat: number;
  exp: number;
}

// ─── Auth service ─────────────────────────────────────────────────────────────

export class AuthService {
  constructor(
    private readonly db: {
      findUserByEmail(email: string): Promise<DBUser | null>;
      findUserById(id: string): Promise<DBUser | null>;
      updateUser(id: string, patch: Partial<DBUser>): Promise<void>;
      saveRefreshToken(data: Omit<DBRefreshToken, "id">): Promise<void>;
      findRefreshToken(tokenHash: string): Promise<DBRefreshToken | null>;
      revokeRefreshToken(id: string): Promise<void>;
      revokeAllUserRefreshTokens(userId: string): Promise<void>;
      savePasswordResetToken(data: Omit<DBPasswordResetToken, "id">): Promise<void>;
      findPasswordResetToken(tokenHash: string): Promise<DBPasswordResetToken | null>;
      markPasswordResetTokenUsed(id: string): Promise<void>;
    },
    private readonly auditLog: {
      log(entry: { userId: string; action: string; ipAddress: string; metadata?: object }): Promise<void>;
    }
  ) {}

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ipAddress: string
  ): Promise<{
    preAuthToken?: string;
    accessToken?: string;
    refreshToken?: string;
    twoFactorRequired: boolean;
    twoFactorSetupRequired?: boolean;
    user: Pick<DBUser, "id" | "name" | "email" | "role">;
  }> {
    const user = await this.db.findUserByEmail(email.toLowerCase().trim());

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error("Account temporarily locked. Please try again in 15 minutes.");
    }

    const dummyHash = "$2b$12$invalidhashfortimingnormalizationx";
    const passwordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !passwordValid || !user.active) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await this.db.updateUser(user.id, { failedLoginAttempts: attempts, lockedUntil });
        await this.auditLog.log({ userId: user.id, action: "auth.login.failed", ipAddress });
      }
      throw new Error("Incorrect email or password.");
    }

    await this.db.updateUser(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });

    // 2FA is required if: Admin role (always) OR user has explicitly enabled it
    // But only prompts the verify screen if a TOTP secret is already configured.
    // Admins without a secret configured get a full token + setup prompt in-app.
    const twoFactorExpected = user.role === "Admin" || user.twoFactorEnabled;
    const twoFactorConfigured = !!user.totpSecret;

    if (twoFactorExpected && twoFactorConfigured) {
      const preAuthToken = this.issuePreAuthToken(user);
      await this.auditLog.log({ userId: user.id, action: "auth.login.preauth", ipAddress });
      return {
        preAuthToken,
        twoFactorRequired: true,
        twoFactorSetupRequired: false,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    }

    // Issue full tokens — also covers first-time Admin who hasn't set up TOTP yet
    const { accessToken, refreshToken } = await this.issueTokenPair(user, ipAddress, "");
    await this.auditLog.log({ userId: user.id, action: "auth.login.success", ipAddress });
    return {
      accessToken,
      refreshToken,
      twoFactorRequired: false,
      // Signal the frontend to prompt 2FA setup if the user is expected to have it
      twoFactorSetupRequired: twoFactorExpected && !twoFactorConfigured,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  // ─── 2FA verification ────────────────────────────────────────────────────────

  async verify2FA(
    preAuthToken: string,
    totpCode: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: DBUser }> {
    let payload: PreAuthTokenPayload;
    try {
      payload = jwt.verify(preAuthToken, JWT_SECRET) as PreAuthTokenPayload;
    } catch {
      throw new Error("Invalid or expired session. Please sign in again.");
    }

    if (!payload.preAuth) throw new Error("Invalid token type.");

    const user = await this.db.findUserById(payload.sub);
    if (!user || !user.active) throw new Error("Account not found or inactive.");
    if (!user.totpSecret) throw new Error("2FA not configured for this account.");

    const valid = authenticator.verify({ token: totpCode, secret: user.totpSecret });

    if (!valid) {
      await this.auditLog.log({ userId: user.id, action: "auth.2fa.failed", ipAddress });
      throw new Error("Invalid or expired code. Please try again.");
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user, ipAddress, userAgent);
    await this.auditLog.log({ userId: user.id, action: "auth.2fa.success", ipAddress });

    const decoded = jwt.decode(accessToken) as { exp: number };
    return {
      accessToken,
      refreshToken,
      expiresIn: decoded.exp - Math.floor(Date.now() / 1000),
      user,
    };
  }

  // ─── TOTP setup ──────────────────────────────────────────────────────────────
  // Generates a new secret + QR code. Does NOT save to DB yet — call confirm2FA to commit.

  async setup2FA(userId: string): Promise<{ otpauthUrl: string; secret: string; qrCodeDataUrl: string }> {
    const user = await this.db.findUserById(userId);
    if (!user) throw new Error("User not found.");

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, "RISO HUB", secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 2 });

    return { otpauthUrl, secret, qrCodeDataUrl };
  }

  // ─── Confirm 2FA setup ───────────────────────────────────────────────────────
  // Verifies the user's first code against the pending secret, then saves it.

  async confirm2FA(userId: string, secret: string, code: string, ipAddress: string): Promise<void> {
    const valid = authenticator.verify({ token: code, secret });
    if (!valid) throw new Error("Invalid code. Please check your authenticator app and try again.");

    await this.db.updateUser(userId, { totpSecret: secret, twoFactorEnabled: true });
    await this.auditLog.log({ userId, action: "auth.2fa.enabled", ipAddress });
  }

  // ─── Disable 2FA ─────────────────────────────────────────────────────────────
  // Requires current password + current TOTP code to prevent account takeover.

  async disable2FA(userId: string, password: string, code: string, ipAddress: string): Promise<void> {
    const user = await this.db.findUserById(userId);
    if (!user) throw new Error("User not found.");

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) throw new Error("Incorrect password.");

    if (!user.totpSecret) throw new Error("2FA is not currently enabled.");

    const valid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!valid) throw new Error("Invalid TOTP code.");

    await this.db.updateUser(userId, { totpSecret: null, twoFactorEnabled: false });
    await this.auditLog.log({ userId, action: "auth.2fa.disabled", ipAddress });
  }

  // ─── Token refresh ───────────────────────────────────────────────────────────

  async refreshAccessToken(
    rawRefreshToken: string,
    ipAddress: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    const stored = await this.db.findRefreshToken(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored) await this.db.revokeAllUserRefreshTokens(stored.userId);
      throw new Error("Invalid or expired session. Please sign in again.");
    }

    const user = await this.db.findUserById(stored.userId);
    if (!user || !user.active) throw new Error("Account not found.");

    await this.db.revokeRefreshToken(stored.id);
    const { accessToken, refreshToken } = await this.issueTokenPair(user, ipAddress, "");

    await this.auditLog.log({ userId: user.id, action: "auth.token.refreshed", ipAddress });
    return { accessToken, refreshToken };
  }

  // ─── Sign out ────────────────────────────────────────────────────────────────

  async signOut(userId: string, rawRefreshToken: string, ipAddress: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    const stored = await this.db.findRefreshToken(tokenHash);
    if (stored) await this.db.revokeRefreshToken(stored.id);
    await this.auditLog.log({ userId, action: "auth.signout", ipAddress });
  }

  // ─── Password reset ──────────────────────────────────────────────────────────

  async requestPasswordReset(email: string): Promise<{ rawToken: string; userName: string } | null> {
    const user = await this.db.findUserByEmail(email.toLowerCase().trim());
    if (!user) return null;

    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await this.db.savePasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      usedAt: null,
    });

    return { rawToken, userName: user.name };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const record = await this.db.findPasswordResetToken(tokenHash);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error("Reset link is invalid or has expired. Please request a new one.");
    }

    if (newPassword.length < 12) {
      throw new Error("Password must be at least 12 characters.");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.updateUser(record.userId, { passwordHash });
    await this.db.markPasswordResetTokenUsed(record.id);
    await this.db.revokeAllUserRefreshTokens(record.userId);
  }

  // ─── Token helpers ────────────────────────────────────────────────────────────

  private issuePreAuthToken(user: DBUser): string {
    const payload: Omit<PreAuthTokenPayload, "iat" | "exp"> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      preAuth: true,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: PRE_AUTH_TOKEN_TTL });
  }

  private async issueTokenPair(
    user: DBUser,
    ipAddress: string,
    userAgent: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: Omit<AccessTokenPayload, "iat" | "exp"> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorVerified: user.twoFactorEnabled || user.role === "Admin",
    };

    const accessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    await this.db.saveRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      ipAddress,
      userAgent,
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  // ─── Token verification (used by middleware) ──────────────────────────────────

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
    } catch (err) {
      if ((err as Error).name === "TokenExpiredError") {
        throw new Error("Session expired. Please sign in again.");
      }
      throw new Error("Invalid session token.");
    }
  }
}
