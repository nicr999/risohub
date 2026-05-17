// ============================================================
// RISO HUB Mobile — src/screens/DashboardScreen.tsx
// Home dashboard — project pipeline overview, quick stats,
// recent activity, and compliance alerts.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { COLOURS, FONTS, PROJECT_STATUS_COLOURS, PROJECT_STATUS_LABELS, RADIUS, SHADOW } from '../theme';

interface DashboardData {
  projectCounts: Record<string, number>;
  recentProjects: {
    id: number;
    customerName: string;
    address: string;
    status: string;
    compliancePct: number;
  }[];
  openComplaints:   number;
  overdueComplaints: number;
  expiringQuals:    number;
  expiredQuals:     number;
  pendingSignatures: number;
  totalProjects:    number;
}

const STAGE_ORDER = ['survey', 'design', 'install', 'commission', 'audit', 'complete'];

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuth();

  const [data,       setData]       = useState<DashboardData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread,     setUnread]     = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [dashRes, notifRes] = await Promise.all([
        api.get('/api/dashboard'),
        api.get('/api/notifications/unread-count'),
      ]);
      setData(dashRes.data);
      setUnread(notifRes.data.count ?? 0);
    } catch {
      Alert.alert('Error', 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={s.centred}><ActivityIndicator color={COLOURS.olive} size="large" /></View>
  );

  if (!data) return (
    <View style={s.centred}>
      <Text style={s.errorText}>Could not load dashboard</Text>
      <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
        <Text style={s.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const hasAlerts = data.overdueComplaints > 0 || data.expiredQuals > 0;
  const hasWarnings = data.openComplaints > 0 || data.expiringQuals > 0 || data.pendingSignatures > 0;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />}
    >
      {/* Welcome header */}
      <View style={s.welcomeRow}>
        <View>
          <Text style={s.welcome}>Good {greeting()}, {firstName(user?.name)}</Text>
          <Text style={s.welcomeSub}>RISO HUB · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity
            style={s.notifBadge}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={s.notifBadgeText}>🔔 {unread}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alert banner */}
      {hasAlerts && (
        <View style={s.alertBanner}>
          <Text style={s.alertBannerText}>
            {data.overdueComplaints > 0 ? `⛔ ${data.overdueComplaints} overdue complaint${data.overdueComplaints > 1 ? 's' : ''}` : ''}
            {data.overdueComplaints > 0 && data.expiredQuals > 0 ? '  ·  ' : ''}
            {data.expiredQuals > 0 ? `❌ ${data.expiredQuals} expired qualification${data.expiredQuals > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      )}

      {/* Quick stats row */}
      <View style={s.statsRow}>
        <StatCard label="Total Projects" value={data.totalProjects} />
        <StatCard label="Open Complaints" value={data.openComplaints} alert={data.openComplaints > 0} />
        <StatCard label="Pending Signatures" value={data.pendingSignatures} warn={data.pendingSignatures > 0} />
      </View>

      {/* Project pipeline */}
      <SectionHeader title="Project pipeline" />
      <View style={s.pipelineCard}>
        {STAGE_ORDER.map(stage => {
          const count = data.projectCounts[stage] ?? 0;
          const colour = PROJECT_STATUS_COLOURS[stage] || COLOURS.neutral2;
          const max = Math.max(...STAGE_ORDER.map(s2 => data.projectCounts[s2] ?? 0), 1);
          return (
            <TouchableOpacity
              key={stage}
              style={s.pipelineRow}
              onPress={() => navigation.navigate('Projects', { filterStatus: stage })}
              activeOpacity={0.7}
            >
              <Text style={s.pipelineLabel}>{PROJECT_STATUS_LABELS[stage] || stage}</Text>
              <View style={s.pipelineBarWrap}>
                <View style={[s.pipelineBar, { width: `${(count / max) * 100}%`, backgroundColor: colour }]} />
              </View>
              <Text style={[s.pipelineCount, count === 0 && s.pipelineCountZero]}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Warnings row */}
      {hasWarnings && (
        <>
          <SectionHeader title="Attention needed" />
          <View style={s.warningsCard}>
            {data.expiringQuals > 0 && (
              <WarningRow
                icon="⚠️"
                label={`${data.expiringQuals} qualification${data.expiringQuals > 1 ? 's' : ''} expiring soon`}
                colour={COLOURS.warning}
                onPress={() => navigation.navigate('Qualifications')}
              />
            )}
            {data.pendingSignatures > 0 && (
              <WarningRow
                icon="✍️"
                label={`${data.pendingSignatures} signature${data.pendingSignatures > 1 ? 's' : ''} awaiting customer`}
                colour={COLOURS.info}
                onPress={() => navigation.navigate('Projects')}
              />
            )}
            {data.openComplaints > 0 && (
              <WarningRow
                icon="📣"
                label={`${data.openComplaints} open complaint${data.openComplaints > 1 ? 's' : ''}`}
                colour={COLOURS.error}
                onPress={() => navigation.navigate('Projects')}
              />
            )}
          </View>
        </>
      )}

      {/* Recent projects */}
      {data.recentProjects.length > 0 && (
        <>
          <SectionHeader title="Recent projects" />
          <View style={s.recentList}>
            {data.recentProjects.slice(0, 5).map(p => (
              <TouchableOpacity
                key={p.id}
                style={s.recentCard}
                onPress={() => navigation.navigate('Projects', { screen: 'ProjectDetail', params: { projectId: p.id } })}
                activeOpacity={0.75}
              >
                <View style={s.recentLeft}>
                  <Text style={s.recentName} numberOfLines={1}>{p.customerName}</Text>
                  <Text style={s.recentAddress} numberOfLines={1}>{p.address}</Text>
                </View>
                <View style={s.recentRight}>
                  <View style={[s.recentStatusDot, { backgroundColor: PROJECT_STATUS_COLOURS[p.status] || COLOURS.neutral1 }]} />
                  <Text style={s.recentPct}>{p.compliancePct}%</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.viewAllBtn} onPress={() => navigation.navigate('Projects')}>
              <Text style={s.viewAllText}>View all projects →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function StatCard({ label, value, alert = false, warn = false }: { label: string; value: number; alert?: boolean; warn?: boolean }) {
  const colour = alert ? COLOURS.error : warn ? COLOURS.warning : COLOURS.olive;
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, { color: colour }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function WarningRow({ icon, label, colour, onPress }: { icon: string; label: string; colour: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.warningRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.warningIcon}>{icon}</Text>
      <Text style={[s.warningLabel, { color: colour }]}>{label}</Text>
      <Text style={s.warningArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function firstName(name?: string): string {
  return name?.split(' ')[0] ?? 'there';
}

// ─── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLOURS.cream },
  content:     { padding: 16, paddingBottom: 32, gap: 0 },
  centred:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText:   { color: '#aaa', fontSize: 14 },
  retryBtn:    { backgroundColor: COLOURS.olive, borderRadius: RADIUS.md, paddingHorizontal: 20, paddingVertical: 8 },
  retryText:   { color: '#fff', fontWeight: '600', fontSize: 13 },

  welcomeRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  welcome:     { fontSize: 20, fontWeight: '700', color: COLOURS.dark, fontFamily: FONTS.bold },
  welcomeSub:  { fontSize: 12, color: '#aaa', marginTop: 2 },
  notifBadge:  { backgroundColor: COLOURS.oliveFaint, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  notifBadgeText: { fontSize: 13, fontWeight: '700', color: COLOURS.olive },

  alertBanner: { backgroundColor: COLOURS.errorBg, borderRadius: RADIUS.md, padding: 12, marginBottom: 16 },
  alertBannerText: { fontSize: 13, fontWeight: '600', color: COLOURS.error },

  statsRow:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard:    { flex: 1, backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, alignItems: 'center', ...SHADOW.sm },
  statValue:   { fontSize: 24, fontWeight: '700', fontFamily: FONTS.bold },
  statLabel:   { fontSize: 10, color: '#aaa', textAlign: 'center', marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },

  pipelineCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, gap: 10, marginBottom: 20, ...SHADOW.sm },
  pipelineRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pipelineLabel:{ fontSize: 12, color: '#888', width: 80, fontWeight: '600' },
  pipelineBarWrap: { flex: 1, height: 6, backgroundColor: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  pipelineBar:  { height: '100%', borderRadius: 3, minWidth: 4 },
  pipelineCount:{ fontSize: 13, fontWeight: '700', color: COLOURS.dark, width: 24, textAlign: 'right' },
  pipelineCountZero: { color: '#ccc' },

  warningsCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 20, ...SHADOW.sm },
  warningRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f0' },
  warningIcon:  { fontSize: 16 },
  warningLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  warningArrow: { fontSize: 18, color: '#ccc' },

  recentList:   { gap: 8, marginBottom: 20 },
  recentCard:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, ...SHADOW.sm },
  recentLeft:   { flex: 1, gap: 3 },
  recentName:   { fontSize: 14, fontWeight: '700', color: COLOURS.dark },
  recentAddress:{ fontSize: 12, color: '#aaa' },
  recentRight:  { alignItems: 'flex-end', gap: 4 },
  recentStatusDot: { width: 8, height: 8, borderRadius: 4 },
  recentPct:    { fontSize: 12, fontWeight: '700', color: COLOURS.olive },
  viewAllBtn:   { backgroundColor: COLOURS.oliveFaint, borderRadius: RADIUS.md, padding: 12, alignItems: 'center' },
  viewAllText:  { fontSize: 13, fontWeight: '700', color: COLOURS.olive },
});
