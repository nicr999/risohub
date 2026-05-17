// ============================================================
// RISO HUB — routes/tenantRoutes.ts
// Tenant management — platform super-admin only.
//
// Super-admin is identified by SUPER_ADMIN_KEY env var in the
// Authorization header: "Bearer <SUPER_ADMIN_KEY>"
//
// GET    /api/tenants          — list all tenants
// POST   /api/tenants          — create a tenant
// GET    /api/tenants/:id      — get a tenant
// PATCH  /api/tenants/:id      — update a tenant
// DELETE /api/tenants/:id      — deactivate a tenant
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/index';

const router = Router();

function superAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.SUPER_ADMIN_KEY;
  if (!key) {
    res.status(503).json({ error: 'Super-admin access not configured.' });
    return;
  }
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${key}`) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }
  next();
}

// ── GET /api/tenants ──────────────────────────────────────────────────────────

router.get('/', superAdmin, async (_req: Request, res: Response) => {
  const tenants = await Tenant.findAll({ order: [['createdAt', 'DESC']] });
  res.json({ tenants });
});

// ── POST /api/tenants ─────────────────────────────────────────────────────────

router.post('/', superAdmin, async (req: Request, res: Response) => {
  const { name, slug, planTier, settings } = req.body as {
    name:       string;
    slug:       string;
    planTier?:  'starter' | 'pro' | 'enterprise';
    settings?:  Record<string, any>;
  };

  if (!name || !slug) {
    return res.status(400).json({ error: 'name and slug are required.' });
  }

  if (!/^[a-z0-9-]{2,64}$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be 2–64 lowercase alphanumeric characters or hyphens.' });
  }

  try {
    const tenant = await Tenant.create({
      name,
      slug,
      planTier:  planTier ?? 'starter',
      settings:  settings ?? {},
      active:    true,
    } as any);
    return res.status(201).json(tenant);
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: `Slug "${slug}" is already in use.` });
    }
    console.error('POST /api/tenants error:', err);
    return res.status(500).json({ error: 'Failed to create tenant.' });
  }
});

// ── GET /api/tenants/:id ──────────────────────────────────────────────────────

router.get('/:id', superAdmin, async (req: Request, res: Response) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });
  return res.json(tenant);
});

// ── PATCH /api/tenants/:id ────────────────────────────────────────────────────

router.patch('/:id', superAdmin, async (req: Request, res: Response) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

  const { name, planTier, settings, active } = req.body as {
    name?:      string;
    planTier?:  'starter' | 'pro' | 'enterprise';
    settings?:  Record<string, any>;
    active?:    boolean;
  };

  const patch: any = {};
  if (name     !== undefined) patch.name     = name;
  if (planTier !== undefined) patch.planTier = planTier;
  if (settings !== undefined) patch.settings = settings;
  if (active   !== undefined) patch.active   = active;

  await tenant.update(patch);
  return res.json(tenant);
});

// ── DELETE /api/tenants/:id ───────────────────────────────────────────────────

router.delete('/:id', superAdmin, async (req: Request, res: Response) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });
  await tenant.update({ active: false });
  return res.json({ ok: true, message: 'Tenant deactivated.' });
});

export default router;
