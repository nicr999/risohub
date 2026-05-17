/**
 * authMiddleware.ts
 * Express middleware for JWT authentication and role-based access control.
 *
 * Usage:
 *   router.get("/projects", authenticate, authorize("Admin", "Surveyor"), handler)
 *   router.get("/projects/:id", authenticate, authorize("Admin", "Surveyor", "Installer", "Auditor"), handler)
 */

import { Request, Response, NextFunction } from "express";
import { AuthService, AccessTokenPayload, UserRole } from "./authService";

// ─── Extend Express Request ───────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Set by authenticate middleware — always present on protected routes */
      user: AccessTokenPayload;
    }
  }
}

// ─── authenticate ─────────────────────────────────────────────────────────────
// Extracts and verifies the JWT from the Authorization header.
// Attaches the decoded payload to req.user.

export function createAuthenticate(authService: AuthService) {
  return function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required.", code: "MISSING_TOKEN" });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = authService.verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (err) {
      const expired = (err as Error).message.includes("expired");
      res.status(401).json({
        error: (err as Error).message,
        code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      });
    }
  };
}

// ─── authorize ────────────────────────────────────────────────────────────────
// Role-based access control. Must come after authenticate.
// Pass the roles that are PERMITTED to access the route.

export function authorize(...roles: UserRole[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required.", code: "MISSING_TOKEN" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}.`,
        code: "INSUFFICIENT_ROLE",
      });
      return;
    }

    next();
  };
}

// ─── require2FA ───────────────────────────────────────────────────────────────
// Extra guard for routes that require verified 2FA even when it isn't mandatory.
// E.g. bulk-delete, export, settings changes.

export function require2FA(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.twoFactorVerified) {
    res.status(403).json({
      error: "Two-factor authentication is required to access this resource.",
      code: "2FA_REQUIRED",
    });
    return;
  }
  next();
}

// ─── adminOnly ────────────────────────────────────────────────────────────────
// Shorthand for routes that only Admins may access.

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  authorize("Admin")(req, res, next);
}

// ─── ownerOrAdmin ─────────────────────────────────────────────────────────────
// Allows the resource owner OR any Admin to proceed.
// resourceUserIdFn extracts the owning userId from the request.

export function ownerOrAdmin(
  resourceUserIdFn: (req: Request) => string | undefined
) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const resourceUserId = resourceUserIdFn(req);
    if (req.user.role === "Admin" || req.user.sub === resourceUserId) {
      next();
    } else {
      res.status(403).json({ error: "Access denied.", code: "INSUFFICIENT_ROLE" });
    }
  };
}

// ─── projectAssignee ──────────────────────────────────────────────────────────
// Installers can only access projects they are assigned to.
// Admins, Surveyors, and Auditors can access all projects.

export function projectAssignee(
  getAssignedUserId: (projectId: string) => Promise<string | null>
) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const { role, sub: userId } = req.user;

    if (role === "Admin" || role === "Surveyor" || role === "Auditor") {
      next();
      return;
    }

    if (role === "Installer") {
      const projectId = req.params.projectId ?? req.params.id;
      if (!projectId) {
        res.status(400).json({ error: "Project ID required." });
        return;
      }
      const assignedTo = await getAssignedUserId(projectId);
      if (assignedTo !== userId) {
        res.status(403).json({ error: "You are not assigned to this project.", code: "NOT_ASSIGNED" });
        return;
      }
      next();
      return;
    }

    res.status(403).json({ error: "Access denied.", code: "INSUFFICIENT_ROLE" });
  };
}

// ─── Pre-built authenticate singleton ────────────────────────────────────────
// Routes import `{ authenticate }` directly; this lazy singleton satisfies that
// contract without creating circular imports (models loaded via require at runtime).

let _singleton: ReturnType<typeof createAuthenticate> | null = null;

export const authenticate: import('express').RequestHandler = (req, res, next) => {
  if (!_singleton) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { User, RefreshToken, PasswordResetToken, AuditLog } = require('../models/index');
    const { Op } = require('sequelize');
    const db: ConstructorParameters<typeof AuthService>[0] = {
      async findUserByEmail(email: string) { return User.findOne({ where: { email } }) as any; },
      async findUserById(id: string) { return User.findByPk(id) as any; },
      async updateUser(id: string, patch: any) { await User.update(patch, { where: { id } }); },
      async saveRefreshToken(data: any) { await RefreshToken.create(data); },
      async findRefreshToken(tokenHash: string) { return RefreshToken.findOne({ where: { tokenHash } }) as any; },
      async revokeRefreshToken(id: string) { await RefreshToken.update({ revokedAt: new Date() }, { where: { id } }); },
      async revokeAllUserRefreshTokens(userId: string) {
        await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: { [Op.is]: null } } });
      },
      async savePasswordResetToken(data: any) { await PasswordResetToken.create(data); },
      async findPasswordResetToken(tokenHash: string) { return PasswordResetToken.findOne({ where: { tokenHash } }) as any; },
      async markPasswordResetTokenUsed(id: string) { await PasswordResetToken.update({ usedAt: new Date() }, { where: { id } }); },
    };
    const auditLog: ConstructorParameters<typeof AuthService>[1] = {
      async log({ userId, action, ipAddress, metadata }: any) {
        try {
          await AuditLog.create({ timestamp: new Date(), userId, action, ipAddress, metadata: metadata ?? null, entityType: null, entityId: null, oldValue: null, newValue: null });
        } catch { /* non-fatal */ }
      },
    };
    _singleton = createAuthenticate(new AuthService(db, auditLog));
  }
  return _singleton(req, res, next);
};

// ─── Route permissions reference ──────────────────────────────────────────────
//
// GET  /api/projects              → authenticate, authorize(Admin, Surveyor, Auditor)
// POST /api/projects              → authenticate, authorize(Admin, Surveyor)
// GET  /api/projects/:id          → authenticate, projectAssignee(...)
// PATCH /api/projects/:id         → authenticate, authorize(Admin, Surveyor)
// GET  /api/checklist/:projectId  → authenticate, projectAssignee(...)
// PATCH /api/checklist/item/:id   → authenticate, authorize(Admin, Surveyor, Installer)
// POST /api/files/upload          → authenticate, authorize(Admin, Surveyor, Installer)
// POST /api/documents/generate    → authenticate, authorize(Admin, Surveyor), require2FA
// GET  /api/documents             → authenticate, authorize(Admin, Surveyor, Auditor)
// POST /api/signatures/request    → authenticate, authorize(Admin, Surveyor)
// GET  /api/users                 → authenticate, adminOnly
// POST /api/users/invite          → authenticate, adminOnly
// PATCH /api/users/:id/role       → authenticate, adminOnly
// GET  /api/settings              → authenticate, adminOnly
// PATCH /api/settings/:section    → authenticate, adminOnly, require2FA
// GET  /api/audit-log             → authenticate, adminOnly
// POST /api/auth/logout           → authenticate
// POST /api/auth/refresh          → (no auth middleware — uses refresh token directly)
