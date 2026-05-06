export type ModuleStatus = 'not_started' | 'in_progress' | 'completed';
export type MasteryLevel = 1 | 2 | 3;

export interface ModuleProgress {
  status: ModuleStatus;
  masteryLevel?: MasteryLevel;
  lastVisited?: string;
  completedAt?: string;
}

export interface ProgressStore {
  modules: Record<number, ModuleProgress>;
  schemaVersion: number;
}

export interface SupermoduleStats {
  supermoduleId: number;
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  percentComplete: number;
}

export interface OverallStats {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  percentComplete: number;
  masteryLevel1: number;
  masteryLevel2: number;
  masteryLevel3: number;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface RecentCompletion {
  moduleId: number;
  completedAt: string;
}
