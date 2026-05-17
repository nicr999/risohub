import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticate, authorize } from '../auth/authMiddleware';
import { AuditLog } from '../models/index';


const router = Router();

// ─── GET /api/audit-log ───────────────────────────────────────────────────────

router.get('/', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const {
      userId,
      action,
      entityType,
      entityId,
      from,
      to,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = { [Op.iLike]: `%${action}%` };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp[Op.gte] = new Date(from);
      if (to) where.timestamp[Op.lte] = new Date(to);
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Enrich with user name where available
    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))] as string[];
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'name', 'email'],
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = rows.map(row => ({
      ...row.toJSON(),
      user: row.userId ? userMap[row.userId] ?? null : null,
    }));

    res.json({
      logs: enriched,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('GET /api/audit-log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ─── GET /api/audit-log/entity/:type/:id ─────────────────────────────────────
// All audit entries for a specific entity (e.g. a project or complaint)

router.get('/entity/:type/:id', authenticate, authorize('Admin', 'Auditor'), async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;

    const rows = await AuditLog.findAll({
      where: { entityType: type, entityId: id },
      order: [['timestamp', 'DESC']],
    });

    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))] as string[];
    const users = await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = rows.map(row => ({
      ...row.toJSON(),
      user: row.userId ? userMap[row.userId] ?? null : null,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/audit-log/entity error:', err);
    res.status(500).json({ error: 'Failed to fetch entity audit log' });
  }
});

export default router;
