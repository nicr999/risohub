// src/components/analytics/WebhookManagementPanel.tsx
import React, { useState, useEffect } from 'react';
import { Webhook, Plus, Trash2, Send, ChevronDown, ChevronUp, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface Endpoint {
  id: number;
  url: string;
  events: string[];
  description?: string;
  active: boolean;
  createdAt: string;
}

interface Delivery {
  id: number;
  event: string;
  attempt: number;
  responseStatus?: number;
  success: boolean;
  errorMessage?: string;
  deliveredAt: string;
}

const ALL_EVENTS = [
  'project.status_changed', 'project.created',
  'document.signed', 'document.uploaded',
  'complaint.opened', 'complaint.resolved',
  'qualification.expiring', 'portal.viewed',
  'partner.access_granted',
];

export function WebhookManagementPanel() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});
  const [form, setForm] = useState({ url: '', description: '', events: [] as string[] });
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchEndpoints(); }, []);

  const token = () => localStorage.getItem('token');
  const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/webhooks', { headers: headers() });
      const data = await res.json();
      setEndpoints(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveries = async (id: number) => {
    const res = await fetch(`/api/webhooks/${id}/deliveries`, { headers: headers() });
    const data = await res.json();
    setDeliveries(prev => ({ ...prev, [id]: data }));
  };

  const handleCreate = async () => {
    if (!form.url || form.events.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.secret) setNewSecret(data.secret);
      setShowAdd(false);
      setForm({ url: '', description: '', events: [] });
      fetchEndpoints();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ep: Endpoint) => {
    await fetch(`/api/webhooks/${ep.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ active: !ep.active }),
    });
    fetchEndpoints();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this webhook endpoint?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE', headers: headers() });
    fetchEndpoints();
  };

  const handleTest = async (id: number) => {
    await fetch(`/api/webhooks/${id}/test`, { method: 'POST', headers: headers() });
    setTimeout(() => fetchDeliveries(id), 2000);
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    fetchDeliveries(id);
  };

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-900" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Webhook className="w-5 h-5 text-blue-900" /> Webhooks
          </h2>
          <p className="text-sm text-gray-500 mt-1">Notify external systems when events happen in RISO HUB</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors">
          <Plus className="w-4 h-4" /> Add Endpoint
        </button>
      </div>

      {/* New secret banner */}
      {newSecret && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Copy your signing secret — it won't be shown again</p>
          <code className="text-xs font-mono bg-white border border-amber-200 px-3 py-2 rounded-lg block break-all">{newSecret}</code>
          <button onClick={() => setNewSecret(null)} className="mt-2 text-xs text-amber-600 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Add endpoint form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">New Webhook Endpoint</h3>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL (HTTPS required)</label>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://your-system.com/webhooks/riso"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. CRM integration"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Events</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map(event => (
                <button
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.events.includes(event)
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.url || form.events.length === 0}
              className="px-4 py-2 text-sm bg-blue-900 text-white rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Endpoint'}
            </button>
          </div>
        </div>
      )}

      {/* Endpoint list */}
      {endpoints.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No webhook endpoints yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map(ep => (
            <div key={ep.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ep.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{ep.url}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ep.description ?? 'No description'}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(typeof ep.events === 'string' ? JSON.parse(ep.events) : ep.events).map((e: string) => (
                      <span key={e} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleTest(ep.id)} title="Send test" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggle(ep)} title={ep.active ? 'Disable' : 'Enable'} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(ep.id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleExpand(ep.id)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                    {expandedId === ep.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Delivery history */}
              {expandedId === ep.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Recent Deliveries</p>
                  {(deliveries[ep.id] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No deliveries yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(deliveries[ep.id] ?? []).slice(0, 20).map(d => (
                        <div key={d.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-50 last:border-0">
                          {d.success
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                          <span className="text-gray-700 font-mono">{d.event}</span>
                          <span className={`ml-auto px-1.5 py-0.5 rounded font-mono ${d.responseStatus && d.responseStatus < 300 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {d.responseStatus ?? 'err'}
                          </span>
                          <span className="text-gray-400">{new Date(d.deliveredAt).toLocaleString('en-GB')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
