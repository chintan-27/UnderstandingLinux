interface ProgressBarProps {
  value: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function ProgressBar({ value, size = 'md', showLabel = false }: ProgressBarProps) {
  const h = size === 'sm' ? 4 : 5;
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#e5e0d8', borderRadius: 10, overflow: 'hidden', height: h }}>
        <div style={{
          height: '100%', width: `${clamped}%`,
          background: 'linear-gradient(90deg, #e85c2c, #e85c2c)',
          borderRadius: 10, transition: 'width 0.5s ease',
        }} />
      </div>
      {showLabel && (
        <span style={{ fontSize: 11, color: '#7a7570', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0, width: 30, textAlign: 'right' }}>
          {clamped}%
        </span>
      )}
    </div>
  );
}
