import { Link } from 'react-router-dom';
import type { ModuleProgress } from '../../types/progress';
import type { Module } from '../../types/curriculum';

interface ModuleDotGridProps {
  moduleIds: number[];
  getProgress: (id: number) => ModuleProgress;
  getModule: (id: number) => Module | undefined;
}

function dotColor(status: string): string {
  if (status === 'completed') return '#1e1a16';
  if (status === 'in_progress') return '#a09890';
  return '#e5e0d8';
}

export function ModuleDotGrid({ moduleIds, getProgress, getModule }: ModuleDotGridProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {moduleIds.map(id => {
        const prog = getProgress(id);
        const mod = getModule(id);
        if (!mod) return null;
        return (
          <Link
            key={id}
            to={`/module/${mod.slug}`}
            title={`${mod.id}. ${mod.title} (${prog.status.replace(/_/g, ' ')})`}
            onClick={e => e.stopPropagation()}
            style={{
              width: 8,
              height: 8,
              background: dotColor(prog.status),
              display: 'block',
              flexShrink: 0,
              transition: 'transform 0.1s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.5)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = '')}
          />
        );
      })}
    </div>
  );
}
