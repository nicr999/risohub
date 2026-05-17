// ============================================================
// RISO HUB — auth/tenantMiddleware.ts
// Resolves the active tenant for every API request.
//
// Resolution order:
//   1. X-Tenant-ID header (UUID) — direct API access / mobile
//   2. Subdomain: <slug>.risohub.co.uk → look up by slug
//   3. DEFAULT_TENANT_ID env var — single-tenant / local dev fallback
//
// Attaches req.tenantId (string UUID) if resolved.
// Routes that require a tenant can call requireTenant middleware.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/index';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

const RISOHUB_ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'risohub.co.uk';

async function resolveTenantFromSubdomain(host: string): Promise<string | null> {
  const parts = host.split('.');
  if (parts.length < 3) return null; // Not a subdomain
  const slug = parts[0].toLowerCase();
  if (slug === 'www' || slug === 'api' || slug === 'app') return null;
  const tenant = await Tenant.findOne({ where: { slug, active: true } }) as any;
  return tenant?.id ?? null;
}

/** Resolves req.tenantId — always succeeds (falls back gracefully) */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // 1. X-Tenant-ID header
  const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
  if (headerTenantId) {
    req.tenantId = headerTenantId;
    return next();
  }

  // 2. Subdomain
  const host = req.hostname?.toLowerCase() ?? '';
  if (host.endsWith(RISOHUB_ROOT_DOMAIN)) {
    try {
      const tenantId = await resolveTenantFromSubdomain(host);
      if (tenantId) {
        req.tenantId = tenantId;
        return next();
      }
    } catch {
      // Non-fatal — fall through
    }
  }

  // 3. Default tenant (single-tenant / dev)
  if (process.env.DEFAULT_TENANT_ID) {
    req.tenantId = process.env.DEFAULT_TENANT_ID;
  }

  next();
}

/** Hard-gates routes that MUST have a resolved tenant */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    res.status(400).json({ error: 'Tenant could not be resolved for this request.' });
    return;
  }
  next();
}
