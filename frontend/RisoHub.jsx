/**
 * RisoHub.jsx — Main Dashboard Shell
 * Wires together: AuthGuard, routing, sidebar, and all Phase 1/2 modules.
 *
 * Imports assume the following already exist in your project:
 *   auth/useAuth.ts          → useAuth, AuthGuard
 *   auth/LoginPage.tsx       → LoginPage
 *   MCSChecklist.tsx         → MCSChecklist
 *   DocumentGenerator.tsx    → DocumentGenerator
 *   FileUploadModule.tsx     → FileUploadModule
 *   TeamManagement.tsx       → TeamManagement
 *   SettingsPage.tsx         → SettingsPage
 *
 * Drop this file into your src/ root and render <RisoHub /> from main.tsx / index.tsx.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth, AuthGuard } from "./auth/useAuth";
import LoginPage from "./auth/LoginPage";
import TwoFactorSetupPanel from "./components/TwoFactorSetupPanel";
import MCSChecklist from "./MCSChecklist";
import DocumentGenerator from "./DocumentGenerator";
import FileUploadModule from "./FileUploadModule";
import TeamManagement from "./TeamManagement";
import SettingsPage from "./SettingsPage";

// ─── Types ────────────────────────────────────────────────────────────────────

type View =
  | "dashboard"
  | "projects"
  | "checklist"
  | "documents"
  | "files"
  | "team"
  | "settings"
  | "audit";

interface Project {
  id: string;
  customerName: string;
  address: string;
  postcode: string;
  status: "survey" | "design" | "install" | "commission" | "audit";
  projectType: "ASHP" | "GSHP";
  assignedTo: string;
  createdAt: string;
}

interface ComplianceSummary {
  total: number;
  complete: number;
  nonCompliant: number;
  pending: number;
  naCount: number;
  pct: number;
  readyForHandover: boolean;
  blockingIssues: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Project["status"], string> = {
  survey: "Survey",
  design: "Design",
  install: "Install",
  commission: "Commission",
  audit: "Audit",
};

const STATUS_COLORS: Record<Project["status"], string> = {
  survey: "#C9C8BE",
  design: "#b8c0a8",
  install: "#7A8465",
  commission: "#5a6348",
  audit: "#333333",
};

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV_ITEMS: {
  view: View;
  label: string;
  icon: string;
  roles: string[];
  dividerBefore?: boolean;
}[] = [
  { view: "dashboard", label: "Dashboard", icon: "⊡", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
  { view: "projects",  label: "Projects",  icon: "◫", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
  { view: "checklist", label: "Compliance", icon: "✓", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
  { view: "documents", label: "Documents",  icon: "⊞", roles: ["Admin", "Surveyor", "Auditor"] },
  { view: "files",     label: "Files",      icon: "⊟", roles: ["Admin", "Surveyor", "Installer"] },
  { view: "team",      label: "Team",       icon: "⊕", roles: ["Admin"], dividerBefore: true },
  { view: "settings",  label: "Settings",   icon: "⊙", roles: ["Admin"] },
  { view: "audit",     label: "Audit Log",  icon: "⊘", roles: ["Admin"] },
];

// ─── RH Monogram Logo ─────────────────────────────────────────────────────────

function RHLogo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#7A8465",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#fff",
          fontWeight: 700,
          fontSize: size * 0.38,
          letterSpacing: "-0.03em",
          fontFamily: "Satoshi, sans-serif",
          lineHeight: 1,
        }}
      >
        RH
      </span>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  activeView,
  onNavigate,
  userRole,
  userName,
  onLogout,
}: {
  activeView: View;
  onNavigate: (v: View) => void;
  userRole: string;
  userName: string;
  onLogout: () => void;
}) {
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.sidebarLogo}>
        <RHLogo size={34} />
        <div style={{ marginLeft: 10 }}>
          <div style={styles.sidebarBrand}>RISO HUB</div>
          <div style={styles.sidebarSubBrand}>RISO HOME</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {visibleItems.map((item) => (
          <React.Fragment key={item.view}>
            {item.dividerBefore && <div style={styles.navDivider} />}
            <button
              onClick={() => onNavigate(item.view)}
              style={{
                ...styles.navItem,
                ...(activeView === item.view ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* User footer */}
      <div style={styles.sidebarFooter}>
        <div style={styles.userAvatar}>
          {userName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.userName}>{userName}</div>
          <div style={styles.userRole}>{userRole}</div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn} title="Sign out">
          ⎋
        </button>
      </div>
    </aside>
  );
}

// ─── Dashboard Overview ───────────────────────────────────────────────────────

function DashboardOverview({
  projects,
  onSelectProject,
}: {
  projects: Project[];
  onSelectProject: (id: string) => void;
}) {
  const statusCounts = projects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const stats = [
    { label: "Total Projects", value: projects.length, accent: false },
    { label: "In Survey", value: statusCounts.survey || 0, accent: false },
    { label: "Installing", value: statusCounts.install || 0, accent: true },
    { label: "Completed", value: statusCounts.audit || 0, accent: false },
  ];

  return (
    <div>
      <h1 style={styles.pageTitle}>Dashboard</h1>

      {/* Stat cards */}
      <div style={styles.statGrid}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              ...styles.statCard,
              ...(s.accent ? styles.statCardAccent : {}),
            }}
          >
            <div style={styles.statValue}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent projects */}
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Recent Projects</h2>
      </div>
      <div style={styles.projectTable}>
        <div style={styles.tableHeader}>
          <span>Customer</span>
          <span>Address</span>
          <span>Type</span>
          <span>Status</span>
          <span>Created</span>
        </div>
        {projects.length === 0 && (
          <div style={styles.emptyState}>No projects yet.</div>
        )}
        {projects.slice(0, 8).map((p) => (
          <button
            key={p.id}
            style={styles.tableRow}
            onClick={() => onSelectProject(p.id)}
          >
            <span style={styles.tableCell}>{p.customerName}</span>
            <span style={{ ...styles.tableCell, color: "#888", fontSize: 13 }}>
              {p.address}, {p.postcode}
            </span>
            <span style={styles.tableCell}>{p.projectType}</span>
            <span style={styles.tableCell}>
              <span
                style={{
                  ...styles.statusBadge,
                  background: STATUS_COLORS[p.status] + "33",
                  color: STATUS_COLORS[p.status],
                  borderColor: STATUS_COLORS[p.status] + "66",
                }}
              >
                {STATUS_LABELS[p.status]}
              </span>
            </span>
            <span style={{ ...styles.tableCell, color: "#888", fontSize: 13 }}>
              {new Date(p.createdAt).toLocaleDateString("en-GB")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Projects list with "Open in Checklist / Documents / Files" ───────────────

function ProjectsView({
  projects,
  onOpenChecklist,
  onOpenDocuments,
  onOpenFiles,
  userRole,
}: {
  projects: Project[];
  onOpenChecklist: (projectId: string) => void;
  onOpenDocuments: (projectId: string) => void;
  onOpenFiles: (projectId: string) => void;
  userRole: string;
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase()) ||
      p.postcode.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <h1 style={styles.pageTitle}>Projects</h1>

      <div style={styles.toolbar}>
        <input
          style={styles.searchInput}
          placeholder="Search by customer, address or postcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={styles.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div style={styles.projectCards}>
        {filtered.map((p) => (
          <div key={p.id} style={styles.projectCard}>
            <div style={styles.projectCardTop}>
              <div>
                <div style={styles.projectCardName}>{p.customerName}</div>
                <div style={styles.projectCardAddress}>
                  {p.address}, {p.postcode}
                </div>
              </div>
              <span
                style={{
                  ...styles.statusBadge,
                  background: STATUS_COLORS[p.status] + "22",
                  color: STATUS_COLORS[p.status],
                  borderColor: STATUS_COLORS[p.status] + "55",
                }}
              >
                {STATUS_LABELS[p.status]}
              </span>
            </div>
            <div style={styles.projectCardMeta}>
              <span>{p.projectType}</span>
              <span>·</span>
              <span>{new Date(p.createdAt).toLocaleDateString("en-GB")}</span>
            </div>
            <div style={styles.projectCardActions}>
              <button
                style={styles.cardActionBtn}
                onClick={() => onOpenChecklist(p.id)}
              >
                ✓ Compliance
              </button>
              {["Admin", "Surveyor", "Auditor"].includes(userRole) && (
                <button
                  style={styles.cardActionBtn}
                  onClick={() => onOpenDocuments(p.id)}
                >
                  ⊞ Documents
                </button>
              )}
              {["Admin", "Surveyor", "Installer"].includes(userRole) && (
                <button
                  style={styles.cardActionBtn}
                  onClick={() => onOpenFiles(p.id)}
                >
                  ⊟ Files
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={styles.emptyState}>No projects match your search.</div>
        )}
      </div>
    </div>
  );
}

// ─── Audit Log View (read-only table) ────────────────────────────────────────

function AuditLogView() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audit-log?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <h1 style={styles.pageTitle}>Audit Log</h1>
      {loading ? (
        <div style={styles.emptyState}>Loading…</div>
      ) : (
        <div style={styles.projectTable}>
          <div style={{ ...styles.tableHeader, gridTemplateColumns: "1fr 1fr 2fr 2fr 1fr" }}>
            <span>Timestamp</span>
            <span>User</span>
            <span>Action</span>
            <span>Entity</span>
            <span>IP</span>
          </div>
          {entries.map((e, i) => (
            <div
              key={i}
              style={{
                ...styles.tableRow,
                gridTemplateColumns: "1fr 1fr 2fr 2fr 1fr",
                cursor: "default",
              }}
            >
              <span style={{ ...styles.tableCell, fontSize: 12, color: "#888" }}>
                {new Date(e.timestamp).toLocaleString("en-GB")}
              </span>
              <span style={styles.tableCell}>{e.userId}</span>
              <span style={{ ...styles.tableCell, fontFamily: "monospace", fontSize: 12 }}>
                {e.action}
              </span>
              <span style={{ ...styles.tableCell, fontSize: 12, color: "#666" }}>
                {e.entityType} #{e.entityId}
              </span>
              <span style={{ ...styles.tableCell, fontSize: 12, color: "#888" }}>
                {e.ipAddress}
              </span>
            </div>
          ))}
          {entries.length === 0 && (
            <div style={styles.emptyState}>No audit entries found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main App Shell ───────────────────────────────────────────────────────────

function AppShell() {
  const { user, token, logout, twoFactorSetupRequired, dismissSetupPrompt } = useAuth();
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Fetch projects on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/projects", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
  }, [token]);

  // Seed checklist when a project is first opened
  const handleSelectProject = useCallback(
    async (projectId: string, targetView: View = "checklist") => {
      setSelectedProjectId(projectId);
      setActiveView(targetView);
    },
    []
  );

  // Called by MCSChecklist when all required items are complete
  const handleReadyForHandover = useCallback(() => {
    setActiveView("documents");
  }, []);

  const navigate = useCallback((view: View) => {
    setActiveView(view);
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div style={styles.shell}>
      <Sidebar
        activeView={activeView}
        onNavigate={navigate}
        userRole={user?.role ?? "Installer"}
        userName={user?.name ?? "User"}
        onLogout={logout}
      />

      <main style={styles.main}>
        {twoFactorSetupRequired && user?.role === "Admin" && (
          <div style={{ padding: "20px 40px 0" }}>
            <TwoFactorSetupPanel
              enabled={false}
              compact
              onStatusChange={(enabled) => { if (enabled) dismissSetupPrompt(); }}
            />
          </div>
        )}
        <div style={styles.mainInner}>

          {/* ── Dashboard ── */}
          {activeView === "dashboard" && (
            <DashboardOverview
              projects={projects}
              onSelectProject={(id) => handleSelectProject(id, "checklist")}
            />
          )}

          {/* ── Projects ── */}
          {activeView === "projects" && (
            <ProjectsView
              projects={projects}
              onOpenChecklist={(id) => handleSelectProject(id, "checklist")}
              onOpenDocuments={(id) => handleSelectProject(id, "documents")}
              onOpenFiles={(id) => handleSelectProject(id, "files")}
              userRole={user?.role ?? "Installer"}
            />
          )}

          {/* ── Checklist ── */}
          {activeView === "checklist" && (
            <div>
              <div style={styles.viewHeader}>
                <h1 style={styles.pageTitle}>
                  MCS Compliance Checklist
                  {selectedProject && (
                    <span style={styles.pageTitleSub}>
                      — {selectedProject.customerName}
                    </span>
                  )}
                </h1>
                {!selectedProjectId && (
                  <p style={styles.hint}>
                    Select a project from{" "}
                    <button
                      style={styles.inlineLink}
                      onClick={() => navigate("projects")}
                    >
                      Projects
                    </button>{" "}
                    to view its checklist.
                  </p>
                )}
              </div>
              {selectedProjectId && (
                <MCSChecklist
                  projectId={selectedProjectId}
                  projectType={selectedProject?.projectType ?? "ASHP"}
                  token={token!}
                  userRole={user?.role ?? "Installer"}
                  onReadyForHandover={handleReadyForHandover}
                />
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {activeView === "documents" && (
            <div>
              <div style={styles.viewHeader}>
                <h1 style={styles.pageTitle}>
                  Document Generator
                  {selectedProject && (
                    <span style={styles.pageTitleSub}>
                      — {selectedProject.customerName}
                    </span>
                  )}
                </h1>
                {!selectedProjectId && (
                  <p style={styles.hint}>
                    Select a project from{" "}
                    <button
                      style={styles.inlineLink}
                      onClick={() => navigate("projects")}
                    >
                      Projects
                    </button>{" "}
                    to generate documents.
                  </p>
                )}
              </div>
              {selectedProjectId && (
                <DocumentGenerator
                  projectId={selectedProjectId}
                  token={token!}
                  userRole={user?.role ?? "Auditor"}
                />
              )}
            </div>
          )}

          {/* ── Files ── */}
          {activeView === "files" && (
            <div>
              <div style={styles.viewHeader}>
                <h1 style={styles.pageTitle}>
                  File Library
                  {selectedProject && (
                    <span style={styles.pageTitleSub}>
                      — {selectedProject.customerName}
                    </span>
                  )}
                </h1>
                {!selectedProjectId && (
                  <p style={styles.hint}>
                    Select a project from{" "}
                    <button
                      style={styles.inlineLink}
                      onClick={() => navigate("projects")}
                    >
                      Projects
                    </button>{" "}
                    to manage its files.
                  </p>
                )}
              </div>
              {selectedProjectId && (
                <FileUploadModule
                  projectId={selectedProjectId}
                  token={token!}
                  userRole={user?.role ?? "Installer"}
                />
              )}
            </div>
          )}

          {/* ── Team ── */}
          {activeView === "team" && (
            <TeamManagement token={token!} />
          )}

          {/* ── Settings ── */}
          {activeView === "settings" && (
            <SettingsPage token={token!} userRole={user?.role ?? "Admin"} />
          )}

          {/* ── Audit Log ── */}
          {activeView === "audit" && <AuditLogView />}

        </div>
      </main>
    </div>
  );
}

// ─── Root export — wraps everything in AuthGuard ──────────────────────────────

export default function RisoHub() {
  return (
    <AuthGuard fallback={<LoginPage />}>
      <AppShell />
    </AuthGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  // Shell layout
  shell: {
    display: "flex",
    height: "100vh",
    fontFamily: "Satoshi, sans-serif",
    background: "#F5F5F2",
    color: "#333333",
    overflow: "hidden",
  },

  // Sidebar
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: "#fff",
    borderRight: "1px solid #e8e6e0",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
  },
  sidebarLogo: {
    display: "flex",
    alignItems: "center",
    padding: "20px 16px 16px",
    borderBottom: "1px solid #f0f1ec",
  },
  sidebarBrand: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#333",
  },
  sidebarSubBrand: {
    fontSize: 11,
    color: "#666",
    letterSpacing: "0.08em",
    marginTop: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    color: "#444",
    textAlign: "left",
    borderRadius: 0,
    transition: "background 0.15s, color 0.15s",
  },
  navItemActive: {
    background: "#eef0e8",
    color: "#5a6448",
    fontWeight: 700,
  },
  navIcon: {
    width: 18,
    textAlign: "center",
    fontSize: 15,
    opacity: 0.7,
  },
  navDivider: {
    height: 1,
    background: "#f0f1ec",
    margin: "8px 16px",
  },
  sidebarFooter: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderTop: "1px solid #f0f1ec",
  },
  userAvatar: {
    width: 30,
    height: 30,
    background: "#7A8465",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  userName: { fontSize: 13, fontWeight: 600, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userRole: { fontSize: 12, color: "#555", marginTop: 1 },
  logoutBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#9a9a8e",
    padding: "4px",
    flexShrink: 0,
  },

  // Main content
  main: {
    flex: 1,
    overflow: "auto",
  },
  mainInner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "36px 40px",
  },

  // Page titles
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#333",
    margin: "0 0 24px",
    letterSpacing: "-0.02em",
  },
  pageTitleSub: {
    fontWeight: 400,
    color: "#7A8465",
    fontSize: 18,
    marginLeft: 6,
  },
  viewHeader: { marginBottom: 8 },
  hint: { fontSize: 14, color: "#555", marginBottom: 24 },
  inlineLink: {
    background: "none",
    border: "none",
    color: "#7A8465",
    cursor: "pointer",
    textDecoration: "underline",
    fontSize: "inherit",
    padding: 0,
  },

  // Stat grid
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    marginBottom: 36,
  },
  statCard: {
    background: "#fff",
    border: "1px solid #e8e6e0",
    borderRadius: 10,
    padding: "20px 22px",
  },
  statCardAccent: {
    background: "#7A8465",
    borderColor: "#7A8465",
  },
  statValue: {
    fontSize: 32,
    fontWeight: 700,
    color: "inherit",
    lineHeight: 1,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 13,
    color: "#555",
  },

  // Section headers
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#444",
    margin: 0,
  },

  // Table
  projectTable: {
    background: "#fff",
    border: "1px solid #e8e6e0",
    borderRadius: 10,
    overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1.5fr 2fr 0.7fr 1fr 1fr",
    padding: "10px 18px",
    background: "#f7f7f4",
    borderBottom: "1px solid #e8e6e0",
    fontSize: 11,
    fontWeight: 600,
    color: "#9a9a8e",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1.5fr 2fr 0.7fr 1fr 1fr",
    padding: "12px 18px",
    borderBottom: "1px solid #f0f1ec",
    background: "none",
    border: "none",
    borderBottom: "1px solid #f0f1ec",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    alignItems: "center",
    transition: "background 0.1s",
  },
  tableCell: {
    fontSize: 14,
    color: "#333",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  emptyState: {
    padding: "36px",
    textAlign: "center",
    color: "#666",
    fontSize: 14,
  },

  // Status badge
  statusBadge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid",
  },

  // Toolbar
  toolbar: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    padding: "9px 14px",
    border: "1px solid #e0ded8",
    borderRadius: 8,
    fontSize: 13.5,
    background: "#fff",
    color: "#333",
    outline: "none",
  },
  filterSelect: {
    padding: "9px 12px",
    border: "1px solid #e0ded8",
    borderRadius: 8,
    fontSize: 13.5,
    background: "#fff",
    color: "#333",
    cursor: "pointer",
  },

  // Project cards
  projectCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 16,
  },
  projectCard: {
    background: "#fff",
    border: "1px solid #e8e6e0",
    borderRadius: 10,
    padding: "18px 20px",
  },
  projectCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  projectCardName: {
    fontSize: 15,
    fontWeight: 600,
    color: "#333",
    marginBottom: 2,
  },
  projectCardAddress: {
    fontSize: 12,
    color: "#888",
  },
  projectCardMeta: {
    display: "flex",
    gap: 6,
    fontSize: 12,
    color: "#aaa",
    marginBottom: 14,
  },
  projectCardActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  cardActionBtn: {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #e0ded8",
    borderRadius: 6,
    background: "#f7f7f4",
    color: "#555",
    cursor: "pointer",
    transition: "background 0.15s",
  },
};
