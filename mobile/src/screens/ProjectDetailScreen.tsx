// ============================================================
// RISO HUB Mobile — src/screens/ProjectDetailScreen.tsx
// Project detail with tabs: Overview, Checklist, Files, Notes
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api, getTokens } from '../api/client';
import { COLOURS, FONTS, PROJECT_STATUS_COLOURS, PROJECT_STATUS_LABELS, RADIUS, SHADOW } from '../theme';
import ChecklistTab from '../components/ChecklistTab';
import FilesTab from '../components/FilesTab';
import NotesTab from '../components/NotesTab';
import { useProjectWs } from '../sync/useProjectWs';

type Tab = 'overview' | 'checklist' | 'files' | 'notes';

export default function ProjectDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { projectId } = route.params;

  const [project, setProject]     = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [wsToken, setWsToken]     = useState<string | null>(null);

  // Retrieve JWT for WebSocket auth
  useEffect(() => {
    getTokens().then(t => setWsToken(t?.accessToken ?? null));
  }, []);

  // Live project updates via WebSocket
  const { statusOverride, connected } = useProjectWs(
    project ? Number(projectId) : null,
    wsToken,
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [projRes, compRes] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/compliance/summary/${projectId}`),
      ]);
      setProject(projRes.data);
      setCompliance(compRes.data);
      navigation.setOptions({ title: projRes.data.customerName });
    } catch (e) {
      Alert.alert('Error', 'Failed to load project');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={s.centred}><ActivityIndicator color={COLOURS.olive} size="large" /></View>
  );

  if (!project) return (
    <View style={s.centred}><Text style={s.errorText}>Project not found</Text></View>
  );

  const displayStatus = statusOverride ?? project.status;
  const statusColour  = PROJECT_STATUS_COLOURS[displayStatus] || COLOURS.olive;

  return (
    <View style={s.container}>
      {/* Live update indicator */}
      {connected && (
        <View style={s.liveBanner}>
          <Text style={s.liveBannerText}>● Live</Text>
        </View>
      )}
      {statusOverride && statusOverride !== project.status && (
        <View style={s.statusUpdateBanner}>
          <Text style={s.statusUpdateText}>
            Status updated to {PROJECT_STATUS_LABELS[statusOverride] ?? statusOverride}
          </Text>
        </View>
      )}

      {/* Project header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName}>{project.customerName}</Text>
            <Text style={s.address}>{project.address}, {project.postcode}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusColour }]}>
            <Text style={s.statusBadgeText}>{PROJECT_STATUS_LABELS[displayStatus]}</Text>
          </View>
        </View>

        {/* Compliance bar */}
        {compliance && (
          <View style={s.complianceWrap}>
            <View style={s.complianceRow}>
              <Text style={s.complianceLabel}>MCS Compliance</Text>
              <Text style={[s.compliancePct, { color: compliance.compliancePercentage === 100 ? COLOURS.success : COLOURS.olive }]}>
                {compliance.compliancePercentage}%
              </Text>
            </View>
            <View style={s.complianceBarBg}>
              <View style={[
                s.complianceBarFill,
                {
                  width: `${compliance.compliancePercentage}%`,
                  backgroundColor: compliance.compliancePercentage === 100 ? COLOURS.success : COLOURS.olive,
                },
              ]} />
            </View>
            {compliance.nonCompliantCount > 0 && (
              <Text style={s.nonCompliantWarn}>
                ⚠ {compliance.nonCompliantCount} non-compliant item{compliance.nonCompliantCount > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        )}

        {/* Quick info row */}
        <View style={s.infoRow}>
          <InfoChip label="Type" value={project.projectType} />
          <InfoChip label="Assignee" value={project.assignee?.name || '—'} />
          {project.mcsRegistration && (
            <InfoChip label="MCS" value={project.mcsRegistration.mcsNumber} mono />
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {(['overview', 'checklist', 'files', 'notes'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'overview' && (
          <OverviewTab project={project} refreshing={refreshing} onRefresh={() => load(true)} />
        )}
        {activeTab === 'checklist' && (
          <ChecklistTab projectId={projectId} />
        )}
        {activeTab === 'files' && (
          <FilesTab projectId={projectId} />
        )}
        {activeTab === 'notes' && (
          <NotesTab projectId={projectId} />
        )}
      </View>
    </View>
  );
}

// ── Overview tab ──────────────────────────────────────────────

function OverviewTab({ project, refreshing, onRefresh }: any) {
  return (
    <ScrollView
      style={s.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOURS.olive} />}
    >
      <Section title="Customer Details">
        <Field label="Name" value={project.customerName} />
        <Field label="Address" value={`${project.address}, ${project.postcode}`} />
        {project.customerEmail && <Field label="Email" value={project.customerEmail} />}
        {project.customerPhone && <Field label="Phone" value={project.customerPhone} />}
      </Section>

      <Section title="Installation">
        <Field label="System Type" value={project.projectType} />
        <Field label="Stage" value={PROJECT_STATUS_LABELS[project.status] || project.status} />
        <Field label="Assigned To" value={project.assignee?.name || '—'} />
        <Field label="Created" value={new Date(project.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
      </Section>

      {project.heatLoss && (
        <Section title="Heat Loss Summary">
          {project.heatLoss.heatDemandKW != null && <Field label="Heat Demand" value={`${project.heatLoss.heatDemandKW} kW`} />}
          {project.heatLoss.heatLossKW != null && <Field label="Total Heat Loss" value={`${project.heatLoss.heatLossKW} kW`} />}
          {project.heatLoss.designFlowTemp != null && <Field label="Design Flow Temp" value={`${project.heatLoss.designFlowTemp}°C`} />}
          {project.heatLoss.softwareUsed && <Field label="Software" value={project.heatLoss.softwareUsed} />}
        </Section>
      )}

      {project.mcsRegistration && (
        <Section title="MCS Registration">
          <Field label="Certificate Number" value={project.mcsRegistration.mcsNumber} mono />
          {project.mcsRegistration.registeredAt && (
            <Field label="Registered" value={new Date(project.mcsRegistration.registeredAt).toLocaleDateString('en-GB')} />
          )}
        </Section>
      )}
    </ScrollView>
  );
}

// ── Reusable sub-components ───────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldValue, mono && s.mono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function InfoChip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.infoChip}>
      <Text style={s.infoChipLabel}>{label}</Text>
      <Text style={[s.infoChipValue, mono && s.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOURS.cream },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: COLOURS.error },
  liveBanner: { backgroundColor: '#f0fdf4', paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#bbf7d0' },
  liveBannerText: { fontSize: 11, color: '#16a34a', fontWeight: '700' },
  statusUpdateBanner: { backgroundColor: '#eff6ff', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#bfdbfe' },
  statusUpdateText: { fontSize: 13, color: '#1d4ed8', fontWeight: '600' },
  header: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0ec' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  customerName: { fontSize: 17, fontWeight: '700', color: COLOURS.dark, fontFamily: FONTS.bold },
  address: { fontSize: 12, color: '#888', marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  complianceWrap: { marginBottom: 12 },
  complianceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  complianceLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  compliancePct: { fontSize: 11, fontWeight: '700' },
  complianceBarBg: { height: 5, backgroundColor: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  complianceBarFill: { height: '100%', borderRadius: 3 },
  nonCompliantWarn: { fontSize: 11, color: COLOURS.error, marginTop: 4 },
  infoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  infoChip: { backgroundColor: COLOURS.oliveFaint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 80 },
  infoChipLabel: { fontSize: 9, color: COLOURS.olive, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoChipValue: { fontSize: 12, color: COLOURS.dark, fontWeight: '600', marginTop: 1 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0ec' },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLOURS.olive },
  tabText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  tabTextActive: { color: COLOURS.olive },
  tabContent: { flex: 1, padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sectionCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, overflow: 'hidden', ...SHADOW.sm },
  fieldRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f0' },
  fieldLabel: { fontSize: 12, color: '#888', width: 110, flexShrink: 0 },
  fieldValue: { fontSize: 13, color: COLOURS.dark, flex: 1, fontWeight: '500' },
  mono: { fontFamily: 'Courier', fontSize: 12 },
});
