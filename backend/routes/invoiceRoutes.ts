// ============================================================
// RISO HUB — routes/invoiceRoutes.ts
// Stripe invoice management.
//
// POST /api/invoices                        — create + send invoice (Admin)
// GET  /api/invoices/project/:projectId     — list invoices for a project
// GET  /api/invoices/:id                    — get a single invoice
// DELETE /api/invoices/:id                  — void invoice (Admin)
// POST /api/invoices/webhook                — Stripe webhook (raw body, no auth)
// ============================================================

import express, { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../auth/authMiddleware';
import { Invoice, Project, User } from '../models/index';
import {
  ensureStripeCustomer,
  createAndSendInvoice,
  voidStripeInvoice,
  constructWebhookEvent,
  mapStripeStatus,
} from '../services/invoiceService';
import { logAudit } from '../services/auditService';
import { sendPushToUser } from '../services/pushService';

const router = Router();

// ── Stripe webhook handler — exported so app.ts can mount it with raw body ────
// app.ts registers:
//   app.post('/api/invoices/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler)
// This must sit BEFORE the global express.json() middleware.

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) { res.status(400).json({ error: 'Missing stripe-signature header.' }); return; }

    let event: any;
    try {
      event = constructWebhookEvent(req.body, sig);
    } catch (err: any) {
      console.error('[Stripe webhook] verification failed:', err.message);
      res.status(400).json({ error: err.message }); return;
    }

    try {
      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' ||
          event.type === 'invoice.voided') {
        const stripeInvoice = event.data.object as any;
        const row = await Invoice.findOne({ where: { stripeInvoiceId: stripeInvoice.id } });
        if (row) {
          const newStatus = mapStripeStatus(stripeInvoice.status);
          const paidAt = stripeInvoice.status_transitions?.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : null;
          await row.update({ status: newStatus, paidAt });

          if (event.type === 'invoice.paid') {
            const project = await Project.findByPk((row as any).projectId, {
              include: [{ model: User, as: 'assignee' }],
            });
            if (project && (project as any).assignedTo) {
              await sendPushToUser((project as any).assignedTo, {
                title: 'Invoice paid',
                body:  `Invoice for ${(project as any).customerName} has been paid.`,
                data:  { type: 'invoice.paid', projectId: (project as any).id },
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Stripe webhook] handler error:', err);
    }

    res.json({ received: true });
}

// ── POST /api/invoices/webhook — guard: already handled above express.json()

router.post('/webhook', (_req: Request, res: Response) => {
  res.status(400).json({ error: 'Webhook must be sent to the correct endpoint.' });
});

// ── POST /api/invoices ────────────────────────────────────────────────────────

router.post('/', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  const {
    projectId,
    lineItems,
    description,
    daysUntilDue,
    customerEmail,
    customerName,
  } = req.body as {
    projectId:     string;
    lineItems:     { description: string; amount: number; quantity?: number }[];
    description?:  string;
    daysUntilDue?: number;
    customerEmail: string;
    customerName:  string;
  };

  if (!projectId || !lineItems?.length || !customerEmail || !customerName) {
    return res.status(400).json({ error: 'projectId, lineItems, customerEmail, and customerName are required.' });
  }

  try {
    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    // Check for existing Stripe customer on previous invoices
    const existing = await Invoice.findOne({
      where:  { projectId },
      order:  [['createdAt', 'DESC']],
    });
    const existingCustomerId = (existing as any)?.stripeCustomerId ?? undefined;

    const stripeCustomerId = await ensureStripeCustomer({
      name:              customerName,
      email:             customerEmail,
      existingCustomerId,
    });

    const { stripeInvoiceId, invoiceUrl, totalAmount } = await createAndSendInvoice({
      stripeCustomerId,
      lineItems,
      description,
      daysUntilDue: daysUntilDue ?? 30,
      metadata:     { projectId, risohubEnv: process.env.NODE_ENV ?? 'production' },
    });

    const invoice = await Invoice.create({
      projectId,
      createdBy:        req.user!.sub,
      stripeCustomerId,
      stripeInvoiceId,
      invoiceUrl,
      amount:           totalAmount,
      currency:         'gbp',
      status:           'open',
      description:      description ?? null,
      lineItems,
      customerEmail,
      customerName,
    } as any);

    await logAudit({
      userId:     req.user!.sub,
      action:     'invoice.created',
      entityType: 'Invoice',
      entityId:   (invoice as any).id,
      newValue:   { projectId, amount: totalAmount, status: 'open' },
      ipAddress:  req.ip,
    });

    return res.status(201).json(invoice);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    return res.status(500).json({ error: 'Failed to create invoice.' });
  }
});

// ── GET /api/invoices/project/:projectId ──────────────────────────────────────

router.get('/project/:projectId', authenticate, async (req: Request, res: Response) => {
  try {
    const invoices = await Invoice.findAll({
      where:  { projectId: req.params.projectId },
      order:  [['createdAt', 'DESC']],
    });
    return res.json({ invoices });
  } catch (err) {
    console.error('GET /api/invoices/project error:', err);
    return res.status(500).json({ error: 'Failed to fetch invoices.' });
  }
});

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    return res.json(invoice);
  } catch (err) {
    console.error('GET /api/invoices/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch invoice.' });
  }
});

// ── DELETE /api/invoices/:id ──────────────────────────────────────────────────

router.delete('/:id', authenticate, authorize('Admin'), async (req: Request, res: Response) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

    const stripeInvoiceId = (invoice as any).stripeInvoiceId;
    if (stripeInvoiceId) {
      try {
        await voidStripeInvoice(stripeInvoiceId);
      } catch (stripeErr: any) {
        if (!stripeErr.message?.includes('already voided')) throw stripeErr;
      }
    }

    await invoice.update({ status: 'void' });

    await logAudit({
      userId:     req.user!.sub,
      action:     'invoice.voided',
      entityType: 'Invoice',
      entityId:   req.params.id,
      ipAddress:  req.ip,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/invoices/:id error:', err);
    return res.status(500).json({ error: 'Failed to void invoice.' });
  }
});

export default router;
