/**
 * ProjectComplaintsWiring.md
 *
 * Step-by-step instructions to link complaints directly to project files
 * across the whole RISO HUB dashboard.
 *
 * Four integration points:
 *   1. Project detail view — add Complaints as a tab
 *   2. ProjectsView cards  — show complaint count badge
 *   3. DashboardOverview   — complaint count in project table
 *   4. ComplaintsModule    — deep-link back to project
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. PROJECT DETAIL TAB BAR
// Add ProjectComplaintsTab as a new tab alongside Checklist / Documents / Files
// ════════════════════════════════════════════════════════════════════════════

/**
 * In RisoHub.jsx, find where you render the per-project views and add a
 * tab bar so the user can switch between Compliance, Documents, Files,
 * and the new Complaints tab.
 *
 * Add this ProjectDetailView component and render it when a project is selected.
 */

import React, { useState } from "react";
import MCSChecklist         from "./MCSChecklist";
import DocumentGenerator    from "./DocumentGenerator";
import FileUploadModule     from "./FileUploadModule";
import ProjectComplaintsTab from "./ProjectComplaintsTab";

type ProjectTab = "checklist" | "documents" | "files" | "complaints";

function ProjectDetailView({
  project,
  token,
  userRole,
  onReadyForHandover,
  onNavigateToComplaints,
  onOpenComplaint,
}: {
  project: any;
  token: string;
  userRole: string;
  onReadyForHandover: () => void;
  onNavigateToComplaints: () => void;
  onOpenComplaint: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ProjectTab>("checklist");

  const TABS: { key: ProjectTab; label: string; icon: string; roles: string[] }[] = [
    { key: "checklist",  label: "Compliance",  icon: "✓", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
    { key: "documents",  label: "Documents",   icon: "⊞", roles: ["Admin", "Surveyor", "Auditor"] },
    { key: "files",      label: "Files",       icon: "⊟", roles: ["Admin", "Surveyor", "Installer"] },
    { key: "complaints", label: "Complaints",  icon: "◉", roles: ["Admin", "Surveyor", "Auditor"] },
  ];

  const visibleTabs = TABS.filter(t => t.roles.includes(userRole));

  return (
    <div>
      {/* Project header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em", color: "#333" }}>
          {project.customerName}
        </h1>
        <div style={{ fontSize: 13.5, color: "#888" }}>
          {project.address}, {project.postcode} · {project.projectType}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #f0f1ec", marginBottom: 24 }}>
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "9px 16px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.key ? "#7A8465" : "transparent"}`,
              marginBottom: -2,
              fontSize: 13.5,
              fontWeight: 600,
              color: activeTab === tab.key ? "#7A8465" : "#888",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderRadius: "6px 6px 0 0",
              fontFamily: "Satoshi, sans-serif",
            }}
          >
            <span style={{ opacity: 0.7 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "checklist" && (
        <MCSChecklist
          projectId={project.id}
          projectType={project.projectType}
          token={token}
          userRole={userRole}
          onReadyForHandover={onReadyForHandover}
        />
      )}

      {activeTab === "documents" && (
        <DocumentGenerator
          projectId={project.id}
          token={token}
          userRole={userRole}
        />
      )}

      {activeTab === "files" && (
        <FileUploadModule
          projectId={project.id}
          token={token}
          userRole={userRole}
        />
      )}

      {activeTab === "complaints" && (
        <ProjectComplaintsTab
          project={project}
          token={token}
          userRole={userRole}
          onNavigateToComplaints={onNavigateToComplaints}
          onOpenComplaint={onOpenComplaint}
        />
      )}
    </div>
  );
}

export { ProjectDetailView };


// ════════════════════════════════════════════════════════════════════════════
// 2. HOW TO UPDATE AppShell IN RisoHub.jsx
// ════════════════════════════════════════════════════════════════════════════

/*

Replace the individual checklist/documents/files view blocks in AppShell
with a single ProjectDetailView block that handles all tabs internally.

BEFORE (three separate blocks):
  {activeView === "checklist" && selectedProjectId && (
    <MCSChecklist ... />
  )}
  {activeView === "documents" && selectedProjectId && (
    <DocumentGenerator ... />
  )}
  {activeView === "files" && selectedProjectId && (
    <FileUploadModule ... />
  )}

AFTER (single unified block):
  {selectedProjectId && !["dashboard","projects","team","settings","audit","qualifications","complaints"].includes(activeView) && (
    <ProjectDetailView
      project={selectedProject}
      token={token!}
      userRole={user?.role ?? "Installer"}
      onReadyForHandover={() => {}} // tab switching handled internally
      onNavigateToComplaints={() => navigate("complaints")}
      onOpenComplaint={(id) => {
        // Navigate to complaints module and pre-select this complaint
        navigate("complaints");
        // Pass the complaint ID via state or a ref so ComplaintsModule opens it
        setSelectedComplaintId(id);
      }}
    />
  )}

Also add to AppShell state:
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);

And update the complaints view mount:
  {activeView === "complaints" && (
    <ComplaintsModule
      token={token!}
      userRole={user?.role ?? "Auditor"}
      initialComplaintId={selectedComplaintId}  // see note below
      onClearInitial={() => setSelectedComplaintId(null)}
    />
  )}

*/


// ════════════════════════════════════════════════════════════════════════════
// 3. ADD initialComplaintId PROP TO ComplaintsModule
// ════════════════════════════════════════════════════════════════════════════

/*

In ComplaintsModule.tsx, add these two optional props:

  interface Props {
    token:              string;
    userRole:           string;
    initialComplaintId?: string | null;   // ADD THIS
    onClearInitial?:    () => void;        // ADD THIS
  }

Then in the component body, add a useEffect to auto-select:

  useEffect(() => {
    if (initialComplaintId && complaints.length > 0) {
      const found = complaints.find(c => c.id === initialComplaintId);
      if (found) {
        setSelected(found);
        onClearInitial?.();
      }
    }
  }, [initialComplaintId, complaints]);

This means clicking a complaint card in ProjectComplaintsTab will
navigate to ComplaintsModule AND open that specific complaint directly.

*/


// ════════════════════════════════════════════════════════════════════════════
// 4. ADD COMPLAINT COUNT BADGE TO ProjectsView CARDS
// ════════════════════════════════════════════════════════════════════════════

/*

In the ProjectsView component's project cards, fetch complaint counts
alongside the project list, then show a badge if open complaints exist.

Option A — fetch counts from a new endpoint:
  GET /api/complaints/counts?projectIds=id1,id2,id3
  Returns: { "projectId": { open: N, emergency: N } }

Option B (simpler) — add a complaintCount field to the GET /api/projects response
in your Express projects route:

  // In projectsRoutes.ts GET /:
  const projects = await Project.findAll({ ... });

  // Attach complaint counts
  const ids = projects.map(p => p.id);
  const complaints = await Complaint.findAll({
    where: {
      projectId: ids,
      status: { [Op.notIn]: ["resolved", "closed"] },
    },
    attributes: ["projectId", "priority"],
  });

  const countMap: Record<string, { open: number; emergency: number }> = {};
  for (const c of complaints) {
    if (!countMap[c.projectId]) countMap[c.projectId] = { open: 0, emergency: 0 };
    countMap[c.projectId].open++;
    if (c.priority === "emergency") countMap[c.projectId].emergency++;
  }

  const result = projects.map(p => ({
    ...p.toJSON(),
    complaintCounts: countMap[p.id] ?? { open: 0, emergency: 0 },
  }));

  res.json({ projects: result });

Then in the project card JSX, after the status badge add:

  {p.complaintCounts?.open > 0 && (
    <span style={{
      padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: p.complaintCounts.emergency > 0 ? "#fdf0f0" : "#fdf4ed",
      color:      p.complaintCounts.emergency > 0 ? "#c05050" : "#c07030",
      border:     `1px solid ${p.complaintCounts.emergency > 0 ? "#e8b4b4" : "#e8c4a0"}`,
    }}>
      {p.complaintCounts.emergency > 0 ? "⚡ " : ""}
      {p.complaintCounts.open} complaint{p.complaintCounts.open === 1 ? "" : "s"}
    </span>
  )}

*/


// ════════════════════════════════════════════════════════════════════════════
// 5. LINK BACK TO PROJECT FROM COMPLAINT DETAIL VIEW
// ════════════════════════════════════════════════════════════════════════════

/*

In ComplaintDetail inside ComplaintsModule.tsx, add a "View project →" link
next to the breadcrumb when projectId is present:

  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
    <button style={dd.back} onClick={onBack}>← All complaints</button>
    {complaint.projectId && onNavigateToProject && (
      <button
        style={{ ...dd.back, color: "#555" }}
        onClick={() => onNavigateToProject(complaint.projectId!)}
      >
        View project →
      </button>
    )}
  </div>

Add the optional prop to ComplaintsModule:
  onNavigateToProject?: (projectId: string) => void;

Pass it in from AppShell:
  <ComplaintsModule
    token={token!}
    userRole={user?.role ?? "Auditor"}
    onNavigateToProject={(projectId) => {
      setSelectedProjectId(projectId);
      navigate("project-detail"); // or whichever view key you use
    }}
  />

*/


// ════════════════════════════════════════════════════════════════════════════
// 6. NAV ITEMS — final complete list for RisoHub.jsx
// ════════════════════════════════════════════════════════════════════════════

export const FINAL_NAV_ITEMS = [
  { view: "dashboard",      label: "Dashboard",      icon: "⊡", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
  { view: "projects",       label: "Projects",       icon: "◫", roles: ["Admin", "Surveyor", "Installer", "Auditor"] },
  { view: "qualifications", label: "Qualifications", icon: "◈", roles: ["Admin", "Auditor"] },
  { view: "complaints",     label: "Complaints",     icon: "◉", roles: ["Admin", "Surveyor", "Auditor"] },
  { view: "team",           label: "Team",           icon: "⊕", roles: ["Admin"], dividerBefore: true },
  { view: "settings",       label: "Settings",       icon: "⊙", roles: ["Admin"] },
  { view: "audit",          label: "Audit Log",      icon: "⊘", roles: ["Admin"] },
];

/*
NOTE: Checklist, Documents, and Files are no longer top-level nav items —
they live inside the ProjectDetailView tab bar. The user reaches them by
selecting a project from the Projects view.

If you prefer to keep them as top-level nav items as well (e.g. for
quick access without choosing a project first), you can add them back:

  { view: "checklist",  label: "Compliance", icon: "✓", roles: [...] },
  { view: "documents",  label: "Documents",  icon: "⊞", roles: [...] },
  { view: "files",      label: "Files",      icon: "⊟", roles: [...] },
*/
