/**
 * main.tsx — App entry point
 * Mounts RisoHub (which includes AuthGuard internally).
 */

import React from "react";
import ReactDOM from "react-dom/client";
import RisoHub from "./RisoHub";
import "./index.css"; // Ensure Satoshi font is imported here

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RisoHub />
  </React.StrictMode>
);

/**
 * ─── WIRING CHECKLIST ──────────────────────────────────────────────────────────
 *
 * 1. FONT — Add Satoshi to index.css or index.html:
 *    @import url('https://api.fontshare.com/v2/css?f[]=satoshi@700,400&display=swap');
 *    body { font-family: 'Satoshi', sans-serif; margin: 0; }
 *
 * 2. AUTH — Wrap your AuthProvider above RisoHub if useAuth() uses React context.
 *    If useAuth() reads directly from localStorage/memory, no change needed.
 *
 * 3. PROJECT CREATION — When POST /api/projects succeeds, call:
 *    checklistService.seedChecklist(projectId, projectType)
 *    (Wire this inside your project creation handler / Express route)
 *
 * 4. MODULE PROPS — Confirm these props are accepted by each module:
 *
 *    MCSChecklist:
 *      projectId: string
 *      projectType: "ASHP" | "GSHP"
 *      token: string
 *      userRole: string
 *      onReadyForHandover: () => void   ← triggers navigation to Documents tab
 *
 *    DocumentGenerator:
 *      projectId: string
 *      token: string
 *      userRole: string
 *
 *    FileUploadModule:
 *      projectId: string
 *      token: string
 *      userRole: string
 *
 *    TeamManagement:
 *      token: string
 *
 *    SettingsPage:
 *      token: string
 *      userRole: string
 *
 * 5. AUTH HOOK — useAuth() must expose:
 *    { user: { name, role, id }, token: string, logout: () => void }
 *    Update AppShell destructuring if your shape differs.
 *
 * 6. AUTHGUARD — AuthGuard must accept:
 *    { fallback: ReactNode, children: ReactNode }
 *    Renders fallback (LoginPage) when unauthenticated.
 *
 * 7. AUDIT LOG API — GET /api/audit-log?limit=50 must return:
 *    { entries: [{ timestamp, userId, action, entityType, entityId, ipAddress }] }
 *
 * 8. PROJECTS API — GET /api/projects must return:
 *    { projects: Project[] }
 *
 * ─── DONE ─────────────────────────────────────────────────────────────────────
 */
