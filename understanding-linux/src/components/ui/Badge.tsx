import type { ModuleStatus, MasteryLevel } from '../../types/progress';

const statusStyles: Record<ModuleStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500 border border-gray-200',
  in_progress: 'bg-amber-50 text-amber-600 border border-amber-200',
  completed: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
};

const statusLabels: Record<ModuleStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

const masteryStyles: Record<MasteryLevel, string> = {
  1: 'bg-blue-50 text-blue-600 border border-blue-200',
  2: 'bg-violet-50 text-violet-600 border border-violet-200',
  3: 'bg-pink-50 text-pink-600 border border-pink-200',
};

const masteryLabels: Record<MasteryLevel, string> = {
  1: 'Architectural',
  2: 'Operational',
  3: 'Implementer',
};

interface StatusBadgeProps {
  status: ModuleStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

interface MasteryBadgeProps {
  level: MasteryLevel;
  size?: 'sm' | 'md';
}

export function MasteryBadge({ level, size = 'md' }: MasteryBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${masteryStyles[level]}`}>
      {masteryLabels[level]}
    </span>
  );
}
