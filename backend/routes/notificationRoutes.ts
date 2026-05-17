import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate } from '../auth/authMiddleware';
import { Notification } from '../models/index';

const router = Router();

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { type, read, page = '1', limit = '30' } = req.query as Record<string, string>;
    const user = req.user!;

    const where: any = { userId: user.id };
    if (type) where.type = type;
    if (read !== undefined) where.read = read === 'true';

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Group into Today / Yesterday / Earlier for the UI
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

    const grouped: Record<string, any[]> = { today: [], yesterday: [], earlier: [] };

    for (const n of rows) {
      const created = new Date(n.createdAt);
      if (created >= startOfToday) grouped.today.push(n);
      else if (created >= startOfYesterday) grouped.yesterday.push(n);
      else grouped.earlier.push(n);
    }

    res.json({
      notifications: rows,
      grouped,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ─── GET /api/notifications/unread-count ──────────────────────────────────────

router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const count = await Notification.count({
      where: { userId: req.user!.id, read: false },
    });
    res.json({ count });
  } catch (err) {
    console.error('GET /api/notifications/unread-count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────

router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    await notification.update({ read: true });
    res.json({ id: notification.id, read: true });
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────

router.patch('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    const { type } = req.query as Record<string, string>;

    const where: any = { userId: req.user!.id, read: false };
    if (type) where.type = type;

    const [updated] = await Notification.update({ read: true }, { where });

    res.json({ updated });
  } catch (err) {
    console.error('PATCH /api/notifications/read-all error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    await notification.destroy();
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
