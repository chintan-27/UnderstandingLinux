interface StatBlockProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}

export function StatBlock({ label, value, sub, accent = false }: StatBlockProps) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 36, fontWeight: 800,
        letterSpacing: '-0.04em', color: accent ? '#e85c2c' : '#131311',
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
