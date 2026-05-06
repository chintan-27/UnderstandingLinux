import { motion } from 'framer-motion';
import type { HeatmapDay } from '../../types/progress';

const DAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

function heatmapColor(count: number): string {
  if (count === 0) return '#ede8e1';
  if (count === 1) return '#c8bfb4';
  if (count <= 3) return '#8a7f74';
  if (count <= 6) return '#4a4038';
  return '#1e1a16';
}

function formatTitle(date: string, count: number): string {
  const d = new Date(date + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return count === 0 ? label : `${label} — ${count} module${count > 1 ? 's' : ''}`;
}

export function CompletionHeatmap({ data }: { data: HeatmapDay[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      {/* Day labels */}
      <div style={{
        display: 'grid',
        gridTemplateRows: 'repeat(7, 8px)',
        gap: 3,
      }}>
        {DAY_LABELS.map((label, i) => (
          <div key={i} style={{
            height: 8,
            lineHeight: '8px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 8,
            color: '#a09890',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Cell grid */}
      <div style={{
        display: 'grid',
        gridTemplateRows: 'repeat(7, 8px)',
        gridAutoFlow: 'column',
        gap: 3,
      }}>
        {data.map((day, i) => {
          const weekIndex = Math.floor(i / 7);
          return (
            <motion.div
              key={day.date}
              title={formatTitle(day.date, day.count)}
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{
                delay: weekIndex * 0.04,
                duration: 0.25,
                ease: 'easeOut',
              }}
              style={{
                width: 10,
                height: 8,
                background: heatmapColor(day.count),
                transformOrigin: 'bottom',
                cursor: day.count > 0 ? 'default' : 'default',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
