// mobile/src/sync/useSyncQueue.ts
// React hook — exposes queue state and offline-aware action wrappers
import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  enqueue, flushQueue, getQueueCount, clearFailedOps,
} from './syncQueue';
import { api } from '../api/client';

export function useSyncQueue() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    refreshCount();
    return () => unsub();
  }, []);

  const refreshCount = useCallback(async () => {
    const n = await getQueueCount();
    setPendingCount(n);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await flushQueue();
      await refreshCount();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshCount]);

  // Offline-aware file upload
  const uploadFile = useCallback(async (
    projectId: number,
    fileUri: string,
    fileName: string,
    mimeType: string,
    category: string,
  ): Promise<'uploaded' | 'queued'> => {
    if (isOnline) {
      try {
        const formData = new FormData();
        formData.append('file', { uri: fileUri, name: fileName, type: mimeType } as any);
        formData.append('category', category);
        await api.post(`/projects/${projectId}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return 'uploaded';
      } catch {
        // Fall through to queue
      }
    }
    await enqueue({
      opType: 'upload_file',
      endpoint: `/projects/${projectId}/files`,
      method: 'POST',
      payload: JSON.stringify({ category }),
      fileUri, fileName, fileMimeType: mimeType,
      maxRetries: 5,
    });
    await refreshCount();
    return 'queued';
  }, [isOnline, token, refreshCount]);

  // Offline-aware checklist patch
  const patchChecklist = useCallback(async (
    projectId: number,
    itemId: string,
    value: string,
    notes?: string,
  ): Promise<'saved' | 'queued'> => {
    const endpoint = `/compliance/${projectId}/checklist/${itemId}`;
    const payload = { value, notes };
    if (isOnline) {
      try {
        await api.patch(endpoint, payload);
        return 'saved';
      } catch { /* fall through */ }
    }
    await enqueue({ opType: 'patch_checklist', endpoint, method: 'PATCH', payload: JSON.stringify(payload), maxRetries: 10 });
    await refreshCount();
    return 'queued';
  }, [isOnline, token, refreshCount]);

  // Offline-aware note post
  const postNote = useCallback(async (
    projectId: number,
    content: string,
  ): Promise<'saved' | 'queued'> => {
    const endpoint = `/projects/${projectId}/notes`;
    const payload = { content };
    if (isOnline) {
      try {
        await api.post(endpoint, payload);
        return 'saved';
      } catch { /* fall through */ }
    }
    await enqueue({ opType: 'post_note', endpoint, method: 'POST', payload: JSON.stringify(payload), maxRetries: 5 });
    await refreshCount();
    return 'queued';
  }, [isOnline, token, refreshCount]);

  const clearFailed = useCallback(async () => {
    await clearFailedOps();
    await refreshCount();
  }, [refreshCount]);

  return { isOnline, pendingCount, syncing, sync, uploadFile, patchChecklist, postNote, clearFailed };
}
