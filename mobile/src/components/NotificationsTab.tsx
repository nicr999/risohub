// ============================================================
// RISO HUB Mobile — src/components/NotificationsTab.tsx
// In-app notification centre. Shows unread + read notifications.
// Supports mark-as-read individually and mark-all-read.
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
} from 'react-native';
import { api } from '../api/client';
import { COLOURS, RADIUS, SHADOW } from '../theme';

interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  meta?: Record<string, any>;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  mention:              '💬',
  complaint_new:        '🚨',
  complaint_overdue:    '⏰',
  complaint_emergency:  '🚨',
  complaint_escalated:  '📈',
  qual_expiring:        '⚠️',
  qual_expired:         '❌',
  checklist_issue:      '📋',
  handover_ready:       '✅',
  signature_received:   '✍️',
  action_assigned:      '📌',
  system:               '🔔',
};

const TYPE_COLOURS: Record<string, string> = {
  complaint_new:       COLOURS.error,
  complaint_overdue:   COLOURS.error,
  complaint_emergency: COLOURS.error,
  qual_expired:        COLOURS.error,
  qual_expiring:       COLOURS.warning,
  checklist_issue:     COLOURS.warning,
  handover_ready:      COLOURS.success,
  signature_received:  COLOURS.success,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [markingAll,    setMarkingAll]    = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get('/api/notifications', { params: { limit: 50 } });
      setNotifications(res.data.notifications ?? res.data);
    } catch {
      Alert.alert('Error', 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: number) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch {
      // Non-critical
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      Alert.alert('Error', 'Failed to mark notifications as read');
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) return (
    <View style={s.centred}><ActivityIndicator color={COLOURS.olive} size="large" /></View>
  );

  return (
    <View style={s.container}>
      {/* Header bar */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle}>
          Notifications {unreadCount > 0 ? `· ${unreadCount} unread` : ''}
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} disabled={markingAll} style={s.markAllBtn}>
            <Text style={s.markAllText}>{markingAll ? 'Marking…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyText}>No notifications yet</Text>
          </View>
        }
        renderItem={({ item: n }) => (
          <TouchableOpacity
            style={[s.card, !n.read && s.cardUnread]}
            onPress={() => { if (!n.read) markRead(n.id); }}
            activeOpacity={0.7}
          >
            <View style={s.cardLeft}>
              <View style={[
                s.iconCircle,
                { backgroundColor: TYPE_COLOURS[n.type] ? `${TYPE_COLOURS[n.type]}18` : COLOURS.oliveFaint },
              ]}>
                <Text style={s.iconText}>{TYPE_ICONS[n.type] || '🔔'}</Text>
              </View>
              {!n.read && <View style={s.unreadDot} />}
            </View>
            <View style={s.cardBody}>
              <Text style={[s.notifTitle, !n.read && s.notifTitleUnread]} numberOfLines={2}>
                {n.title}
              </Text>
              {n.body ? (
                <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
              ) : null}
              <Text style={s.notifTime}>{timeAgo(n.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: COLOURS.cream },
  centred:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0ec',
  },
  headerTitle:       { fontSize: 14, fontWeight: '700', color: COLOURS.dark },
  markAllBtn:        { paddingVertical: 4, paddingHorizontal: 2 },
  markAllText:       { fontSize: 13, color: COLOURS.olive, fontWeight: '600' },
  list:              { paddingVertical: 8 },
  separator:         { height: 1, backgroundColor: '#f5f5f0', marginLeft: 72 },
  empty:             { alignItems: 'center', paddingTop: 80 },
  emptyIcon:         { fontSize: 36, marginBottom: 12 },
  emptyText:         { color: '#bbb', fontSize: 14 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  cardUnread:        { backgroundColor: '#fafaf7' },
  cardLeft:          { alignItems: 'center', gap: 4 },
  iconCircle: {
    width: 40, height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText:          { fontSize: 18 },
  unreadDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: COLOURS.olive },
  cardBody:          { flex: 1, gap: 3 },
  notifTitle:        { fontSize: 14, color: '#666', lineHeight: 18 },
  notifTitleUnread:  { color: COLOURS.dark, fontWeight: '600' },
  notifBody:         { fontSize: 13, color: '#999', lineHeight: 18 },
  notifTime:         { fontSize: 11, color: '#bbb', marginTop: 2 },
});
