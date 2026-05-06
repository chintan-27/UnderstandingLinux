import { useState, useCallback } from 'react';
import type {
  ModuleStatus,
  MasteryLevel,
  ModuleProgress,
  ProgressStore,
  SupermoduleStats,
  OverallStats,
  HeatmapDay,
  RecentCompletion,
} from '../types/progress';

const STORAGE_KEY = 'understandinglinux_progress_v1';
const SCHEMA_VERSION = 1;

function loadStore(): ProgressStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { modules: {}, schemaVersion: SCHEMA_VERSION };
    const parsed = JSON.parse(raw) as ProgressStore;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return { modules: {}, schemaVersion: SCHEMA_VERSION };
    return parsed;
  } catch {
    return { modules: {}, schemaVersion: SCHEMA_VERSION };
  }
}

function saveStore(store: ProgressStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

const DEFAULT_PROGRESS: ModuleProgress = { status: 'not_started' };

export function useProgress() {
  const [store, setStore] = useState<ProgressStore>(loadStore);

  const update = useCallback((updater: (s: ProgressStore) => ProgressStore) => {
    setStore(prev => {
      const next = updater(prev);
      saveStore(next);
      return next;
    });
  }, []);

  const getModuleProgress = useCallback(
    (moduleId: number): ModuleProgress => store.modules[moduleId] ?? DEFAULT_PROGRESS,
    [store],
  );

  const setModuleStatus = useCallback((moduleId: number, status: ModuleStatus) => {
    update(s => ({
      ...s,
      modules: {
        ...s.modules,
        [moduleId]: {
          ...s.modules[moduleId],
          status,
          ...(status === 'completed' && !s.modules[moduleId]?.completedAt
            ? { completedAt: new Date().toISOString() }
            : {}),
        },
      },
    }));
  }, [update]);

  const setMasteryLevel = useCallback((moduleId: number, masteryLevel: MasteryLevel) => {
    update(s => ({
      ...s,
      modules: {
        ...s.modules,
        [moduleId]: { ...s.modules[moduleId], masteryLevel },
      },
    }));
  }, [update]);

  const markVisited = useCallback((moduleId: number) => {
    update(s => {
      const existing = s.modules[moduleId];
      // Only bump to in_progress if not already further along
      const shouldUpgrade = !existing || existing.status === 'not_started';
      return {
        ...s,
        modules: {
          ...s.modules,
          [moduleId]: {
            ...existing,
            status: shouldUpgrade ? 'in_progress' : existing.status,
            lastVisited: new Date().toISOString(),
          },
        },
      };
    });
  }, [update]);

  const getSupermoduleStats = useCallback(
    (supermoduleId: number, moduleIds: number[]): SupermoduleStats => {
      let completed = 0, inProgress = 0;
      for (const id of moduleIds) {
        const s = store.modules[id]?.status ?? 'not_started';
        if (s === 'completed') completed++;
        else if (s === 'in_progress') inProgress++;
      }
      const total = moduleIds.length;
      return {
        supermoduleId,
        total,
        notStarted: total - completed - inProgress,
        inProgress,
        completed,
        percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    },
    [store],
  );

  const getOverallStats = useCallback((): OverallStats => {
    let completed = 0, inProgress = 0, ml1 = 0, ml2 = 0, ml3 = 0;
    const entries = Object.values(store.modules);
    for (const p of entries) {
      if (p.status === 'completed') completed++;
      else if (p.status === 'in_progress') inProgress++;
      if (p.masteryLevel === 1) ml1++;
      else if (p.masteryLevel === 2) ml2++;
      else if (p.masteryLevel === 3) ml3++;
    }
    const total = 215;
    return {
      total,
      notStarted: total - completed - inProgress,
      inProgress,
      completed,
      percentComplete: Math.round((completed / total) * 100),
      masteryLevel1: ml1,
      masteryLevel2: ml2,
      masteryLevel3: ml3,
    };
  }, [store]);

  const getStudyStreak = useCallback((): { currentStreak: number; lastStudiedDaysAgo: number } => {
    const activeDates = new Set<string>();
    for (const p of Object.values(store.modules)) {
      if (p.completedAt) activeDates.add(p.completedAt.slice(0, 10));
      if (p.lastVisited) activeDates.add(p.lastVisited.slice(0, 10));
    }
    if (activeDates.size === 0) return { currentStreak: 0, lastStudiedDaysAgo: -1 };

    const msPerDay = 86400000;
    const toStr = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const todayStr = toStr(today);
    const sorted = [...activeDates].sort().reverse();
    const lastStudiedDaysAgo = Math.round(
      (new Date(todayStr).getTime() - new Date(sorted[0]).getTime()) / msPerDay
    );

    let streak = 0;
    let cursor = activeDates.has(todayStr) ? today : new Date(today.getTime() - msPerDay);
    if (!activeDates.has(toStr(cursor))) return { currentStreak: 0, lastStudiedDaysAgo };
    while (activeDates.has(toStr(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - msPerDay);
    }
    return { currentStreak: streak, lastStudiedDaysAgo };
  }, [store]);

  const getHeatmapData = useCallback((weeks = 12): HeatmapDay[] => {
    const dayCount = new Map<string, number>();
    for (const p of Object.values(store.modules)) {
      const dates = new Set<string>();
      if (p.completedAt) dates.add(p.completedAt.slice(0, 10));
      if (p.lastVisited) dates.add(p.lastVisited.slice(0, 10));
      for (const d of dates) dayCount.set(d, (dayCount.get(d) ?? 0) + 1);
    }
    const result: HeatmapDay[] = [];
    const total = weeks * 7;
    const today = new Date();
    for (let i = total - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({ date: dateStr, count: dayCount.get(dateStr) ?? 0 });
    }
    return result;
  }, [store]);

  const getRecentCompletions = useCallback((limit = 5): RecentCompletion[] => {
    return Object.entries(store.modules)
      .filter(([, p]) => p.status === 'completed' && p.completedAt)
      .map(([id, p]) => ({ moduleId: Number(id), completedAt: p.completedAt! }))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, limit);
  }, [store]);

  const resetAll = useCallback(() => {
    const empty = { modules: {}, schemaVersion: SCHEMA_VERSION };
    saveStore(empty);
    setStore(empty);
  }, []);

  const exportJSON = useCallback(() => JSON.stringify(store, null, 2), [store]);

  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as ProgressStore;
      saveStore(parsed);
      setStore(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    getModuleProgress,
    setModuleStatus,
    setMasteryLevel,
    markVisited,
    getSupermoduleStats,
    getOverallStats,
    getStudyStreak,
    getHeatmapData,
    getRecentCompletions,
    resetAll,
    exportJSON,
    importJSON,
  };
}
