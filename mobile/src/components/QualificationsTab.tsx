// ============================================================
// RISO HUB Mobile — src/components/QualificationsTab.tsx
// Qualifications viewer for the Qualifications screen.
// Shows all staff qualifications with traffic-light expiry.
// Admins can see all staff; others see their own only.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  SectionList,
} from 'react-native';
import { api } from '../api/client';
import { COLOURS, RADIUS, SHADOW } from '../theme';
import { useAuth } from '../auth/AuthContext';

interface Qualification {
  id: number;
  type: string;
  category: string;
  certNumber: string | null;
  issuingBody: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  neverExpires: boolean;
  fileUrl: string | null;
  notes: string | null;
  staff?: { id: number; name: string; role: string };
}

type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

function getExpiryStatus(qual: Qualification): ExpiryStatus {
  if (qual.neverExpires || !qual.expiresAt) return 'no_expiry';
  const days = Math.ceil((new Date(qual.expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0)   return 'expired';
  if (days <= 60) return 'expiring';
  return 'valid';
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

const STATUS_CONFIG: Record<ExpiryStatus, { colour: string; bg: string; label: string }> = {
  valid:     { colour: COLOURS.success,  bg: COLOURS.successBg, label: 'Valid' },
  expiring:  { colour: COLOURS.warning,  bg: COLOURS.warningBg, label: 'Expiring' },
  expired:   { colour: COLOURS.error,    bg: COLOURS.errorBg,   label: 'Expired' },
  no_expiry: { colour: COLOURS.olive,    bg: COLOURS.oliveFaint, label: 'No expiry' },
};

// ─── QualificationsTab ────────────────────────────────────────────────────────

export default function QualificationsTab() {
  const { user } = useAuth();
  const [quals,      setQuals]      = useState<Qualification[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<'all' | 'expiring' | 'expired'>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get('/api/qualifications');
      setQuals(res.data.qualifications ?? res.data);
    } catch {
      Alert.alert('Error', 'Failed to load qualifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = quals.filter(q => {
    const status = getExpiryStatus(q);
    if (filter === 'expiring') return status === 'expiring';
    if (filter === 'expired')  return status === 'expired';
    return true;
  });

  // Group by staff member
  const grouped = filtered.reduce((acc, q) => {
    const key  = q.staff ? `${q.staff.name} (${q.staff.role})` : 'My Qualifications';
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {} as Record<string, Qualification[]>);

  const sections = Object.entries(grouped).map(([title, data]) => ({ title, data }));

  const expiredCount  = quals.filter(q => getExpiryStatus(q) === 'expired').length;
  const expiringCount = quals.filter(q => getExpiryStatus(q) === 'expiring').length;

  if (loading) return (
    <View style={s.centred}><ActivityIndicator color={COLOURS.olive} size="large" /></View>
  );

  return (
    <View style={s.container}>
      {/* Summary strip */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <View style={s.alertStrip}>
          {expiredCount > 0  && <Text style={s.alertText}>⛔ {expiredCount} expired</Text>}
          {expiringCount > 0 && <Text style={[s.alertText, { color: COLOURS.warning }]}>⚠️ {expiringCount} expiring soon</Text>}
        </View>
      )}

      {/* Filter pills */}
      <View style={s.filterRow}>
        {(['all', 'expiring', 'expired'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterPill, filter === f && s.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterPillText, filter === f && s.filterPillTextActive]}>
              {f === 'all' ? `All (${quals.length})` : f === 'expiring' ? `Expiring (${expiringCount})` : `Expired (${expiredCount})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={q => String(q.id)}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No qualifications found</Text></View>}
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item: q }) => <QualCard qual={q} />}
      />
    </View>
  );
}

// ─── Qualification card ───────────────────────────────────────

function QualCard({ qual }: { qual: Qualification }) {
  const status = getExpiryStatus(qual);
  const cfg    = STATUS_CONFIG[status];
  const days   = qual.expiresAt && !qual.neverExpires ? daysUntil(qual.expiresAt) : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.75}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.qualType}>{qual.type}</Text>
          {qual.issuingBody && <Text style={s.issuingBody}>{qual.issuingBody}</Text>}
        </View>
        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusText, { color: cfg.colour }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Expiry info */}
      {qual.expiresAt && !qual.neverExpires && (
        <View style={s.expiryRow}>
          <Text style={s.expiryLabel}>
            {days !== null && days < 0
              ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
              : days !== null && days <= 60
              ? `Expires in ${days} day${days === 1 ? '' : 's'}`
              : `Expires ${new Date(qual.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            }
          </Text>
        </View>
      )}
      {qual.neverExpires && (
        <Text style={s.expiryLabel}>Does not expire</Text>
      )}

      {/* Expanded detail */}
      {expanded && (
        <View style={s.detail}>
          {qual.certNumber && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Cert number</Text>
              <Text style={s.detailValue}>{qual.certNumber}</Text>
            </View>
          )}
          {qual.issuedAt && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Issued</Text>
              <Text style={s.detailValue}>{new Date(qual.issuedAt).toLocaleDateString('en-GB')}</Text>
            </View>
          )}
          {qual.category && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Category</Text>
              <Text style={s.detailValue}>{qual.category}</Text>
            </View>
          )}
          {qual.notes && (
            <Text style={s.notes}>{qual.notes}</Text>
          )}
          {qual.fileUrl && (
            <TouchableOpacity
              style={s.viewDocBtn}
              onPress={() => Linking.openURL(qual.fileUrl!)}
            >
              <Text style={s.viewDocText}>View certificate →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOURS.cream },
  centred:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  alertStrip:   { backgroundColor: COLOURS.errorBg, padding: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 16 },
  alertText:    { fontSize: 12, fontWeight: '700', color: COLOURS.error },
  filterRow:    { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  filterPill:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: COLOURS.neutral1 },
  filterPillActive: { backgroundColor: COLOURS.olive, borderColor: COLOURS.olive },
  filterPillText:   { fontSize: 12, color: '#888', fontWeight: '600' },
  filterPillTextActive: { color: '#fff' },
  list:         { padding: 12, paddingTop: 4, gap: 8 },
  sectionHeader:{ fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4, paddingHorizontal: 2 },
  empty:        { alignItems: 'center', paddingTop: 60 },
  emptyText:    { color: '#bbb', fontSize: 14 },
  card:         { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, ...SHADOW.sm },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  qualType:     { fontSize: 14, fontWeight: '700', color: COLOURS.dark, flex: 1 },
  issuingBody:  { fontSize: 11, color: '#aaa', marginTop: 2 },
  statusBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusText:   { fontSize: 10, fontWeight: '700' },
  expiryRow:    { marginTop: 8 },
  expiryLabel:  { fontSize: 12, color: '#888' },
  detail:       { marginTop: 12, borderTopWidth: 1, borderTopColor: '#f5f5f0', paddingTop: 10, gap: 6 },
  detailRow:    { flexDirection: 'row', gap: 8 },
  detailLabel:  { fontSize: 11, color: '#aaa', width: 90, textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 1 },
  detailValue:  { fontSize: 13, color: COLOURS.dark, flex: 1, fontWeight: '500' },
  notes:        { fontSize: 12, color: '#888', lineHeight: 18, marginTop: 4 },
  viewDocBtn:   { marginTop: 8 },
  viewDocText:  { fontSize: 13, color: COLOURS.olive, fontWeight: '600' },
});
