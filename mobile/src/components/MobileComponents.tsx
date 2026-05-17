// ============================================================
// RISO HUB Mobile — src/components/FilesTab.tsx
// File list with upload (camera / document picker)
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Linking,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { api } from '../api/client';
import { COLOURS, RADIUS, SHADOW } from '../theme';

interface ProjectFile {
  id: number;
  fileUrl: string;
  category: string;
  stage: string;
  uploadedAt: string;
  uploader?: { name: string };
}

const CATEGORY_ICONS: Record<string, string> = {
  survey_report: '📋',
  heat_loss: '🌡',
  commissioning: '⚙️',
  mcs_certificate: '🏅',
  photo: '📷',
  invoice: '💷',
  default: '📄',
};

export function FilesTab({ projectId }: { projectId: number }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get(`/api/files/${projectId}`);
      setFiles(res.data);
    } catch {
      Alert.alert('Error', 'Failed to load files');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function uploadFile(uri: string, name: string, type: string, category: string) {
    setUploading(true);
    try {
      const presign = await api.post('/api/files/presign', { fileName: name, fileType: type, projectId, category, stage: 'install' });
      const blob = await fetch(uri).then(r => r.blob());
      await fetch(presign.data.url, { method: 'PUT', body: blob, headers: { 'Content-Type': type } });
      await api.post('/api/files/upload', { projectId, fileUrl: presign.data.fileUrl, category, stage: 'install', fileName: name });
      load();
    } catch {
      Alert.alert('Error', 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function addFile() {
    Alert.alert('Add File', 'Choose source', [
      {
        text: 'Camera', onPress: async () => {
          const r = await launchCamera({ mediaType: 'photo', quality: 0.8 });
          if (r.assets?.[0]) await uploadFile(r.assets[0].uri!, r.assets[0].fileName || 'photo.jpg', r.assets[0].type || 'image/jpeg', 'photo');
        },
      },
      {
        text: 'Photo Library', onPress: async () => {
          const r = await launchImageLibrary({ mediaType: 'photo' });
          if (r.assets?.[0]) await uploadFile(r.assets[0].uri!, r.assets[0].fileName || 'photo.jpg', r.assets[0].type || 'image/jpeg', 'photo');
        },
      },
      {
        text: 'Document', onPress: async () => {
          const r = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.pdf, DocumentPicker.types.allFiles] });
          await uploadFile(r.uri, r.name || 'document', r.type || 'application/octet-stream', 'survey_report');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (loading) return <View style={fs.centred}><ActivityIndicator color={COLOURS.olive} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={files}
        keyExtractor={f => String(f.id)}
        contentContainerStyle={fs.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />}
        ListEmptyComponent={<View style={fs.empty}><Text style={fs.emptyText}>No files uploaded</Text></View>}
        renderItem={({ item: f }) => (
          <TouchableOpacity style={fs.fileRow} onPress={() => Linking.openURL(f.fileUrl)} activeOpacity={0.7}>
            <Text style={fs.fileIcon}>{CATEGORY_ICONS[f.category] || CATEGORY_ICONS.default}</Text>
            <View style={fs.fileInfo}>
              <Text style={fs.fileCategory}>{f.category.replace(/_/g, ' ')}</Text>
              <Text style={fs.fileMeta}>
                {new Date(f.uploadedAt).toLocaleDateString('en-GB')}
                {f.uploader ? ` · ${f.uploader.name}` : ''}
              </Text>
            </View>
            <Text style={fs.fileArrow}>›</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={fs.addBtn} onPress={addFile} disabled={uploading} activeOpacity={0.8}>
        <Text style={fs.addBtnText}>{uploading ? 'Uploading…' : '+ Add File'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const fs = StyleSheet.create({
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 8, paddingBottom: 80 },
  fileRow: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOW.sm },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1 },
  fileCategory: { fontSize: 13, fontWeight: '600', color: COLOURS.dark, textTransform: 'capitalize' },
  fileMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
  fileArrow: { fontSize: 18, color: '#ddd' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#bbb', fontSize: 14 },
  addBtn: { position: 'absolute', bottom: 16, right: 16, left: 16, backgroundColor: COLOURS.olive, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ============================================================
// src/components/NotesTab.tsx — Project notes (read + add)
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { api } from '../api/client';
import { COLOURS, RADIUS, SHADOW } from '../theme';

interface Note {
  id: number;
  body: string;
  section: string;
  pinned: boolean;
  createdAt: string;
  author?: { name: string };
}

export function NotesTab({ projectId }: { projectId: number }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get('/api/notes', { params: { projectId, section: 'general' } });
      setNotes(res.data);
    } catch {
      Alert.alert('Error', 'Failed to load notes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function postNote() {
    if (!newNote.trim()) return;
    setPosting(true);
    try {
      await api.post('/api/notes', { projectId, section: 'general', body: newNote.trim() });
      setNewNote('');
      load();
    } catch {
      Alert.alert('Error', 'Failed to post note');
    } finally {
      setPosting(false);
    }
  }

  if (loading) return <View style={ns.centred}><ActivityIndicator color={COLOURS.olive} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={notes}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={ns.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLOURS.olive} />}
        ListEmptyComponent={<View style={ns.empty}><Text style={ns.emptyText}>No notes yet</Text></View>}
        renderItem={({ item: n }) => (
          <View style={[ns.noteCard, n.pinned && ns.noteCardPinned]}>
            {n.pinned && <Text style={ns.pinnedLabel}>📌 Pinned</Text>}
            <Text style={ns.noteBody}>{n.body}</Text>
            <Text style={ns.noteMeta}>
              {n.author?.name || 'Unknown'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        )}
      />
      <View style={ns.inputRow}>
        <TextInput
          style={ns.input}
          value={newNote}
          onChangeText={setNewNote}
          placeholder="Add a note…"
          placeholderTextColor="#bbb"
          multiline
        />
        <TouchableOpacity style={[ns.sendBtn, !newNote.trim() && ns.sendBtnDisabled]} onPress={postNote} disabled={posting || !newNote.trim()}>
          <Text style={ns.sendBtnText}>{posting ? '…' : '↑'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const ns = StyleSheet.create({
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 8, paddingBottom: 80 },
  noteCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 14, ...SHADOW.sm },
  noteCardPinned: { borderLeftWidth: 3, borderLeftColor: COLOURS.olive },
  pinnedLabel: { fontSize: 10, color: COLOURS.olive, fontWeight: '700', marginBottom: 6 },
  noteBody: { fontSize: 14, color: COLOURS.dark, lineHeight: 20 },
  noteMeta: { fontSize: 11, color: '#aaa', marginTop: 8 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#bbb', fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0ec' },
  input: { flex: 1, backgroundColor: COLOURS.cream, borderRadius: RADIUS.md, padding: 10, fontSize: 14, color: COLOURS.dark, maxHeight: 100 },
  sendBtn: { backgroundColor: COLOURS.olive, borderRadius: RADIUS.md, width: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

// ============================================================
// src/navigation/AppNavigator.tsx — Root navigator
// ============================================================

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import { COLOURS } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ProjectsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLOURS.olive },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="ProjectsList" component={ProjectsScreen} options={{ title: 'Projects' }} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: 'Project' }} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLOURS.olive,
        tabBarInactiveTintColor: '#bbb',
        tabBarStyle: { borderTopColor: '#e8e8e4' },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Projects"
        component={ProjectsStack}
        options={{ tabBarLabel: 'Projects', tabBarIcon: ({ color }) => <TabIcon icon="📋" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <View><Text style={{ fontSize: 20, opacity: color === COLOURS.olive ? 1 : 0.4 }}>{icon}</Text></View>;
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOURS.cream }}>
      <ActivityIndicator color={COLOURS.olive} size="large" />
    </View>
  );

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="App" component={AppTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
