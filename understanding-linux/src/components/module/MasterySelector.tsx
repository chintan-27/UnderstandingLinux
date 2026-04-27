import type { MasteryLevel } from '../../types/progress';

interface MasterySelectorProps {
  level: MasteryLevel | undefined;
  onChange: (level: MasteryLevel) => void;
}

const LEVELS: { value: MasteryLevel; label: string; desc: string; bg: string; border: string; text: string }[] = [
  { value: 1, label: 'Architectural', desc: 'Know the subsystem, why it exists, how it fits', bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  { value: 2, label: 'Operational', desc: 'Can use tools, debug, read traces, explain behavior', bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9' },
  { value: 3, label: 'Implementer', desc: 'Can read and write kernel/systems code in this area', bg: '#fdf2f8', border: '#f9a8d4', text: '#be185d' },
];

export function MasterySelector({ level, onChange }: MasterySelectorProps) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#7a7570', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace' }}>
        Mastery level
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LEVELS.map(l => {
          const isActive = level === l.value;
          return (
            <button
              key={l.value}
              onClick={() => onChange(l.value)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px',
                borderRadius: 10, fontSize: 12, cursor: 'pointer',
                transition: 'all 0.15s', fontFamily: '"Inter", system-ui',
                background: isActive ? l.bg : '#f8f9fc',
                border: `1px solid ${isActive ? l.border : 'transparent'}`,
                color: isActive ? l.text : '#7a7570',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>{l.label}</div>
              <div style={{ opacity: 0.75, marginTop: 2, fontSize: 11, lineHeight: 1.4 }}>{l.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
