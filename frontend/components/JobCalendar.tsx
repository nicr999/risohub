// ============================================================
// RISO HUB — JobCalendar.tsx
// Week/month calendar view of scheduled jobs across the team
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────

interface ScheduleEntry {
  id: number;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  notes?: string;
  Project: { id: number; customerName: string; address: string; postcode: string };
  assignedUser: { id: number; name: string };
}

interface User {
  id: number;
  name: string;
  role: string;
}

type ViewMode = 'week' | 'month';

const TYPE_COLOURS: Record<string, string> = {
  survey: '#7A8465',
  design: '#9DA889',
  install: '#6B7A5C',
  commission: '#4A5740',
  audit: '#C9C8BE',
  other: '#DBD2C4',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Helpers ───────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday start
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return sameDay(date, new Date());
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── Main component ─────────────────────────────────────────────

export default function JobCalendar() {
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<ScheduleEntry | null>(null);
  const [newEntry, setNewEntry] = useState<Partial<any>>({});
  const [saving, setSaving] = useState(false);

  // Compute range
  const rangeStart = view === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const rangeEnd = view === 'week' ? addDays(rangeStart, 6) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { from: rangeStart.toISOString(), to: rangeEnd.toISOString() };
      if (selectedUser !== 'all') params.userId = selectedUser;
      const [schedRes, usersRes] = await Promise.all([
        axios.get('/api/schedule', { params }),
        axios.get('/api/users'),
      ]);
      setEntries(schedRes.data);
      setUsers(usersRes.data.filter((u: User) => ['Surveyor', 'Installer'].includes(u.role)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [rangeStart.toISOString(), selectedUser]);

  useEffect(() => { load(); }, [load]);

  function navigate(dir: number) {
    const d = new Date(anchor);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  }

  function entriesForDay(day: Date): ScheduleEntry[] {
    return entries.filter(e => sameDay(new Date(e.startAt), day));
  }

  async function handleCreate() {
    if (!newEntry.projectId || !newEntry.userId || !newEntry.type || !newEntry.startAt || !newEntry.endAt) return;
    setSaving(true);
    try {
      await axios.post('/api/schedule', newEntry);
      setShowModal(false);
      setNewEntry({});
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this schedule entry?')) return;
    await axios.delete(`/api/schedule/${id}`);
    setSelected(null);
    load();
  }

  // Build days array for current view
  const days: Date[] = [];
  if (view === 'week') {
    for (let i = 0; i < 7; i++) days.push(addDays(rangeStart, i));
  } else {
    const firstDay = startOfMonth(anchor);
    const offset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon start
    for (let i = -offset; i < 42 - offset; i++) days.push(addDays(firstDay, i));
  }

  const titleStr = view === 'week'
    ? `${rangeStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${rangeEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  return (
    <div style={s.page}>
      {/* ── Toolbar ── */}
      <div style={s.toolbar}>
        <div style={s.toolbarLeft}>
          <h2 style={s.title}>Job Calendar</h2>
          <button style={s.todayBtn} onClick={() => setAnchor(new Date())}>Today</button>
          <div style={s.navGroup}>
            <button style={s.navBtn} onClick={() => navigate(-1)}>‹</button>
            <span style={s.rangeLabel}>{titleStr}</span>
            <button style={s.navBtn} onClick={() => navigate(1)}>›</button>
          </div>
        </div>
        <div style={s.toolbarRight}>
          <select
            style={s.select}
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            <option value="all">All staff</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div style={s.viewToggle}>
            {(['week', 'month'] as ViewMode[]).map(v => (
              <button
                key={v}
                style={{ ...s.viewBtn, ...(view === v ? s.viewBtnActive : {}) }}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button style={s.addBtn} onClick={() => { setNewEntry({}); setShowModal(true); }}>+ Schedule</button>
        </div>
      </div>

      {/* ── Day headers ── */}
      <div style={{ ...s.grid, gridTemplateColumns: `repeat(7, 1fr)` }}>
        {DAYS.map(d => <div key={d} style={s.dayHeader}>{d}</div>)}
      </div>

      {/* ── Calendar grid ── */}
      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : (
        <div style={{ ...s.grid, gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: view === 'week' ? '120px' : '90px' }}>
          {days.map((day, i) => {
            const dayEntries = entriesForDay(day);
            const isCurrentMonth = day.getMonth() === anchor.getMonth();
            return (
              <div
                key={i}
                style={{
                  ...s.cell,
                  ...(isToday(day) ? s.today : {}),
                  ...(!isCurrentMonth && view === 'month' ? s.otherMonth : {}),
                }}
              >
                <div style={s.dateNum}>{day.getDate()}</div>
                <div style={s.cellEntries}>
                  {dayEntries.slice(0, view === 'week' ? 6 : 3).map(e => (
                    <div
                      key={e.id}
                      style={{ ...s.entryChip, background: TYPE_COLOURS[e.type] || '#999' }}
                      onClick={() => setSelected(e)}
                    >
                      <span style={s.entryType}>{e.type}</span>
                      {!e.allDay && view === 'week' && <span style={s.entryTime}>{formatTime(e.startAt)}</span>}
                      <span style={s.entryName}>{e.Project?.customerName}</span>
                    </div>
                  ))}
                  {dayEntries.length > (view === 'week' ? 6 : 3) && (
                    <div style={s.more}>+{dayEntries.length - (view === 'week' ? 6 : 3)} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Entry detail modal ── */}
      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <div style={s.detailHeader}>
            <span style={{ ...s.detailType, background: TYPE_COLOURS[selected.type] }}>{selected.type.toUpperCase()}</span>
            <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
          </div>
          <div style={s.detailCustomer}>{selected.Project?.customerName}</div>
          <div style={s.detailAddress}>{selected.Project?.address}, {selected.Project?.postcode}</div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Assigned to</span>
            <span>{selected.assignedUser?.name}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Start</span>
            <span>{new Date(selected.startAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>End</span>
            <span>{new Date(selected.endAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {selected.notes && <div style={s.detailNotes}>{selected.notes}</div>}
          <button style={s.deleteBtn} onClick={() => handleDelete(selected.id)}>Delete entry</button>
        </Modal>
      )}

      {/* ── Create modal ── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h3 style={s.modalTitle}>Schedule a Job</h3>
          <ScheduleForm form={newEntry} onChange={setNewEntry} users={users} />
          <div style={s.modalActions}>
            <button style={s.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
            <button style={s.saveBtn} onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Schedule form ──────────────────────────────────────────────

function ScheduleForm({ form, onChange, users }: { form: any; onChange: (f: any) => void; users: User[] }) {
  const set = (k: string, v: any) => onChange((f: any) => ({ ...f, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      <FormField label="Project ID">
        <input style={s.input} type="number" value={form.projectId || ''} onChange={e => set('projectId', e.target.value)} placeholder="Project ID" />
      </FormField>
      <FormField label="Assign to">
        <select style={s.input} value={form.userId || ''} onChange={e => set('userId', e.target.value)}>
          <option value="">Select staff member…</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
      </FormField>
      <FormField label="Visit type">
        <select style={s.input} value={form.type || ''} onChange={e => set('type', e.target.value)}>
          <option value="">Select type…</option>
          {['survey', 'design', 'install', 'commission', 'audit', 'other'].map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Start">
          <input style={s.input} type="datetime-local" value={form.startAt || ''} onChange={e => set('startAt', e.target.value)} />
        </FormField>
        <FormField label="End">
          <input style={s.input} type="datetime-local" value={form.endAt || ''} onChange={e => set('endAt', e.target.value)} />
        </FormField>
      </div>
      <FormField label="Notes">
        <textarea style={{ ...s.input, height: 56, resize: 'vertical' }} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
      </FormField>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'Satoshi, sans-serif', background: '#F5F5F2', minHeight: '100vh', padding: 24 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 20, fontWeight: 700, color: '#333', margin: 0 },
  todayBtn: { fontSize: 12, padding: '5px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' },
  navGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: { fontSize: 16, padding: '2px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#555' },
  rangeLabel: { fontSize: 14, fontWeight: 600, color: '#333', minWidth: 200, textAlign: 'center' },
  select: { fontSize: 12, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' },
  viewToggle: { display: 'flex', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' },
  viewBtn: { fontSize: 12, padding: '5px 12px', border: 'none', background: '#fff', cursor: 'pointer', color: '#555' },
  viewBtnActive: { background: '#7A8465', color: '#fff' },
  addBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  grid: { display: 'grid', background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, overflow: 'hidden' },
  dayHeader: { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', textAlign: 'center', background: '#fafaf8', borderBottom: '1px solid #eee', letterSpacing: '0.06em' },
  cell: { borderRight: '1px solid #eee', borderBottom: '1px solid #eee', padding: '6px 6px', overflow: 'hidden', background: '#fff', minHeight: 80 },
  today: { background: '#f0f1ec' },
  otherMonth: { background: '#fafaf8', opacity: 0.6 },
  dateNum: { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 },
  cellEntries: { display: 'flex', flexDirection: 'column', gap: 2 },
  entryChip: { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 3, cursor: 'pointer', overflow: 'hidden' },
  entryType: { fontSize: 9, fontWeight: 700, color: '#fff', opacity: 0.85, textTransform: 'uppercase', flexShrink: 0 },
  entryTime: { fontSize: 9, color: '#fff', opacity: 0.8, flexShrink: 0 },
  entryName: { fontSize: 10, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  more: { fontSize: 10, color: '#999', paddingLeft: 4 },
  loading: { padding: 40, textAlign: 'center', color: '#999', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 10, padding: '24px 28px', width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#333', margin: '0 0 16px' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailType: { fontSize: 10, fontWeight: 700, color: '#fff', padding: '3px 10px', borderRadius: 4, letterSpacing: '0.06em' },
  closeBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#888' },
  detailCustomer: { fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 2 },
  detailAddress: { fontSize: 13, color: '#777', marginBottom: 14 },
  detailRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f5f5f0' },
  detailLabel: { color: '#888', fontWeight: 600 },
  detailNotes: { fontSize: 12, color: '#666', background: '#fafaf8', borderRadius: 6, padding: '8px 10px', marginTop: 12 },
  deleteBtn: { marginTop: 16, fontSize: 12, padding: '6px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', width: '100%' },
  input: { fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fafaf8', outline: 'none', width: '100%', boxSizing: 'border-box' },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em' },
  saveBtn: { fontSize: 12, padding: '7px 18px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  cancelBtn: { fontSize: 12, padding: '7px 14px', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' },
};
