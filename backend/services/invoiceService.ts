// ============================================================
// RISO HUB — services/invoiceService.ts
// Stripe invoice management.
//
// Env vars required:
//   STRIPE_SECRET_KEY      — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET  — Webhook signing secret (whsec_...)
//
// Flow:
//   1. Admin creates invoice → createAndSendInvoice()
//   2. Stripe emails customer with payment link
//   3. Stripe sends webhook when paid → updateInvoiceStatus()
//   4. Our DB row reflects Stripe state
// ============================================================

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2023-10-16' as any,
    });
  }
  return _stripe;
}

export interface InvoiceLineItem {
  description: string;
  amount:      number; // pence (GBP)
  quantity?:   number;
}

/** Find or create a Stripe customer for a project customer */
export async function ensureStripeCustomer(opts: {
  name:              string;
  email:             string;
  existingCustomerId?: string;
}): Promise<string> {
  const stripe = getStripe();
  if (opts.existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(opts.existingCustomerId);
      if (!(existing as any).deleted) return opts.existingCustomerId;
    } catch {
      // Fall through to create
    }
  }
  const customer = await stripe.customers.create({ name: opts.name, email: opts.email });
  return customer.id;
}

/** Create, finalize, and send a Stripe invoice to the customer */
export async function createAndSendInvoice(opts: {
  stripeCustomerId: string;
  lineItems:        InvoiceLineItem[];
  description?:     string;
  daysUntilDue?:    number;
  metadata?:        Record<string, string>;
}): Promise<{ stripeInvoiceId: string; invoiceUrl: string | null; totalAmount: number }> {
  const stripe = getStripe();

  // Create invoice items first
  for (const item of opts.lineItems) {
    await stripe.invoiceItems.create({
      customer:    opts.stripeCustomerId,
      amount:      item.amount,
      currency:    'gbp',
      description: item.description,
      quantity:    item.quantity ?? 1,
    });
  }

  // Create the invoice (draft)
  const invoice = await stripe.invoices.create({
    customer:          opts.stripeCustomerId,
    collection_method: 'send_invoice',
    days_until_due:    opts.daysUntilDue ?? 30,
    description:       opts.description,
    metadata:          opts.metadata ?? {},
  });

  // Finalize and send
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  await stripe.invoices.sendInvoice(finalized.id!);

  const total = opts.lineItems.reduce(
    (sum, item) => sum + item.amount * (item.quantity ?? 1),
    0
  );

  return {
    stripeInvoiceId: finalized.id!,
    invoiceUrl:      finalized.hosted_invoice_url ?? null,
    totalAmount:     total,
  };
}

/** Void a Stripe invoice (before payment) */
export async function voidStripeInvoice(stripeInvoiceId: string): Promise<void> {
  await getStripe().invoices.voidInvoice(stripeInvoiceId);
}

/** Parse and verify an incoming Stripe webhook event */
export function constructWebhookEvent(payload: Buffer | string, sig: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET ?? ''
  );
}

/** Map a Stripe invoice status to our DB status */
export function mapStripeStatus(
  stripeStatus: Stripe.Invoice.Status | null
): 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' {
  return (stripeStatus ?? 'draft') as any;
}
