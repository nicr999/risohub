// ============================================================
// RISO HUB — components/InvoicePanel.tsx
// Stripe invoice management inside a project.
//
// Add to project tabs:
//   { id: 'invoices', label: 'Invoices' }
//   {activeTab === 'invoices' && (
//     <InvoicePanel projectId={project.id} token={token} userRole={user.role} />
//   )}
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

interface LineItem {
  description: string;
  amount:      number; // pence
  quantity?:   number;
}

interface Invoice {
  id:            string;
  status:        'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amount:        number;
  currency:      string;
  description:   string | null;
  invoiceUrl:    string | null;
  customerEmail: string | null;
  customerName:  string | null;
  dueDate:       string | null;
  paidAt:        string | null;
  createdAt:     string;
  lineItems:     LineItem[];
}

interface Props {
  projectId: string | number;
  token:     string;
  userRole:  string;
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft:         { background: '#f0f0ec', color: '#666' },
  open:          { background: '#fff8e1', color: '#8a6000' },
  paid:          { background: '#e8f5e9', color: '#2e7d32' },
  void:          { background: '#f5f5f5', color: '#999' },
  uncollectible: { background: '#fde8e8', color: '#8b2020' },
};

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export default function InvoicePanel({ projectId, token, userRole }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [voiding,  setVoiding]  = useState<string | null>(null);
  const [error,    setError]    = useState('');

  // Form state
  const [customerName,  setCustomerName]  = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description,   setDescription]   = useState('');
  const [daysUntilDue,  setDaysUntilDue]  = useState('30');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', amount: 0, quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/invoices/project/${projectId}`, { headers });
      setInvoices(res.data.invoices ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => { load(); }, [load]);

  const handleVoid = async (id: string) => {
    if (!window.confirm('Void this invoice? This cannot be undone.')) return;
    setVoiding(id);
    try {
      await axios.delete(`/api/invoices/${id}`, { headers });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to void invoice.');
    } finally {
      setVoiding(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim() || !customerEmail.trim()) {
      setError('Customer name and email are required.');
      return;
    }
    const validItems = lineItems.filter(i => i.description.trim() && i.amount > 0);
    if (!validItems.length) {
      setError('At least one line item with description and amount is required.');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post('/api/invoices', {
        projectId,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        description:   description.trim() || undefined,
        lineItems:     validItems,
        daysUntilDue:  parseInt(daysUntilDue) || 30,
      }, { headers });
      setShowForm(false);
      setCustomerName('');
      setCustomerEmail('');
      setDescription('');
      setLineItems([{ description: '', amount: 0, quantity: 1 }]);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateLineItem = (idx: number, field: keyof LineItem, val: string) => {
    setLineItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, [field]: field === 'amount' ? Math.round(parseFloat(val || '0') * 100) : field === 'quantity' ? parseInt(val || '1') : val }
        : item
    ));
  };

  const isAdmin = userRole === 'Admin';

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Invoices</h2>
          <p style={s.subtitle}>Create and track Stripe invoices for this project.</p>
        </div>
        {isAdmin && !showForm && (
          <button onClick={() => setShowForm(true)} style={s.primaryBtn}>
            + New invoice
          </button>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formTitle}>New invoice</div>

          <div style={s.row2}>
            <div style={s.field}>
              <label style={s.label}>Customer name</label>
              <input style={s.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Smith" required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Customer email</label>
              <input style={s.input} type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="john@example.com" required />
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Description (optional)</label>
            <input style={s.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="ASHP installation — 14 Oak Road" />
          </div>

          <div style={s.field}>
            <label style={s.label}>Payment due (days)</label>
            <input style={{ ...s.input, width: 100 }} type="number" min="1" max="365" value={daysUntilDue} onChange={e => setDaysUntilDue(e.target.value)} />
          </div>

          <div style={s.lineItemsSection}>
            <div style={s.lineItemsHeader}>
              <span style={s.sectionLabel}>Line items</span>
              <button type="button" onClick={() => setLineItems(prev => [...prev, { description: '', amount: 0, quantity: 1 }])} style={s.addLineBtn}>+ Add line</button>
            </div>
            {lineItems.map((item, idx) => (
              <div key={idx} style={s.lineItemRow}>
                <input
                  style={{ ...s.input, flex: 3 }}
                  value={item.description}
                  onChange={e => updateLineItem(idx, 'description', e.target.value)}
                  placeholder="Labour, materials, installation..."
                />
                <div style={s.amountWrap}>
                  <span style={s.currencySymbol}>£</span>
                  <input
                    style={{ ...s.input, paddingLeft: 22, width: 100 }}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.amount / 100 || ''}
                    onChange={e => updateLineItem(idx, 'amount', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <input
                  style={{ ...s.input, width: 60 }}
                  type="number"
                  min="1"
                  value={item.quantity ?? 1}
                  onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                  title="Quantity"
                />
                {lineItems.length > 1 && (
                  <button type="button" onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))} style={s.removeBtn}>×</button>
                )}
              </div>
            ))}
            <div style={s.totalRow}>
              Total: <strong>{formatPence(lineItems.reduce((sum, i) => sum + i.amount * (i.quantity ?? 1), 0))}</strong>
            </div>
          </div>

          <div style={s.formActions}>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} style={s.cancelBtn} disabled={submitting}>Cancel</button>
            <button type="submit" style={{ ...s.primaryBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
              {submitting ? 'Sending to Stripe…' : 'Create & send invoice'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : invoices.length === 0 ? (
        <div style={s.empty}>No invoices yet for this project.</div>
      ) : (
        <div style={s.list}>
          {invoices.map(inv => (
            <div key={inv.id} style={s.card}>
              <div style={s.cardTop}>
                <div>
                  <div style={s.cardTitle}>{inv.description ?? 'Invoice'}</div>
                  <div style={s.cardSub}>{inv.customerName} · {inv.customerEmail}</div>
                </div>
                <div style={{ ...s.badge, ...STATUS_STYLES[inv.status] }}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </div>
              </div>

              <div style={s.cardMeta}>
                <span style={s.amount}>{formatPence(inv.amount)}</span>
                {inv.dueDate && <span style={s.metaItem}>Due {new Date(inv.dueDate).toLocaleDateString('en-GB')}</span>}
                {inv.paidAt  && <span style={s.metaItem}>Paid {new Date(inv.paidAt).toLocaleDateString('en-GB')}</span>}
                <span style={s.metaItem}>{new Date(inv.createdAt).toLocaleDateString('en-GB')}</span>
              </div>

              <div style={s.cardActions}>
                {inv.invoiceUrl && (
                  <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer" style={s.linkBtn}>
                    View invoice
                  </a>
                )}
                {isAdmin && inv.status === 'open' && (
                  <button
                    onClick={() => handleVoid(inv.id)}
                    disabled={voiding === inv.id}
                    style={{ ...s.voidBtn, opacity: voiding === inv.id ? 0.6 : 1 }}
                  >
                    {voiding === inv.id ? 'Voiding…' : 'Void'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel:    { maxWidth: 740 },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 },
  title:    { fontSize: 18, fontWeight: 700, color: '#333', margin: '0 0 4px' },
  subtitle: { fontSize: 14, color: '#666', margin: 0 },
  error:    { background: '#fde8e8', color: '#8b2020', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 16 },
  empty:    { color: '#aaa', fontSize: 14, padding: '16px 0' },
  list:     { display: 'flex', flexDirection: 'column', gap: 12 },
  card:     { background: '#fff', border: '1px solid #e8e4de', borderRadius: 10, padding: '16px 20px' },
  cardTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle:{ fontSize: 14, fontWeight: 700, color: '#333' },
  cardSub:  { fontSize: 12, color: '#888', marginTop: 2 },
  badge:    { borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 },
  cardMeta: { display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  amount:   { fontSize: 16, fontWeight: 700, color: '#333' },
  metaItem: { fontSize: 12, color: '#888' },
  cardActions: { display: 'flex', gap: 8 },
  linkBtn:  { fontSize: 13, color: '#7A8465', fontWeight: 600, textDecoration: 'none', padding: '6px 14px', border: '1px solid #7A8465', borderRadius: 6 },
  voidBtn:  { fontSize: 12, color: '#b03030', background: 'transparent', border: '1px solid #e8c0c0', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' },
  form:     { background: '#fafaf8', border: '1px solid #e8e4de', borderRadius: 10, padding: '20px 24px', marginBottom: 24 },
  formTitle:{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  field:    { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
  label:    { fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:    { padding: '9px 12px', border: '1px solid #dbd2c4', borderRadius: 7, fontSize: 13, color: '#333', outline: 'none' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  lineItemsSection: { marginBottom: 16 },
  lineItemsHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addLineBtn: { fontSize: 12, color: '#7A8465', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 },
  lineItemRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  amountWrap:  { position: 'relative' as const, display: 'flex', alignItems: 'center' },
  currencySymbol: { position: 'absolute' as const, left: 9, fontSize: 13, color: '#888', pointerEvents: 'none' as const },
  removeBtn:   { background: 'transparent', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  totalRow:    { textAlign: 'right' as const, fontSize: 13, color: '#555', marginTop: 6 },
  formActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  primaryBtn:  { background: '#7A8465', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtn:   { background: 'transparent', color: '#888', border: '1px solid #ddd', borderRadius: 8, padding: '11px 18px', fontSize: 13, cursor: 'pointer' },
};
