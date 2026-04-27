interface MasteryBreakdownProps {
  level1: number;
  level2: number;
  level3: number;
}

const LEVELS = [
  { label: 'Architectural', key: 'level1' as const, dot: '#60a5fa', text: '#2563eb' },
  { label: 'Operational', key: 'level2' as const, dot: '#f5b8a0', text: '#7c3aed' },
  { label: 'Implementer', key: 'level3' as const, dot: '#f472b6', text: '#db2777' },
];

export function MasteryBreakdown({ level1, level2, level3 }: MasteryBreakdownProps) {
  const counts = { level1, level2, level3 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {LEVELS.map(l => (
        <div key={l.key} style={{
          textAlign: 'center', background: '#fff', borderRadius: 14,
          border: '1px solid #e8eaed', padding: '18px 16px',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.dot, margin: '0 auto 8px' }} />
          <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 24, fontWeight: 800, color: l.text }}>{counts[l.key]}</div>
          <div style={{ fontSize: 12, color: '#7a7570', marginTop: 4 }}>{l.label}</div>
        </div>
      ))}
    </div>
  );
}
