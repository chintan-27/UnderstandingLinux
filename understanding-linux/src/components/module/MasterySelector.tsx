import type { MasteryLevel } from '../../types/progress';

interface MasterySelectorProps {
  level: MasteryLevel | undefined;
  onChange: (level: MasteryLevel) => void;
}

const LEVELS: { value: MasteryLevel; label: string; desc: string; dot: string }[] = [
  { value: 1, label: 'Architectural', desc: 'Know the subsystem, why it exists', dot: '#60a5fa' },
  { value: 2, label: 'Operational',   desc: 'Can use tools, debug, explain behavior', dot: '#a78bfa' },
  { value: 3, label: 'Implementer',   desc: 'Can read and write systems code here', dot: '#f472b6' },
];

export function MasterySelector({ level, onChange }: MasterySelectorProps) {
  return (
    <div>
      <p style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9, fontWeight: 600, color: '#a09890',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
      }}>
        Mastery Level
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {LEVELS.map(l => {
          const isActive = level === l.value;
          return (
            <button
              key={l.value}
              onClick={() => onChange(l.value)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 0',
                fontSize: 11, cursor: 'pointer',
                fontFamily: '"Inter", system-ui',
                background: 'none', border: 'none',
                borderBottom: '1px solid #f0ece6',
                color: isActive ? '#131311' : '#a09890',
                display: 'flex', alignItems: 'flex-start', gap: 8,
                transition: 'color 0.1s',
              }}
            >
              <span style={{
                width: 8, height: 8, flexShrink: 0, marginTop: 2,
                background: isActive ? l.dot : '#e5e0d8',
                transition: 'background 0.1s',
              }} />
              <div>
                <div style={{ fontWeight: isActive ? 600 : 400, fontSize: 11, marginBottom: 2 }}>{l.label}</div>
                <div style={{ fontSize: 10, color: '#a09890', lineHeight: 1.4 }}>{l.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
