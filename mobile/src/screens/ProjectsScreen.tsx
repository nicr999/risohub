// ============================================================
// RISO HUB Mobile — src/screens/ProjectsScreen.tsx
// Searchable, filterable project list with pull-to-refresh
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { COLOURS, FONTS, PROJECT_STATUS_COLOURS, PROJECT_STATUS_LABELS, RADIUS, SHADOW } from '../theme';

interface Project {
  id: number;
  customerName: string;
  address: string;
  postcode: string;
  status: string;
  projectType: 'ASHP' | 'GSHP';
  assignee?: { name: string };
  createdAt: string;
}

const STATUS_FILTERS = ['all', 'survey', 'design', 'install', 'commission', 'audit'];

export default function ProjectsScreen() {
  const navigation = useNavigation<any>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filtered, setFiltered] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/projects');
      setProjects(res.data);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter whenever search or status changes
  useEffect(() => {
    let result = projects;
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.customerName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.postcode.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [projects, search, statusFilter]);

  function renderProject({ item: p }: { item: Project }) {
    const statusColour = PROJECT_STATUS_COLOURS[p.status] || COLOURS.olive;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id, customerName: p.customerName })}
        activeOpacity={0.75}
      >
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName} numberOfLines={1}>{p.customerName}</Text>
            <Text style={s.address} numberOfLines={1}>{p.address}, {p.postcode}</Text>
          </View>
          <View style={[s.typeBadge, { backgroundColor: statusColour + '22', borderColor: statusColour }]}>
            <Text style={[s.typeBadgeText, { color: statusColour }]}>{p.projectType}</Text>
          </View>
        </View>
        <View style={s.cardBottom}>
          <View style={[s.statusPill, { backgroundColor: statusColour }]}>
            <Text style={s.statusText}>{PROJECT_STATUS_LABELS[p.status] || p.status}</Text>
          </View>
          {p.assignee && (
            <Text style={s.assignee}>👤 {p.assignee.name}</Text>
          )}
          <Text style={s.date}>{new Date(p.createdAt).toLocaleDateString('en-GB')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) return (
    <View style={s.centred}>
      <ActivityIndicator color={COLOURS.olive} size="large" />
    </View>
  );

  return (
    <View style={s.container}>
      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, address, postcode…"
          placeholderTextColor="#bbb"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status filter chips */}
      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={s => s}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[s.filterChip, statusFilter === f && s.filterChipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[s.filterChipText, statusFilter === f && s.filterChipTextActive]}>
              {f === 'all' ? 'All' : PROJECT_STATUS_LABELS[f]}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Count */}
      <Text style={s.count}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</Text>

      {error ? (
        <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => String(p.id)}
          renderItem={renderProject}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLOURS.olive}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>No projects found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOURS.cream },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: COLOURS.dark,
    borderWidth: 1, borderColor: '#e8e8e4',
  },
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0d8',
  },
  filterChipActive: { backgroundColor: COLOURS.olive, borderColor: COLOURS.olive },
  filterChipText: { fontSize: 12, color: '#666', fontFamily: FONTS.bold, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  count: { fontSize: 11, color: '#aaa', paddingHorizontal: 16, paddingBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: RADIUS.md,
    padding: 14, ...SHADOW.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  customerName: { fontSize: 15, fontWeight: '700', color: COLOURS.dark, fontFamily: FONTS.bold },
  address: { fontSize: 12, color: '#888', marginTop: 2 },
  typeBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, marginLeft: 8,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  assignee: { fontSize: 11, color: '#999', flex: 1 },
  date: { fontSize: 11, color: '#bbb' },
  errorBox: { margin: 16, padding: 12, backgroundColor: COLOURS.errorBg, borderRadius: RADIUS.md },
  errorText: { color: COLOURS.error, fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#bbb', fontSize: 14 },
});
