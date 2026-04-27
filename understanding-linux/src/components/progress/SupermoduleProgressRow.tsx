import { Link } from 'react-router-dom';
import { ProgressBar } from '../ui/ProgressBar';
import { SUPERMODULE_COLORS } from '../../data/supermoduleColors';
import type { Supermodule } from '../../types/curriculum';
import type { SupermoduleStats } from '../../types/progress';

interface SupermoduleProgressRowProps {
  supermodule: Supermodule;
  stats: SupermoduleStats;
}

export function SupermoduleProgressRow({ supermodule, stats }: SupermoduleProgressRowProps) {
  const c = SUPERMODULE_COLORS[supermodule.id];
  return (
    <Link
      to={`/supermodule/${supermodule.slug}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px', textDecoration: 'none',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8f9fc'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1e1a16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {supermodule.title}
          </span>
          <span style={{ fontSize: 11, color: '#7a7570', flexShrink: 0, marginLeft: 8, fontFamily: '"JetBrains Mono", monospace' }}>
            {stats.completed}/{supermodule.moduleCount}
          </span>
        </div>
        <ProgressBar value={stats.percentComplete} size="sm" />
      </div>
    </Link>
  );
}
