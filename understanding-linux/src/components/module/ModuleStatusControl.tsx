import { Check, Circle, PlayCircle } from 'lucide-react';
import type { ModuleStatus } from '../../types/progress';

interface ModuleStatusControlProps {
  status: ModuleStatus;
  onChange: (status: ModuleStatus) => void;
  layout?: 'row' | 'stack';
}

const STATES: { value: ModuleStatus; label: string; icon: typeof Circle }[] = [
  { value: 'not_started', label: 'Not started', icon: Circle },
  { value: 'in_progress', label: 'In progress', icon: PlayCircle },
  { value: 'completed', label: 'Completed', icon: Check },
];

const activeColors: Record<ModuleStatus, { bg: string; text: string; border: string }> = {
  not_started: { bg: '#faf7f2', text: '#3a3530', border: '#c8c0b4' },
  in_progress: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  completed: { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' },
};

export function ModuleStatusControl({ status, onChange, layout = 'row' }: ModuleStatusControlProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexDirection: layout === 'stack' ? 'column' : 'row', flexWrap: 'wrap' }}>
      {STATES.map(({ value, label, icon: Icon }) => {
        const isActive = status === value;
        const ac = activeColors[value];
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 9,
              fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: '"Inter", system-ui',
              background: isActive ? ac.bg : '#f8f9fc',
              color: isActive ? ac.text : '#7a7570',
              border: `1px solid ${isActive ? ac.border : 'transparent'}`,
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
