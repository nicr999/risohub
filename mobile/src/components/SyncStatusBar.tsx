// mobile/src/sync/SyncStatusBar.tsx
// Persistent banner shown when offline or when ops are pending
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSyncQueue } from './useSyncQueue';

export function SyncStatusBar() {
  const { isOnline, pendingCount, syncing, sync, clearFailed } = useSyncQueue();

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <View style={[styles.bar, styles.offline]}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.text}>
          Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount > 1 ? 's' : ''} queued` : ''}
        </Text>
      </View>
    );
  }

  // Online but has pending ops
  return (
    <View style={[styles.bar, styles.pending]}>
      {syncing ? (
        <>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.text}>Syncing {pendingCount} item{pendingCount > 1 ? 's' : ''}…</Text>
        </>
      ) : (
        <>
          <Text style={styles.icon}>⏳</Text>
          <Text style={styles.text}>{pendingCount} item{pendingCount > 1 ? 's' : ''} waiting to sync</Text>
          <TouchableOpacity style={styles.syncBtn} onPress={sync}>
            <Text style={styles.syncBtnText}>Sync now</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  offline: { backgroundColor: '#7F8C8D' },
  pending: { backgroundColor: '#2E86C1' },
  icon: { fontSize: 14 },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
  syncBtn: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  syncBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
