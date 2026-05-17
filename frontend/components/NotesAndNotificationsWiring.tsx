/**
 * NotesAndNotificationsWiring.tsx
 *
 * Exact wiring instructions to integrate:
 *   1. ProjectNotesPanel into every project section tab
 *   2. NotificationCentre bell into the sidebar footer
 *   3. onNavigate handler to route notification clicks
 *   4. teamMembers fetched and passed down
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. UPDATE ProjectDetailView TO ADD NOTES PANEL TO EVERY TAB
// ════════════════════════════════════════════════════════════════════════════

/**
 * In ProjectComplaintsWiring.tsx / ProjectDetailView,
 * import and add ProjectNotesPanel as a persistent panel
 * below the active tab content on every tab.
 *
 * Replace the existing ProjectDetailView with this version:
 */

import React, { useState }    from "react";
import MCSChecklist            from "./MCSChecklist";
import DocumentGenerator       from "./DocumentGenerator";
import FileUploadModule        from "./FileUploadModule";
import ProjectComplaintsTab    from "./ProjectComplaintsTab";
import ProjectNotesPanel       from "./ProjectNotesPanel";

type ProjectTab = "checklist" | "documents" | "files" | "complaints";

interface TeamMember { id: string; name: string; role: string; }
interface CurrentUser { id: string; name: string; role: string; }

function ProjectDetailView({
  project,
  token,
  userRole,
  currentUser,
  teamMembers,
  onReadyForHandover,
  onNavigateToComplaints,
  onOpenComplaint,
}: {
  project:                 any;
  token:                   string;
  userRole:                string;
  currentUser:             CurrentUser;
  teamMembers:             TeamMember[];
  onReadyForHandover:      () => void;
  onNavigateToComplaints:  () => void;
  onOpenComplaint:         (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ProjectTab>("checklist");

  // Map each tab to its notes section key
  const sectionKey: Record<ProjectTab, string> = {
    checklist:  "checklist",
    documents:  "documents",
    files:      "files",
    complaints: "complaints",
  };

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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em", color: "#333", fontFamily: "Satoshi, sans-serif" }}>
          {project.customerName}
        </h1>
        <div style={{ fontSize: 13.5, color: "#888", fontFamily: "Satoshi, sans-serif" }}>
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

      {/* Two-column layout: main content + notes sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>

        {/* Main tab content */}
        <div>
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
            <DocumentGenerator projectId={project.id} token={token} userRole={userRole} />
          )}
          {activeTab === "files" && (
            <FileUploadModule projectId={project.id} token={token} userRole={userRole} />
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

        {/* Notes sidebar — always visible, section-scoped */}
        <div style={{
          position: "sticky",
          top: 24,
          background: "#fff",
          border: "1px solid #e8e6e0",
          borderRadius: 12,
          padding: "18px 16px",
        }}>
          {/* Section label */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: "Satoshi, sans-serif" }}>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} notes
          </div>
          <ProjectNotesPanel
            projectId={project.id}
            section={sectionKey[activeTab]}
            token={token}
            currentUser={currentUser}
            teamMembers={teamMembers}
          />
        </div>

      </div>

      {/* General project notes — always below everything */}
      <div style={{ marginTop: 32, borderTop: "1px solid #f0f1ec", paddingTop: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "Satoshi, sans-serif" }}>
          General project notes
        </div>
        <ProjectNotesPanel
          projectId={project.id}
          section="general"
          token={token}
          currentUser={currentUser}
          teamMembers={teamMembers}
        />
      </div>
    </div>
  );
}

export { ProjectDetailView };


// ════════════════════════════════════════════════════════════════════════════
// 2. ADD NOTIFICATION BELL TO SIDEBAR IN RisoHub.jsx
// ════════════════════════════════════════════════════════════════════════════

/*

In RisoHub.jsx, import NotificationCentre:
  import NotificationCentre, { NotificationBell } from "./NotificationCentre";

In AppShell, add state for notification panel:
  const [notifOpen, setNotifOpen] = useState(false);

In the Sidebar component's footer, replace the logout button area with:

  <div style={styles.sidebarFooter}>
    <div style={styles.userAvatar}>
      {userName.charAt(0).toUpperCase()}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={styles.userName}>{userName}</div>
      <div style={styles.userRole}>{userRole}</div>
    </div>

    ← ADD THIS:
    <NotificationCentre
      token={token}
      onNavigate={(view, meta) => {
        onNavigate(view as View);
        if (meta?.projectId) {
          setSelectedProjectId(meta.projectId);
        }
        if (meta?.complaintId) {
          setSelectedComplaintId(meta.complaintId);
        }
      }}
    />

    <button onClick={onLogout} style={styles.logoutBtn} title="Sign out">⎋</button>
  </div>

Pass token down to Sidebar:
  <Sidebar
    ...existing props...
    token={token!}
    onNavigate={navigate}
    setSelectedProjectId={setSelectedProjectId}
    setSelectedComplaintId={setSelectedComplaintId}
  />

*/


// ════════════════════════════════════════════════════════════════════════════
// 3. FETCH teamMembers AND currentUser IN AppShell
// ════════════════════════════════════════════════════════════════════════════

/*

In AppShell, alongside the existing projects fetch, add:

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users?active=true", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setTeamMembers(data.users ?? []));
  }, [token]);

Then pass to ProjectDetailView:
  <ProjectDetailView
    project={selectedProject}
    token={token!}
    userRole={user?.role ?? "Installer"}
    currentUser={{ id: user?.id ?? "", name: user?.name ?? "", role: user?.role ?? "" }}
    teamMembers={teamMembers}
    ...
  />

*/


// ════════════════════════════════════════════════════════════════════════════
// 4. TRIGGER NOTIFICATIONS FROM EXISTING EVENT HANDLERS
// ════════════════════════════════════════════════════════════════════════════

/*

The emailWorker.ts already consumes RabbitMQ events. Add notification
creation alongside emails for all key events. In each handler, call
createNotification() after (or instead of) sending emails for in-app alerts.

Key events to hook:

  complaint.created → notify assigned handler
    createNotification({
      userId: complaint.assignedTo,
      type:   "complaint_new",
      title:  "New complaint logged",
      body:   `${complaint.customerName} — ${complaint.category}`,
      meta:   { view: "complaints", complaintId: complaint.id },
    });

  complaints.overdueResponse → notify admins + assigned handler
    createNotification({
      userId: adminId,
      type:   "complaint_overdue",
      title:  "Complaint response overdue",
      body:   `${complaint.ref} — ${complaint.customerName}`,
      meta:   { view: "complaints", complaintId: complaint.id },
    });

  complaint.emergency → notify all admins immediately
    createNotification({
      userId: adminId,
      type:   "complaint_emergency",
      title:  "Emergency complaint — 24hr inspection required",
      body:   `${complaint.customerName} at ${complaint.address}`,
      meta:   { view: "complaints", complaintId: complaint.id },
    });

  qualification.expiring → notify the staff member
    createNotification({
      userId: staffId,
      type:   "qual_expiring",
      title:  `Qualification expiring — ${qualType}`,
      body:   `Expires in ${daysRemaining} days`,
      meta:   { view: "qualifications" },
    });

  checklist.nonCompliant → notify assigned surveyor
    createNotification({
      userId: surveyorId,
      type:   "checklist_issue",
      title:  "Compliance issue flagged",
      body:   `${project.customerName} — ${itemName}`,
      meta:   { view: "projects", projectId: project.id, section: "checklist" },
    });

  handover.generated → notify assigned surveyor
    createNotification({
      userId: surveyorId,
      type:   "handover_ready",
      title:  "Handover document ready",
      body:   `${project.customerName} — ready to sign`,
      meta:   { view: "projects", projectId: project.id, section: "documents" },
    });

  signature.signed → notify requester
    createNotification({
      userId: requesterId,
      type:   "signature_received",
      title:  "Document signed",
      body:   `${signerName} signed the ${documentType}`,
      meta:   { view: "projects", projectId: project.id, section: "documents" },
    });

  note.created (for each mention) → already handled inline in createNote()

*/


// ════════════════════════════════════════════════════════════════════════════
// 5. SUMMARY — FILES CHANGED
// ════════════════════════════════════════════════════════════════════════════

/*

New files:
  ProjectNotesPanel.tsx              ← notes with @mention, per section
  NotificationCentre.tsx             ← bell icon + slide-out panel
  notesAndNotificationsService.ts    ← backend routes + DB migration

Modified files:
  ProjectComplaintsWiring.tsx → replace ProjectDetailView with version above
  RisoHub.jsx                 → add NotificationCentre to sidebar footer
                              → add teamMembers + currentUser fetch
                              → pass currentUser + teamMembers to ProjectDetailView

Backend:
  app.ts       → mount notesRouter + notificationsRouter
  emailWorker  → add createNotification() calls alongside email sends
  DB migration → run Notes + Notifications table SQL from notesAndNotificationsService.ts

*/
