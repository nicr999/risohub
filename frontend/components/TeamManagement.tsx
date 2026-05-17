import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "Admin" | "Surveyor" | "Installer" | "Auditor";
export type MemberStatus = "active" | "inactive" | "pending";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  twoFactorEnabled: boolean;
  joinedAt: Date | null;   // null if still pending
  lastActiveAt: Date | null;
}

interface InvitePayload {
  name: string;
  email: string;
  role: UserRole;
  twoFactorRequired: boolean;
}

interface TeamManagementProps {
  /** The org/company name shown in the header tag */
  organisationName?: string;
  /** Whether the current user can perform admin actions */
  canAdmin?: boolean;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<
  UserRole,
  { label: string; description: string; badgeBg: string; badgeColor: string }
> = {
  Admin: {
    label: "Admin",
    description: "Full access — all projects, users & settings",
    badgeBg: "#f0f1ec",
    badgeColor: "#5a6348",
  },
  Surveyor: {
    label: "Surveyor",
    description: "Create projects, upload survey documents",
    badgeBg: "#e8edf5",
    badgeColor: "#3a5a8a",
  },
  Installer: {
    label: "Installer",
    description: "Assigned projects only, upload evidence",
    badgeBg: "#e8f5f0",
    badgeColor: "#2a7a5a",
  },
  Auditor: {
    label: "Auditor",
    description: "Read-only view, add review notes",
    badgeBg: "#f5f0e8",
    badgeColor: "#8a6a2a",
  },
};

const AVATAR_PALETTES: Array<{ bg: string; text: string }> = [
  { bg: "#f0f1ec", text: "#5a6348" },
  { bg: "#e8edf5", text: "#3a5a8a" },
  { bg: "#e8f5f0", text: "#2a7a5a" },
  { bg: "#f5f0e8", text: "#8a6a2a" },
  { bg: "#f0edf5", text: "#6a3a8a" },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiGetMembers(): Promise<TeamMember[]> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch team members");
  const data = await res.json();
  return data.map((m: TeamMember & { joinedAt: string; lastActiveAt: string }) => ({
    ...m,
    joinedAt: m.joinedAt ? new Date(m.joinedAt) : null,
    lastActiveAt: m.lastActiveAt ? new Date(m.lastActiveAt) : null,
  }));
}

async function apiInviteMember(payload: InvitePayload): Promise<TeamMember> {
  const res = await fetch("/api/users/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to send invite");
  }
  return res.json();
}

async function apiUpdateRole(userId: string, role: UserRole): Promise<void> {
  const res = await fetch(`/api/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error("Failed to update role");
}

async function apiSetStatus(
  userId: string,
  status: "active" | "inactive"
): Promise<void> {
  const res = await fetch(`/api/users/${userId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
}

async function apiResendInvite(userId: string): Promise<void> {
  const res = await fetch(`/api/users/${userId}/resend-invite`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to resend invite");
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarPalette(id: string): { bg: string; text: string } {
  // Deterministic colour from id hash
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + hash * 31;
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function formatJoined(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCards({ members }: { members: TeamMember[] }) {
  const active = members.filter((m) => m.status === "active").length;
  const admins = members.filter((m) => m.role === "Admin").length;
  const pending = members.filter((m) => m.status === "pending").length;

  const cards = [
    { label: "Total members", value: members.length },
    { label: "Active", value: active },
    { label: "Admins", value: admins },
    { label: "Pending invite", value: pending },
  ];

  return (
    <div style={styles.statRow}>
      {cards.map((c) => (
        <div key={c.label} style={styles.statCard}>
          <div style={styles.statNum}>{c.value}</div>
          <div style={styles.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const meta = ROLE_META[role];
  return (
    <span
      style={{
        ...styles.roleBadge,
        background: meta.badgeBg,
        color: meta.badgeColor,
      }}
    >
      {meta.label}
    </span>
  );
}

function StatusCell({ status }: { status: MemberStatus }) {
  const dotColor =
    status === "active" ? "#5a9a62" : status === "pending" ? "#e0a840" : "#ccc";
  const label =
    status === "active" ? "Active" : status === "pending" ? "Pending" : "Inactive";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
    </div>
  );
}

function MemberRow({
  member,
  canAdmin,
  onToggleStatus,
  onResendInvite,
  onEditRole,
}: {
  member: TeamMember;
  canAdmin: boolean;
  onToggleStatus: (m: TeamMember) => void;
  onResendInvite: (m: TeamMember) => void;
  onEditRole: (m: TeamMember) => void;
}) {
  const av = avatarPalette(member.id);
  return (
    <div style={styles.tRow}>
      <div>
        <div
          style={{
            ...styles.avatar,
            background: av.bg,
            color: av.text,
          }}
        >
          {initials(member.name)}
        </div>
      </div>
      <div>
        <div style={styles.memberName}>{member.name}</div>
        <div style={styles.memberEmail}>{member.email}</div>
      </div>
      <div>
        <RoleBadge role={member.role} />
      </div>
      <div>
        <StatusCell status={member.status} />
      </div>
      <div style={{ fontSize: 12, color: "#aaa" }}>
        {formatJoined(member.joinedAt)}
      </div>
      {canAdmin && (
        <div style={{ display: "flex", gap: 5 }}>
          {member.status === "pending" ? (
            <button
              onClick={() => onResendInvite(member)}
              style={styles.actionBtn}
              title="Resend invite"
              aria-label={`Resend invite to ${member.name}`}
            >
              ↻
            </button>
          ) : (
            <button
              onClick={() => onEditRole(member)}
              style={styles.actionBtn}
              title="Edit role"
              aria-label={`Edit ${member.name}'s role`}
            >
              ✎
            </button>
          )}
          <button
            onClick={() => onToggleStatus(member)}
            style={{
              ...styles.actionBtn,
              ...(member.status === "active" ? styles.actionBtnDanger : {}),
            }}
            title={member.status === "active" ? "Deactivate" : "Activate"}
            aria-label={`${member.status === "active" ? "Deactivate" : "Activate"} ${member.name}`}
          >
            {member.status === "active" ? "✕" : "✓"}
          </button>
        </div>
      )}
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (payload: InvitePayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("Surveyor");
  const [tfa, setTfa] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setRole("Surveyor");
    setTfa(true);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onInvite({ name: name.trim(), email: email.trim(), role, twoFactorRequired: tfa });
      handleClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-label="Invite team member">
        <div style={styles.modalHead}>
          <span style={styles.modalTitle}>Invite team member</span>
          <button onClick={handleClose} style={styles.modalClose} aria-label="Close">✕</button>
        </div>
        <div style={styles.modalBody}>
          {error && <div style={styles.formError}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Full name</label>
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Okonkwo"
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Email address</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@risohome.co.uk"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Role</label>
            <div style={styles.roleGrid}>
              {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
                <div
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    ...styles.roleOpt,
                    ...(role === r ? styles.roleOptSelected : {}),
                  }}
                  role="radio"
                  aria-checked={role === r}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setRole(r)}
                >
                  <div style={styles.roleOptName}>{ROLE_META[r].label}</div>
                  <div style={styles.roleOptDesc}>{ROLE_META[r].description}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.tfaRow}>
            <div>
              <div style={styles.tfaLabel}>Require 2FA</div>
              <div style={styles.tfaSub}>Recommended for Admin & Surveyor roles</div>
            </div>
            <label style={styles.toggle} aria-label="Require two-factor authentication">
              <input
                type="checkbox"
                checked={tfa}
                onChange={(e) => setTfa(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
              />
              <div
                style={{
                  ...styles.toggleTrack,
                  background: tfa ? "#7A8465" : "#DBD2C4",
                }}
              >
                <div
                  style={{
                    ...styles.toggleThumb,
                    transform: tfa ? "translateX(16px)" : "translateX(0)",
                  }}
                />
              </div>
            </label>
          </div>
        </div>
        <div style={styles.modalFoot}>
          <button onClick={handleClose} style={styles.btnCancel}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={styles.btnSend}
            disabled={submitting}
          >
            {submitting ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRoleModal({
  member,
  onClose,
  onSave,
}: {
  member: TeamMember | null;
  onClose: () => void;
  onSave: (id: string, role: UserRole) => Promise<void>;
}) {
  const [role, setRole] = useState<UserRole>("Surveyor");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  if (!member) return null;

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await onSave(member.id, role);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-label="Edit role">
        <div style={styles.modalHead}>
          <span style={styles.modalTitle}>Edit role — {member.name}</span>
          <button onClick={onClose} style={styles.modalClose} aria-label="Close">✕</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.roleGrid}>
            {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
              <div
                key={r}
                onClick={() => setRole(r)}
                style={{
                  ...styles.roleOpt,
                  ...(role === r ? styles.roleOptSelected : {}),
                }}
                role="radio"
                aria-checked={role === r}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setRole(r)}
              >
                <div style={styles.roleOptName}>{ROLE_META[r].label}</div>
                <div style={styles.roleOptDesc}>{ROLE_META[r].description}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.modalFoot}>
          <button onClick={onClose} style={styles.btnCancel}>Cancel</button>
          <button onClick={handleSave} style={styles.btnSend} disabled={submitting}>
            {submitting ? "Saving…" : "Save role"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div style={styles.toast}>{message}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamManagement({
  organisationName = "RISO HOME",
  canAdmin = true,
}: TeamManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MemberStatus | "all">("all");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiGetMembers()
      .then(setMembers)
      .catch(() => setFetchError("Could not load team members."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchQ = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      const matchR = roleFilter === "all" || m.role === roleFilter;
      const matchS = statusFilter === "all" || m.status === statusFilter;
      return matchQ && matchR && matchS;
    });
  }, [members, search, roleFilter, statusFilter]);

  const handleToggleStatus = useCallback(async (member: TeamMember) => {
    if (member.status === "pending") return; // Can't toggle pending — use resend
    const newStatus = member.status === "active" ? "inactive" : "active";
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, status: newStatus } : m))
    );
    try {
      await apiSetStatus(member.id, newStatus);
      setToast(`${member.name} ${newStatus === "active" ? "reactivated" : "deactivated"}`);
    } catch {
      // Rollback
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, status: member.status } : m))
      );
      setToast("Could not update status — please try again.");
    }
  }, []);

  const handleResendInvite = useCallback(async (member: TeamMember) => {
    try {
      await apiResendInvite(member.id);
      setToast(`Invite resent to ${member.email}`);
    } catch {
      setToast("Could not resend invite.");
    }
  }, []);

  const handleInvite = useCallback(async (payload: InvitePayload) => {
    const newMember = await apiInviteMember(payload);
    setMembers((prev) => [...prev, { ...newMember, joinedAt: null, lastActiveAt: null }]);
    setToast(`Invite sent to ${payload.email}`);
  }, []);

  const handleSaveRole = useCallback(async (id: string, role: UserRole) => {
    await apiUpdateRole(id, role);
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    setToast("Role updated successfully");
  }, []);

  return (
    <div style={styles.wrap}>
      <Toast message={toast} onDone={() => setToast(null)} />

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.logo}>RH</div>
          <span style={styles.headerTitle}>Team</span>
        </div>
        <span style={styles.orgTag}>{organisationName}</span>
      </div>

      <div style={styles.body}>
        {fetchError && <div style={styles.errorBanner}>{fetchError}</div>}

        <StatCards members={members} />

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon}>⌕</span>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            style={styles.tbSelect}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}
          >
            <option value="all">All roles</option>
            {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            style={styles.tbSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MemberStatus | "all")}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>

          {canAdmin && (
            <button style={styles.inviteBtn} onClick={() => setInviteOpen(true)}>
              + Invite member
            </button>
          )}
        </div>

        {/* Table */}
        <div style={styles.teamTable}>
          <div style={{ ...styles.tRow, ...styles.tHead }}>
            <div />
            <div>Member</div>
            <div>Role</div>
            <div>Status</div>
            <div>Joined</div>
            {canAdmin && <div />}
          </div>

          {loading ? (
            <div style={styles.empty}>Loading team…</div>
          ) : filtered.length === 0 ? (
            <div style={styles.empty}>No members match your filters.</div>
          ) : (
            filtered.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                canAdmin={canAdmin}
                onToggleStatus={handleToggleStatus}
                onResendInvite={handleResendInvite}
                onEditRole={setEditingMember}
              />
            ))
          )}
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
      />

      <EditRoleModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSave={handleSaveRole}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    fontFamily: "'Satoshi', sans-serif",
    background: "#F5F5F2",
    color: "#333",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #DBD2C4",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    width: 32, height: 32,
    background: "#7A8465",
    borderRadius: 6,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 700, fontSize: 11,
  },
  headerTitle: { fontSize: 14, fontWeight: 700, color: "#333" },
  orgTag: {
    fontSize: 12, color: "#7A8465",
    background: "#f0f1ec",
    padding: "4px 12px",
    borderRadius: 20, fontWeight: 500,
  },
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 },
  errorBanner: {
    background: "#fce8e8", color: "#b03030",
    borderRadius: 8, padding: "10px 14px", fontSize: 13,
  },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 },
  statCard: {
    background: "#fff", borderRadius: 8,
    border: "1px solid #DBD2C4", padding: "12px 14px",
  },
  statNum: { fontSize: 22, fontWeight: 700, color: "#7A8465" },
  statLabel: {
    fontSize: 11, color: "#999", marginTop: 2,
    fontWeight: 500, textTransform: "uppercase", letterSpacing: ".05em",
  },
  toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  searchWrap: { flex: 1, minWidth: 160, position: "relative" },
  searchIcon: {
    position: "absolute", left: 9, top: "50%",
    transform: "translateY(-50%)",
    color: "#bbb", fontSize: 17, pointerEvents: "none",
  },
  searchInput: {
    width: "100%", padding: "7px 10px 7px 30px",
    fontFamily: "'Satoshi', sans-serif", fontSize: 13,
    border: "1px solid #DBD2C4", borderRadius: 8,
    background: "#fff", color: "#333", outline: "none",
  },
  tbSelect: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid #DBD2C4",
    background: "#fff", color: "#333", cursor: "pointer",
  },
  inviteBtn: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 12, fontWeight: 700,
    padding: "7px 16px", borderRadius: 8,
    border: "none", background: "#7A8465", color: "#fff",
    cursor: "pointer", flexShrink: 0,
  },
  teamTable: {
    background: "#fff", borderRadius: 12,
    border: "1px solid #DBD2C4", overflow: "hidden",
  },
  tHead: {
    background: "#F5F5F2",
    borderBottom: "1px solid #DBD2C4",
    fontSize: 11, fontWeight: 700, color: "#999",
    textTransform: "uppercase", letterSpacing: ".06em",
    padding: "9px 16px",
  },
  tRow: {
    display: "grid",
    gridTemplateColumns: "40px 1fr 100px 90px 80px 60px",
    gap: 10, padding: "11px 16px",
    alignItems: "center",
    borderBottom: "1px solid #f0f1ec",
  },
  avatar: {
    width: 34, height: 34, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
  memberName: { fontSize: 13, fontWeight: 500, color: "#333" },
  memberEmail: { fontSize: 11, color: "#aaa", marginTop: 1 },
  roleBadge: {
    fontSize: 10, fontWeight: 700,
    padding: "3px 8px", borderRadius: 10,
    display: "inline-block",
  },
  actionBtn: {
    background: "none", border: "1px solid #DBD2C4",
    borderRadius: 6, cursor: "pointer",
    color: "#aaa", fontSize: 13, padding: "5px 8px",
    fontFamily: "'Satoshi', sans-serif",
  },
  actionBtnDanger: { color: "#c06060", borderColor: "#e8a0a0" },
  empty: {
    textAlign: "center", padding: 32,
    color: "#aaa", fontSize: 13,
  },
  // Modal
  overlay: {
    minHeight: 500,
    background: "rgba(0,0,0,.38)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  modal: {
    background: "#fff", borderRadius: 14,
    border: "1px solid #DBD2C4",
    width: "100%", maxWidth: 440, overflow: "hidden",
  },
  modalHead: {
    padding: "18px 22px 14px",
    borderBottom: "1px solid #f0f1ec",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  modalTitle: { fontSize: 15, fontWeight: 700, color: "#333" },
  modalClose: {
    background: "none", border: "none",
    cursor: "pointer", color: "#bbb", fontSize: 18,
    padding: "2px 6px", borderRadius: 4,
  },
  modalBody: {
    padding: "20px 22px",
    display: "flex", flexDirection: "column", gap: 14,
  },
  formError: {
    background: "#fce8e8", color: "#b03030",
    borderRadius: 8, padding: "8px 12px", fontSize: 12,
  },
  field: {},
  fieldLabel: {
    display: "block", fontSize: 12, fontWeight: 700,
    color: "#888", textTransform: "uppercase", letterSpacing: ".05em",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 13, padding: "9px 12px",
    border: "1px solid #DBD2C4", borderRadius: 8,
    color: "#333", background: "#fff", outline: "none",
  },
  roleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  roleOpt: {
    border: "1px solid #DBD2C4", borderRadius: 8,
    padding: "10px 12px", cursor: "pointer", transition: "all .15s",
  },
  roleOptSelected: { borderColor: "#7A8465", background: "#f0f1ec" },
  roleOptName: { fontSize: 13, fontWeight: 500, color: "#333" },
  roleOptDesc: { fontSize: 11, color: "#aaa", marginTop: 2 },
  tfaRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    border: "1px solid #DBD2C4", borderRadius: 8,
  },
  tfaLabel: { fontSize: 13, fontWeight: 500, color: "#333" },
  tfaSub: { fontSize: 11, color: "#aaa", marginTop: 1 },
  toggle: { position: "relative", display: "inline-block", cursor: "pointer" },
  toggleTrack: {
    width: 36, height: 20,
    borderRadius: 10, transition: "background .2s",
    display: "flex", alignItems: "center", padding: "0 3px",
  },
  toggleThumb: {
    width: 14, height: 14,
    background: "#fff", borderRadius: "50%",
    transition: "transform .2s",
  },
  modalFoot: {
    padding: "14px 22px",
    borderTop: "1px solid #f0f1ec",
    display: "flex", gap: 8, justifyContent: "flex-end",
  },
  btnCancel: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 13, padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #DBD2C4",
    background: "#fff", color: "#555", cursor: "pointer",
  },
  btnSend: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 13, fontWeight: 700, padding: "8px 20px",
    borderRadius: 8, border: "none",
    background: "#7A8465", color: "#fff", cursor: "pointer",
  },
  toast: {
    position: "absolute", top: 12, right: 12,
    background: "#333", color: "#fff",
    fontSize: 12, fontWeight: 500,
    padding: "8px 14px", borderRadius: 8, zIndex: 10,
  },
};
