import type { ModuleStatus } from '../../types/progress';

interface ModuleStatusControlProps {
  status: ModuleStatus;
  onChange: (status: ModuleStatus) => void;
  layout?: 'row' | 'stack' | 'compact';
}

const ORDER: ModuleStatus[] = ['not_started', 'in_progress', 'completed'];

const DOT: Record<ModuleStatus, string> = {
  not_started: '#e5e0d8',
  in_progress:  '#a09890',
  completed:    '#1e1a16',
};

const LABEL: Record<ModuleStatus, string> = {
  not_started: 'Not Started',
  in_progress:  'In Progress',
  completed:    'Completed',
};

// Compact: single button, click to cycle to next status
function CompactControl({ status, onChange }: { status: ModuleStatus; onChange: (s: ModuleStatus) => void }) {
  const next = ORDER[(ORDER.indexOf(status) + 1) % ORDER.length];
  return (
    <button
      onClick={() => onChange(next)}
      title={`Mark as ${LABEL[next]}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
        background: 'none', border: '1px solid #d5cfc6', cursor: 'pointer',
        color: status === 'not_started' ? '#a09890' : '#131311',
        fontWeight: status === 'not_started' ? 400 : 600,
        whiteSpace: 'nowrap',
        transition: 'border-color 0.1s, color 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#a09890'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#d5cfc6'}
    >
      <span style={{ width: 6, height: 6, background: DOT[status], flexShrink: 0 }} />
      {LABEL[status]}
    </button>
  );
}

// Stack: vertical list of all 3 options (used in sidebar)
function StackControl({ status, onChange }: { status: ModuleStatus; onChange: (s: ModuleStatus) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {ORDER.map(value => {
        const isActive = status === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 0',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'none', border: 'none', borderBottom: '1px solid #f0ece6',
              cursor: 'pointer', textAlign: 'left',
              color: isActive ? '#131311' : '#c8c0b4',
              fontWeight: isActive ? 600 : 400,
              transition: 'color 0.1s',
            }}
          >
            <span style={{ width: 6, height: 6, background: isActive ? DOT[value] : '#e5e0d8', flexShrink: 0 }} />
            {LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}

export function ModuleStatusControl({ status, onChange, layout = 'row' }: ModuleStatusControlProps) {
  if (layout === 'compact') return <CompactControl status={status} onChange={onChange} />;
  return <StackControl status={status} onChange={onChange} />;
}
