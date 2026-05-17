// mobile/src/sync/useConflictStore.ts
// Zustand store tracking auto-resolved sync conflicts.
// Populated by executeOpWithConflictResolution in syncQueue.ts.
// Consumed by ConflictResolutionBanner.tsx.

import { create } from 'zustand';

export interface ResolvedConflict {
  id: string;
  opType: string;
  endpoint: string;
  resolvedAt: Date;
  discardedFields: string[];
  mergedFields: string[];
  note: string;
  /** true once the user has dismissed this conflict */
  dismissed: boolean;
}

interface ConflictStore {
  conflicts: ResolvedConflict[];
  addConflict: (c: Omit<ResolvedConflict, 'id' | 'dismissed'>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  undismissedCount: () => number;
}

export const useConflictStore = create<ConflictStore>((set, get) => ({
  conflicts: [],

  addConflict: (c) =>
    set(state => ({
      conflicts: [
        ...state.conflicts,
        { ...c, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, dismissed: false },
      ],
    })),

  dismiss: (id) =>
    set(state => ({
      conflicts: state.conflicts.map(c => c.id === id ? { ...c, dismissed: true } : c),
    })),

  dismissAll: () =>
    set(state => ({
      conflicts: state.conflicts.map(c => ({ ...c, dismissed: true })),
    })),

  undismissedCount: () => get().conflicts.filter(c => !c.dismissed).length,
}));
