/**
 * authRoutes.ts
 * Express router for all /api/auth/* endpoints.
 * Mounted in app.ts as: app.use("/api/auth", authRouter)
 */

import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Op } from "sequelize";
import { AuthService } from "./authService";
import { createAuthenticate } from "./authMiddleware";
import { sendPasswordReset } from "../services/emailService";
import {
  User, RefreshToken, PasswordResetToken, AuditLog,
} from "../models/index";

// ─── Sequelize DB adapter ─────────────────────────────────────────────────────

const db: ConstructorParameters<typeof AuthService>[0] = {
  async findUserByEmail(email) {
    return User.findOne({ where: { email } }) as any;
  },
  async findUserById(id) {
    return User.findByPk(id) as any;
  },
  async updateUser(id, patch) {
    await User.update(patch as any, { where: { id } });
  },
  async saveRefreshToken(data) {
    await RefreshToken.create(data as any);
  },
  async findRefreshToken(tokenHash) {
    return RefreshToken.findOne({ where: { tokenHash } }) as any;
  },
  async revokeRefreshToken(id) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { id } });
  },
  async revokeAllUserRefreshTokens(userId) {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: { [Op.is]: null as any } } }
    );
  },
  async savePasswordResetToken(data) {
    await PasswordResetToken.create(data as any);
  },
  async findPasswordResetToken(tokenHash) {
    return PasswordResetToken.findOne({ where: { tokenHash } }) as any;
  },
  async markPasswordResetTokenUsed(id) {
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { id } });
  },
};

const auditLogAdapter: ConstructorParameters<typeof AuthService>[1] = {
  async log({ userId, action, ipAddress, metadata }) {
    await AuditLog.create({
      timestamp: new Date(),
      userId,
      action,
      entityType: "User",
      entityId: userId,
      ipAddress,
      metadata: metadata ?? null,
    } as any);
  },
};

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  (req.headers.cookie ?? "").split(";").forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("riso_refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("riso_refresh_token", { path: "/api/auth" });
}

// ─── CSRF helpers ─────────────────────────────────────────────────────────────

function setCsrfCookie(res: Response, token: string): void {
  res.cookie("riso_csrf", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearCsrfCookie(res: Response): void {
  res.clearCookie("riso_csrf", { path: "/" });
}

function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookieCsrf = parseCookies(req)["riso_csrf"];
  if (!cookieCsrf) { next(); return; } // No CSRF cookie — mobile/first-load, allow
  const headerCsrf = req.headers["x-csrf-token"] as string | undefined;
  if (cookieCsrf !== headerCsrf) {
    res.status(403).json({ error: "CSRF validation failed." });
    return;
  }
  next();
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many 2FA attempts. Please try again in 15 minutes." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please try again in 15 minutes." },
});

// ─── Service + middleware ─────────────────────────────────────────────────────

export const authService = new AuthService(db, auditLogAdapter);
const authenticate = createAuthenticate(authService);

// ─── Router ───────────────────────────────────────────────────────────────────

export function createAuthRouter(svc: AuthService) {
  const router = express.Router();
  const auth = createAuthenticate(svc);

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post("/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }
      const result = await svc.login(email, password, req.ip ?? "unknown");
      if (result.refreshToken) {
        setRefreshCookie(res, result.refreshToken);
        setCsrfCookie(res, crypto.randomBytes(32).toString("hex"));
      }
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/auth/verify-2fa ───────────────────────────────────────────────
  router.post("/verify-2fa", twoFaLimiter, async (req: Request, res: Response) => {
    try {
      const { preAuthToken, code } = req.body as { preAuthToken: string; code: string };
      if (!preAuthToken || !code) {
        res.status(400).json({ error: "preAuthToken and code are required." });
        return;
      }
      const result = await svc.verify2FA(
        preAuthToken, code,
        req.ip ?? "unknown",
        req.headers["user-agent"] ?? ""
      );
      setRefreshCookie(res, result.refreshToken);
      setCsrfCookie(res, crypto.randomBytes(32).toString("hex"));
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/auth/setup-2fa ────────────────────────────────────────────────
  // Returns a QR code data URL + raw secret. Nothing saved until confirm-2fa.
  router.post("/setup-2fa", auth, async (req: Request, res: Response) => {
    try {
      const result = await svc.setup2FA(req.user.sub);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/auth/confirm-2fa ──────────────────────────────────────────────
  // Saves the TOTP secret after the user proves the QR was scanned correctly.
  router.post("/confirm-2fa", twoFaLimiter, auth, async (req: Request, res: Response) => {
    try {
      const { secret, code } = req.body as { secret: string; code: string };
      if (!secret || !code) {
        res.status(400).json({ error: "secret and code are required." });
        return;
      }
      await svc.confirm2FA(req.user.sub, secret, code, req.ip ?? "unknown");
      res.json({ success: true, message: "Two-factor authentication is now enabled." });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/auth/disable-2fa ──────────────────────────────────────────────
  // Requires current password + live TOTP code to prevent account takeover.
  router.post("/disable-2fa", auth, async (req: Request, res: Response) => {
    try {
      const { password, code } = req.body as { password: string; code: string };
      if (!password || !code) {
        res.status(400).json({ error: "password and code are required." });
        return;
      }
      await svc.disable2FA(req.user.sub, password, code, req.ip ?? "unknown");
      res.json({ success: true, message: "Two-factor authentication has been disabled." });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/auth/refresh ──────────────────────────────────────────────────
  router.post("/refresh", verifyCsrf, async (req: Request, res: Response) => {
    try {
      const cookieToken = parseCookies(req)["riso_refresh_token"];
      const { refreshToken: bodyToken } = req.body as { refreshToken?: string };
      const refreshToken = cookieToken ?? bodyToken;
      if (!refreshToken) {
        res.status(400).json({ error: "Refresh token required." });
        return;
      }
      const result = await svc.refreshAccessToken(refreshToken, req.ip ?? "unknown");
      setRefreshCookie(res, result.refreshToken);
      setCsrfCookie(res, crypto.randomBytes(32).toString("hex"));
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message, code: "TOKEN_EXPIRED" });
    }
  });

  // ── POST /api/auth/logout ───────────────────────────────────────────────────
  router.post("/logout", verifyCsrf, auth, async (req: Request, res: Response) => {
    try {
      const cookieToken = parseCookies(req)["riso_refresh_token"];
      const { refreshToken: bodyToken } = req.body as { refreshToken?: string };
      const refreshToken = cookieToken ?? bodyToken ?? "";
      await svc.signOut(req.user.sub, refreshToken, req.ip ?? "unknown");
      clearRefreshCookie(res);
      clearCsrfCookie(res);
      res.json({ success: true });
    } catch {
      clearRefreshCookie(res);
      clearCsrfCookie(res);
      res.json({ success: true });
    }
  });

  // ── POST /api/auth/forgot-password ─────────────────────────────────────────
  router.post("/forgot-password", forgotPasswordLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email: string };
      if (email) {
        const result = await svc.requestPasswordReset(email);
        if (result) {
          const resetUrl = `${process.env.FRONTEND_URL ?? "https://app.risohub.co.uk"}/reset-password?token=${result.rawToken}`;
          await sendPasswordReset({
            to: email,
            recipientName: result.userName,
            resetUrl,
            expiresMinutes: 15,
          });
        }
      }
    } catch {
      // swallow — always return success to avoid email enumeration
    } finally {
      res.json({ success: true });
    }
  });

  // ── POST /api/auth/reset-password ──────────────────────────────────────────
  router.post("/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };
      if (!token || !newPassword) {
        res.status(400).json({ error: "Token and new password are required." });
        return;
      }
      await svc.resetPassword(token, newPassword);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  router.get("/me", auth, (req: Request, res: Response) => {
    res.json({
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      twoFactorEnabled: req.user.twoFactorEnabled,
      twoFactorVerified: req.user.twoFactorVerified,
    });
  });

  return router;
}

// Default export — pre-wired to Sequelize models, used by app.ts
export default createAuthRouter(authService);
