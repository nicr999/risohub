import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

import { logAudit } from '../services/auditService';
import { authenticate, authorize } from '../auth/authMiddleware';
import { sendUserInvite } from '../services/emailService';
import { User } from '../models/index';

const router = Router();
const BCRYPT_ROUNDS = 12;

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Admin only — list all users

router.get('/', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { role, active, search } = req.query as Record<string, string>;

    const where: any = {};
    if (role) where.role = role;
    if (active !== undefined) where.active = active === 'true';
    if (search) {
      const { Op } = await import('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['passwordHash', 'totpSecret'] },
      order: [['name', 'ASC']],
    });

    res.json(users);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────

router.get('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['passwordHash', 'totpSecret'] },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('GET /api/users/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── POST /api/users/invite ───────────────────────────────────────────────────
// Admin creates a new user account and emails them a temp password

router.post('/invite', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email and role are required' });
    }

    const validRoles = ['Admin', 'Surveyor', 'Installer', 'Auditor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

    // Generate a secure temporary password
    const tempPassword = crypto.randomBytes(10).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await User.create({
      name,
      email,
      role,
      passwordHash,
      twoFactorEnabled: role === 'Admin', // Admin must have 2FA
      active: true,
    });

    // Send invite email with temp password
    await sendUserInvite({
      to: email,
      name,
      role,
      tempPassword,
      loginUrl: `${process.env.FRONTEND_URL}/login`,
    });

    await logAudit({
      userId: req.user!.id,
      action: 'user.invited',
      entityType: 'User',
      entityId: user.id,
      newValue: { name, email, role },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('POST /api/users/invite error:', err);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// ─── PATCH /api/users/:id/role ────────────────────────────────────────────────

router.patch('/:id/role', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role is required' });

    const validRoles = ['Admin', 'Surveyor', 'Installer', 'Auditor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent demoting self
    if (user.id === req.user!.id && role !== 'Admin') {
      return res.status(400).json({ error: 'You cannot demote your own Admin role' });
    }

    const oldRole = user.role;
    await user.update({ role });

    await logAudit({
      userId: req.user!.id,
      action: 'user.roleChanged',
      entityType: 'User',
      entityId: user.id,
      oldValue: { role: oldRole },
      newValue: { role },
      ipAddress: req.ip,
    });

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error('PATCH /api/users/:id/role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── PATCH /api/users/:id/status ─────────────────────────────────────────────

router.patch('/:id/status', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be a boolean' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.id === req.user!.id && !active) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    await user.update({ active });

    await logAudit({
      userId: req.user!.id,
      action: active ? 'user.activated' : 'user.deactivated',
      entityType: 'User',
      entityId: user.id,
      newValue: { active },
      ipAddress: req.ip,
    });

    res.json({ id: user.id, name: user.name, email: user.email, active: user.active });
  } catch (err) {
    console.error('PATCH /api/users/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── GET /api/auth/me (convenience — re-exported here) ───────────────────────

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id, {
      attributes: { exclude: ['passwordHash', 'totpSecret'] },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

export default router;
