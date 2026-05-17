// ============================================================
// RISO HUB Mobile — src/components/ChecklistTab.tsx
// MIS 3005 checklist with status updates + photo evidence
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput,
} from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { api } from '../api/client';
import { COLOURS, FONTS, RADIUS, SHADOW } from '../theme';

interface ChecklistItem {
  id: number;
  key: string;
  section: string;
  name: string;
  ref?: string;
  guidance?: string;
  required: boolean;
  status: 'pending' | 'complete' | 'noncompliant' | 'na';
  notes?: string;
  naReason?: string;
  evidence?: { id: number; file: { fileUrl: string }; note?: string }[];
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', colour: '#aaa', bg: '#f5f5f0', icon: '○' },
  complete: { label: 'Complete', colour: COLOURS.success, bg: COLOURS.successBg, icon: '✓' },
  noncompliant: { label: 'Non-compliant', colour: COLOURS.error, bg: COLOURS.errorBg, icon: '✗' },
  na: { label: 'N/A', colour: '#aaa', bg: '#f5f5f0', icon: '—' },
};

export default function ChecklistTab({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ChecklistItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [naReason, setNaReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get(`/api/checklist/${projectId}`);
      const data: ChecklistItem[] = res.data;
      setItems(data);
      // Group by section
      const g: Record<string, ChecklistItem[]> = {};
      data.forEach(item => {
        if (!g[item.section]) g[item.section] = [];
        g[item.section].push(item);
      });
      setGrouped(g);
    } catch {
      Alert.alert('Error', 'Failed to load checklist');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  function openItem(item: ChecklistItem) {
    setSelectedItem(item);
    setNotes(item.notes || '');
    setNaReason(item.naReason || '');
    setModalVisible(true);
  }

  async function updateStatus(status: ChecklistItem['status']) {
    if (!selectedItem) return;
    setSaving(true);
    try {
      await api.patch(`/api/checklist/item/${selectedItem.id}`, {
        status,
        notes: notes || undefined,
        naReason: status === 'na' ? naReason : undefined,
      });
      setModalVisible(false);
      load();
    } catch {
      Alert.alert('Error', 'Failed to update checklist item');
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence() {
    if (!selectedItem) return;
    Alert.alert('Add Evidence', 'Choose photo source', [
      {
        text: 'Camera',
        onPress: async () => {
          const result = await launchCamera({ mediaType: 'photo', quality: 0.8 });
          if (result.assets?.[0]) await processPhoto(result.assets[0]);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
          if (result.assets?.[0]) await processPhoto(result.assets[0]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function processPhoto(asset: any) {
    if (!selectedItem) return;
    try {
      // Get presigned URL
      const presignRes = await api.post('/api/checklist/evidence/presign', {
        fileName: asset.fileName || 'evidence.jpg',
        fileType: asset.type || 'image/jpeg',
        projectId,
      });

      // Upload to S3
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: asset.type, name: asset.fileName } as any);
      await fetch(presignRes.data.url, {
        method: 'PUT',
        body: asset.uri ? await fetch(asset.uri).then(r => r.blob()) : formData,
        headers: { 'Content-Type': asset.type || 'image/jpeg' },
      });

      // Register file
      const fileRes = await api.post('/api/files/upload', {
        projectId,
        fileUrl: presignRes.data.fileUrl,
        category: 'checklist_evidence',
        stage: 'install',
        fileName: asset.fileName || 'evidence.jpg',
      });

      // Attach to checklist item
      await api.post(`/api/checklist/item/${selectedItem.id}/evidence`, {
        fileId: fileRes.data.id,
        note: 'Photo evidence',
      });

      Alert.alert('Success', 'Evidence uploaded');
      load();
    } catch {
      Alert.alert('Error', 'Failed to upload photo');
    }
  }

  // Compliance summary
  const required = items.filter(i => i.required && i.status !== 'na');
  const complete = required.filter(i => i.status === 'complete').length;
  const pct = required.length > 0 ? Math.round((complete / required.length) * 100) : 0;

  if (loading) return <View style={s.centred}><ActivityIndicator color={COLOURS.olive} /></View>;

  return (
    <>
      <ScrollView
        style={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />}
      >
        {/* Summary */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>Compliance</Text>
          <View style={s.summaryRow}>
            <Text style={[s.summaryPct, { color: pct === 100 ? COLOURS.success : COLOURS.olive }]}>{pct}%</Text>
            <Text style={s.summaryDetail}>{complete}/{required.length} required items complete</Text>
          </View>
          <View style={s.barBg}>
            <View style={[s.barFill, { width: `${pct}%`, backgroundColor: pct === 100 ? COLOURS.success : COLOURS.olive }]} />
          </View>
        </View>

        {/* Sections */}
        {Object.entries(grouped).sort().map(([section, sectionItems]) => (
          <View key={section} style={s.section}>
            <Text style={s.sectionHeader}>Section {section}</Text>
            {sectionItems.map(item => {
              const cfg = STATUS_CONFIG[item.status];
              return (
                <TouchableOpacity key={item.id} style={s.itemRow} onPress={() => openItem(item)} activeOpacity={0.7}>
                  <View style={[s.statusIcon, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.statusIconText, { color: cfg.colour }]}>{cfg.icon}</Text>
                  </View>
                  <View style={s.itemContent}>
                    <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                    {item.ref && <Text style={s.itemRef}>{item.ref}</Text>}
                    {item.notes && <Text style={s.itemNotes} numberOfLines={1}>{item.notes}</Text>}
                    {item.evidence && item.evidence.length > 0 && (
                      <Text style={s.evidenceCount}>📷 {item.evidence.length} photo{item.evidence.length > 1 ? 's' : ''}</Text>
                    )}
                  </View>
                  {!item.required && <Text style={s.optionalTag}>Optional</Text>}
                  <Text style={s.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Item detail modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        {selectedItem && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalClose}>✕ Close</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle} numberOfLines={2}>{selectedItem.name}</Text>
              {selectedItem.ref && <Text style={s.modalRef}>{selectedItem.ref}</Text>}
            </View>

            <ScrollView style={s.modalBody}>
              {selectedItem.guidance && (
                <View style={s.guidanceBox}>
                  <Text style={s.guidanceLabel}>Guidance</Text>
                  <Text style={s.guidanceText}>{selectedItem.guidance}</Text>
                </View>
              )}

              <Text style={s.inputLabel}>Notes</Text>
              <TextInput
                style={s.textArea}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes about this item…"
                placeholderTextColor="#bbb"
                multiline
                numberOfLines={4}
              />

              {/* Status buttons */}
              <Text style={s.inputLabel}>Update Status</Text>
              <View style={s.statusButtons}>
                <StatusButton label="✓ Complete" colour={COLOURS.success} onPress={() => updateStatus('complete')} loading={saving} />
                <StatusButton label="✗ Non-compliant" colour={COLOURS.error} onPress={() => updateStatus('noncompliant')} loading={saving} />
                <StatusButton label="○ Pending" colour="#aaa" onPress={() => updateStatus('pending')} loading={saving} />
                <StatusButton label="— N/A" colour="#aaa" onPress={() => updateStatus('na')} loading={saving} />
              </View>

              {/* Evidence */}
              <TouchableOpacity style={s.evidenceBtn} onPress={uploadEvidence}>
                <Text style={s.evidenceBtnText}>📷 Add Photo Evidence</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

function StatusButton({ label, colour, onPress, loading }: any) {
  return (
    <TouchableOpacity
      style={[s.statusBtn, { borderColor: colour }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      <Text style={[s.statusBtnText, { color: colour }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOURS.cream },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  summaryCard: { margin: 16, backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, ...SHADOW.sm },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  summaryPct: { fontSize: 24, fontWeight: '700' },
  summaryDetail: { fontSize: 13, color: '#888' },
  barBg: { height: 6, backgroundColor: '#f0f0ec', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  itemRow: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10, ...SHADOW.sm },
  statusIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  statusIconText: { fontSize: 14, fontWeight: '700' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 13, color: COLOURS.dark, fontWeight: '500' },
  itemRef: { fontSize: 10, color: '#aaa', marginTop: 2 },
  itemNotes: { fontSize: 11, color: '#888', marginTop: 2 },
  evidenceCount: { fontSize: 10, color: COLOURS.olive, marginTop: 2 },
  optionalTag: { fontSize: 10, color: '#bbb', backgroundColor: '#f5f5f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chevron: { fontSize: 18, color: '#ddd', marginLeft: 4 },
  modal: { flex: 1, backgroundColor: COLOURS.cream },
  modalHeader: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0ec' },
  modalClose: { color: '#aaa', fontSize: 13, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLOURS.dark },
  modalRef: { fontSize: 11, color: '#aaa', marginTop: 3 },
  modalBody: { flex: 1, padding: 16 },
  guidanceBox: { backgroundColor: COLOURS.oliveFaint, borderRadius: RADIUS.md, padding: 12, marginBottom: 16 },
  guidanceLabel: { fontSize: 10, fontWeight: '700', color: COLOURS.olive, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  guidanceText: { fontSize: 13, color: COLOURS.dark, lineHeight: 18 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  textArea: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLOURS.dark, borderWidth: 1, borderColor: '#e8e8e4', minHeight: 80, marginBottom: 16 },
  statusButtons: { gap: 8, marginBottom: 16 },
  statusBtn: { borderWidth: 1.5, borderRadius: RADIUS.md, padding: 12, alignItems: 'center' },
  statusBtnText: { fontSize: 14, fontWeight: '700' },
  evidenceBtn: { backgroundColor: COLOURS.oliveFaint, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', marginBottom: 32 },
  evidenceBtnText: { fontSize: 14, color: COLOURS.olive, fontWeight: '600' },
});
