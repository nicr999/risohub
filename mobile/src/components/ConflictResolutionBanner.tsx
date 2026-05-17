// mobile/src/components/ConflictResolutionBanner.tsx
// Shown when offline sync has auto-resolved one or more data conflicts.
// Mount near the top of screen stack, below SyncStatusBar.
//
// Usage:
//   import ConflictResolutionBanner from '../components/ConflictResolutionBanner';
//   // In App.tsx or top-level screen:
//   <ConflictResolutionBanner />

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform,
} from 'react-native';
import { useConflictStore, ResolvedConflict } from '../sync/useConflictStore';

// ─── Main banner ──────────────────────────────────────────────────────────────

export default function ConflictResolutionBanner() {
  const { conflicts, dismiss, dismissAll, undismissedCount } = useConflictStore();
  const [detailOpen, setDetailOpen] = useState(false);

  const count = undismissedCount();
  if (count === 0) return null;

  const undismissed = conflicts.filter(c => !c.dismissed);

  return (
    <>
      {/* Compact banner */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerIcon}>⚠</Text>
          <View>
            <Text style={styles.bannerTitle}>
              {count} sync conflict{count !== 1 ? 's' : ''} auto-resolved
            </Text>
            <Text style={styles.bannerSub}>
              Some offline changes were merged with server data
            </Text>
          </View>
        </View>
        <View style={styles.bannerActions}>
          <TouchableOpacity onPress={() => setDetailOpen(true)} style={styles.reviewBtn}>
            <Text style={styles.reviewBtnText}>Review</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissAll} style={styles.dismissBtn}>
            <Text style={styles.dismissBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Detail modal */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sync Conflicts</Text>
            <TouchableOpacity onPress={() => setDetailOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSub}>
            These offline changes were automatically merged when you came back online.
            Fields marked "discarded" already matched the server's value.
          </Text>

          <ScrollView style={styles.modalScroll}>
            {undismissed.map(c => (
              <ConflictCard key={c.id} conflict={c} onDismiss={() => dismiss(c.id)} />
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.dismissAllBtn}
            onPress={() => { dismissAll(); setDetailOpen(false); }}
          >
            <Text style={styles.dismissAllText}>Dismiss All</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ─── Individual conflict card ─────────────────────────────────────────────────

function ConflictCard({ conflict, onDismiss }: { conflict: ResolvedConflict; onDismiss: () => void }) {
  const timeStr = conflict.resolvedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = conflict.resolvedAt.toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardEndpoint}>{conflict.endpoint}</Text>
          <Text style={styles.cardTime}>{dateStr} at {timeStr} · {conflict.opType}</Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.cardDismiss}>
          <Text style={styles.cardDismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>

      {conflict.mergedFields.length > 0 && (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldGroupLabel}>Applied (merged):</Text>
          {conflict.mergedFields.map(f => (
            <View key={f} style={styles.fieldRow}>
              <View style={[styles.fieldDot, { backgroundColor: '#27AE60' }]} />
              <Text style={styles.fieldName}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      {conflict.discardedFields.length > 0 && (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldGroupLabel}>Discarded (server was newer):</Text>
          {conflict.discardedFields.map(f => (
            <View key={f} style={styles.fieldRow}>
              <View style={[styles.fieldDot, { backgroundColor: '#E74C3C' }]} />
              <Text style={[styles.fieldName, { color: '#888' }]}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      {conflict.note && (
        <Text style={styles.cardNote}>{conflict.note}</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3E2',
    borderBottomWidth: 1,
    borderBottomColor: '#F5C87A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerIcon: {
    fontSize: 18,
    color: '#E67E22',
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A5010',
  },
  bannerSub: {
    fontSize: 11,
    color: '#9A6020',
    marginTop: 1,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  reviewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissBtnText: {
    fontSize: 16,
    color: '#9A6020',
  },
  // Modal
  modalWrap: {
    flex: 1,
    backgroundColor: '#F5F5F2',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E4',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  modalClose: {
    fontSize: 16,
    color: '#7A8465',
    fontWeight: '600',
  },
  modalSub: {
    fontSize: 13,
    color: '#888',
    margin: 16,
    lineHeight: 20,
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dismissAllBtn: {
    margin: 16,
    backgroundColor: '#7A8465',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dismissAllText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8E8E4',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardLeft: {
    flex: 1,
  },
  cardEndpoint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardTime: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
  },
  cardDismiss: {
    paddingLeft: 12,
  },
  cardDismissText: {
    fontSize: 12,
    color: '#7A8465',
    fontWeight: '600',
  },
  fieldGroup: {
    marginBottom: 8,
  },
  fieldGroupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  fieldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fieldName: {
    fontSize: 13,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardNote: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
