// ============================================================
// RISO HUB — pages/ProjectDetailPage.tsx
// Full project detail page — tabs wire all panels together.
// Tabs: Overview | Checklist | Files | Documents | Notes |
//       Complaints | EPC & BUS | Schedule | Subcontractors
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

// Panels
import MCSChecklist from '../components/MCSChecklist';
import FileUploadModule from '../components/FileUploadModule';
import DocumentGenerator from '../components/DocumentGenerator';
import ProjectNotesPanel from '../components/ProjectNotesPanel';
import ProjectComplaintsTab from '../components/ProjectComplaintsTab';
import HeatLossSummaryPanel from '../components/HeatLossSummaryPanel';
import MCSRegistrationPanel from '../components/MCSRegistrationPanel';
import EPCPanel from '../components/EPCPanel';
import BUSEligibilityPanel from '../components/BUSEligibilityPanel';
import ChecklistEvidenceUploader from '../components/ChecklistEvidenceUploader';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'files', label: 'Files' },
  { id: 'documents', label: 'Documents' },
  { id: 'epc_bus', label: 'EPC & BUS' },
  { id: 'notes', label: 'Notes' },
  { id: 'complaints', label: 'Complaints' },
];

const STATUS_COLOURS: Record<string, string> = {
  survey: '#7A8465', design: '#9DA889', install: '#B8C4A4', commission: '#6B7A5C', audit: '#4A5740', complete: '#2d5016',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = id!; // UUIDs — never parseInt

  const [project, setProject] = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(async () => {
    try {
      const projRes = await axios.get(`/api/projects/${projectId}`);
      setProject(projRes.data);
    } catch {
      navigate('/projects');
      return;
    }
    try {
      const compRes = await axios.get(`/api/compliance/summary/${projectId}`);
      setCompliance(compRes.data);
    } catch {
      // compliance is non-critical — page still loads without it
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={s.loading}>Loading project…</div>;
  if (!project) return null;

  const statusColour = STATUS_COLOURS[project.status] || '#7A8465';

  return (
    <div style={s.page}>
      {/* Project header */}
      <div style={s.header}>
        <div style={s.breadcrumb}>
          <span style={s.breadcrumbLink} onClick={() => navigate('/projects')}>Projects</span>
          <span style={s.breadcrumbSep}>›</span>
          <span>{project.customerName}</span>
        </div>

        <div style={s.headerMain}>
          <div>
            <div style={s.headerTop}>
              <h1 style={s.customerName}>{project.customerName}</h1>
              <span style={{ ...s.statusBadge, background: statusColour }}>
                {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
              </span>
              <span style={s.typeBadge}>{project.projectType}</span>
            </div>
            <div style={s.address}>{project.address}, {project.postcode}</div>
            {project.assignee && <div style={s.assignee}>Assigned to {project.assignee.name}</div>}
          </div>

          {/* Compliance mini-bar */}
          {compliance && (
            <div style={s.complianceBlock}>
              <div style={s.complianceLabel}>MCS Compliance</div>
              <div style={s.complianceRow}>
                <div style={s.complianceBarBg}>
                  <div style={{
                    ...s.complianceBarFill,
                    width: `${compliance.compliancePercentage}%`,
                    background: compliance.compliancePercentage === 100 ? '#22c55e' : '#7A8465',
                  }} />
                </div>
                <span style={s.compliancePct}>{compliance.compliancePercentage}%</span>
              </div>
              {compliance.nonCompliantCount > 0 && (
                <div style={s.nonCompliantWarn}>⚠ {compliance.nonCompliantCount} non-compliant</div>
              )}
              <div style={s.complianceMeta}>
                {compliance.hasHeatLoss ? '✓ Heat loss' : '○ Heat loss'}
                {' · '}
                {compliance.hasMCSRegistration ? `✓ MCS: ${compliance.mcsNumber}` : '○ MCS reg.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'complaints' && compliance?.openComplaints > 0 && (
              <span style={s.tabBadge}>{compliance.openComplaints}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={s.tabContent}>
        {activeTab === 'overview' && (
          <div style={s.overviewGrid}>
            <HeatLossSummaryPanel projectId={projectId} />
            <MCSRegistrationPanel projectId={projectId} />
          </div>
        )}

        {activeTab === 'checklist' && (
          <MCSChecklist
            projectId={String(projectId)}
            projectName={project.customerName}
            projectType={project.projectType}
            currentUserName="Admin"
            onItemUpdated={load}
          />
        )}

        {activeTab === 'files' && (
          <FileUploadModule projectId={projectId} />
        )}

        {activeTab === 'documents' && (
          <div>
            <DocumentGenerator
              projectId={String(projectId)}
              projectName={project.customerName}
              customerName={project.customerName}
              projectAddress={`${project.address}, ${project.postcode}`}
              currentStage={project.status}
              prerequisitesMet={compliance ? [
                { key: 'heat_loss', label: 'Heat loss calculation', met: !!compliance.hasHeatLoss, hint: 'Complete a heat loss calculation in the Overview tab' },
                { key: 'checklist', label: 'Commissioning checklist 100%', met: compliance.compliancePercentage === 100, hint: 'All checklist items must be marked pass or N/A' },
                { key: 'mcs', label: 'MCS registration recorded', met: !!compliance.hasMCSRegistration, hint: 'Add MCS number in the Overview tab' },
              ] : []}
              onDocumentGenerated={load}
            />
          </div>
        )}

        {activeTab === 'epc_bus' && (
          <div>
            <EPCPanel
              projectId={projectId}
              postcode={project.postcode}
              onEPCStored={load}
            />
            <BUSEligibilityPanel
              projectId={projectId}
              projectType={project.projectType}
              hasEPC={!!compliance?.hasEPC}
            />
          </div>
        )}

        {activeTab === 'notes' && (
          <ProjectNotesPanel projectId={projectId} />
        )}

        {activeTab === 'complaints' && (
          <ProjectComplaintsTab projectId={projectId} customerName={project.customerName} />
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { background: '#F5F5F2', minHeight: '100vh', fontFamily: 'Satoshi, sans-serif' },
  loading: { padding: 40, textAlign: 'center', color: '#888' },
  header: { background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e8e8e4' },
  breadcrumb: { fontSize: 12, color: '#aaa', marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' },
  breadcrumbLink: { color: '#7A8465', cursor: 'pointer', textDecoration: 'underline' },
  breadcrumbSep: { color: '#ddd' },
  headerMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 },
  headerTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  customerName: { fontSize: 20, fontWeight: 700, color: '#333', margin: 0 },
  statusBadge: { fontSize: 11, color: '#fff', padding: '3px 10px', borderRadius: 10, fontWeight: 700 },
  typeBadge: { fontSize: 11, background: '#f0f1ec', color: '#7A8465', padding: '3px 10px', borderRadius: 10, fontWeight: 700 },
  address: { fontSize: 13, color: '#777' },
  assignee: { fontSize: 12, color: '#aaa', marginTop: 3 },
  complianceBlock: { minWidth: 200, flexShrink: 0 },
  complianceLabel: { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  complianceRow: { display: 'flex', alignItems: 'center', gap: 8 },
  complianceBarBg: { flex: 1, height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  complianceBarFill: { height: '100%', borderRadius: 3, transition: 'width 0.4s' },
  compliancePct: { fontSize: 12, fontWeight: 700, color: '#333', minWidth: 34 },
  nonCompliantWarn: { fontSize: 11, color: '#dc2626', marginTop: 4 },
  complianceMeta: { fontSize: 10, color: '#aaa', marginTop: 4 },
  tabBar: { display: 'flex', background: '#fff', borderBottom: '1px solid #e8e8e4', paddingLeft: 24, overflowX: 'auto' },
  tab: { padding: '12px 16px', fontSize: 13, color: '#888', border: 'none', borderBottom: '2px solid transparent', background: 'transparent', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  tabActive: { color: '#7A8465', borderBottomColor: '#7A8465', fontWeight: 700 },
  tabBadge: { fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '1px 5px', fontWeight: 700 },
  tabContent: { padding: 24 },
  overviewGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
};
