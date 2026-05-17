// routes/webhookRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../authMiddleware';
import { WebhookEndpoint, WebhookDelivery } from '../models';
import crypto from 'crypto';

const router = Router();

const VALID_EVENTS = [
  'project.status_changed', 'project.created',
  'document.signed', 'document.uploaded',
  'complaint.opened', 'complaint.resolved',
  'qualification.expiring', 'portal.viewed',
  'partner.access_granted', '*',
];

// GET /api/webhooks — list endpoints
router.get('/', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const endpoints = await WebhookEndpoint.findAll({ order: [['createdAt', 'DESC']] });
  // Mask secrets
  return res.json(endpoints.map(ep => ({ ...ep.toJSON(), secret: '••••••••' })));
});

// POST /api/webhooks — register endpoint
router.post('/', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const { url, events, description } = req.body;

  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'url and events[] required' });
  }
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!url.startsWith('https://')) {
    return res.status(400).json({ error: 'URL must use HTTPS' });
  }

  const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e));
  if (invalid.length) {
    return res.status(400).json({ error: `Unknown events: ${invalid.join(', ')}` });
  }

  const secret = crypto.randomBytes(32).toString('hex');
  const endpoint = await WebhookEndpoint.create({
    url,
    secret,
    events: JSON.stringify(events),
    description: description ?? null,
    active: true,
    createdBy: req.user!.id,
  });

  return res.status(201).json({
    id: endpoint.id,
    url: endpoint.url,
    events,
    description: endpoint.description,
    secret, // shown once only
    active: true,
    createdAt: endpoint.createdAt,
  });
});

// PATCH /api/webhooks/:id — update (toggle active, change events)
router.patch('/:id', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const endpoint = await WebhookEndpoint.findByPk(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Not found' });

  const { active, events, description } = req.body;
  if (active !== undefined) endpoint.active = active;
  if (events !== undefined) endpoint.events = JSON.stringify(events);
  if (description !== undefined) endpoint.description = description;
  await endpoint.save();

  return res.json({ ...endpoint.toJSON(), secret: '••••••••' });
});

// DELETE /api/webhooks/:id
router.delete('/:id', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const endpoint = await WebhookEndpoint.findByPk(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Not found' });
  await endpoint.destroy();
  return res.json({ deleted: true });
});

// GET /api/webhooks/:id/deliveries — delivery history
router.get('/:id/deliveries', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const deliveries = await WebhookDelivery.findAll({
    where: { endpointId: req.params.id },
    order: [['deliveredAt', 'DESC']],
    limit: 100,
  });
  return res.json(deliveries);
});

// POST /api/webhooks/:id/test — send a test ping
router.post('/:id/test', authenticate, requireRole(['Admin']), async (req: Request, res: Response) => {
  const endpoint = await WebhookEndpoint.findByPk(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Not found' });

  const { fireWebhook } = await import('../services/webhookService');
  await fireWebhook('project.status_changed', {
    test: true,
    message: 'This is a test delivery from RISO HUB',
    projectId: 0,
    address: '1 Test Street',
    newStatus: 'Survey',
  });

  return res.json({ sent: true });
});

export default router;
