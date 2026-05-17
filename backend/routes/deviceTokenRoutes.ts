// ============================================================
// RISO HUB — routes/deviceTokenRoutes.ts
// FCM device token management for mobile push notifications.
//
// POST /api/device-tokens          — register a device token
// DELETE /api/device-tokens        — unregister (logout)
// GET  /api/device-tokens          — admin: list all (debug)
// ============================================================

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/authMiddleware';
import { DeviceToken } from '../models/index';

const router = Router();

// ── POST /api/device-tokens ───────────────────────────────────────────────────
// Called on app start or when FCM token refreshes.

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { token, platform } = req.body as { token: string; platform: 'ios' | 'android' };

    if (!token || !platform) {
      return res.status(400).json({ error: 'token and platform are required.' });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be ios or android.' });
    }

    // Upsert — if this token already exists (maybe from a different user) claim it
    const [row, created] = await DeviceToken.upsert({
      token,
      userId:       req.user!.sub,
      platform,
      lastActiveAt: new Date(),
    }, { returning: true });

    return res.status(created ? 201 : 200).json({ id: (row as any).id });
  } catch (err) {
    console.error('POST /api/device-tokens error:', err);
    return res.status(500).json({ error: 'Failed to register device token.' });
  }
});

// ── DELETE /api/device-tokens ─────────────────────────────────────────────────
// Called on logout — removes all tokens for this user (or a specific token).

router.delete('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string };
    const where: any = { userId: req.user!.sub };
    if (token) where.token = token;

    const deleted = await DeviceToken.destroy({ where });
    return res.json({ deleted });
  } catch (err) {
    console.error('DELETE /api/device-tokens error:', err);
    return res.status(500).json({ error: 'Failed to unregister device token.' });
  }
});

// ── GET /api/device-tokens ────────────────────────────────────────────────────
// Admin debug endpoint.

router.get('/', authenticate, async (req: Request, res: Response) => {
  if (req.user!.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin only.' });
  }
  try {
    const rows = await DeviceToken.findAll({
      order: [['lastActiveAt', 'DESC']],
      limit: 200,
    });
    return res.json({ tokens: rows });
  } catch (err) {
    console.error('GET /api/device-tokens error:', err);
    return res.status(500).json({ error: 'Failed to fetch device tokens.' });
  }
});

export default router;
