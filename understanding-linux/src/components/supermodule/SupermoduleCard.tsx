import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SUPERMODULE_COLORS } from '../../data/supermoduleColors';
import type { Supermodule } from '../../types/curriculum';
import type { SupermoduleStats } from '../../types/progress';

interface SupermoduleCardProps {
  supermodule: Supermodule;
  stats: SupermoduleStats;
}

export function SupermoduleCard({ supermodule, stats }: SupermoduleCardProps) {
  const c = SUPERMODULE_COLORS[supermodule.id];

  return (
    <Link
      to={`/supermodule/${supermodule.slug}`}
      style={{
        display: 'block', borderRadius: 20, padding: '20px 20px 16px',
        background: '#fff', textDecoration: 'none',
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        transition: 'all 0.2s ease',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 8px 32px rgba(0,0,0,.09)'; el.style.transform = 'translateY(-3px)'; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'; el.style.transform = 'translateY(0)'; }}
    >
      {/* Accent top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.dot }} />
      {/* Corner tint */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 20px 0 80px', background: `${c.dot}08`, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: `${c.dot}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.06em', color: '#7a7570' }}>
            SM {supermodule.id}
          </span>
        </div>
        <ArrowUpRight size={13} color="#c8c0b4" />
      </div>

      <h3 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 700, fontSize: 13.5, color: '#131311', lineHeight: 1.35, marginBottom: 7, letterSpacing: '-0.01em' }}>
        {supermodule.title}
      </h3>

      <p style={{ fontSize: 12, color: '#7a7570', lineHeight: 1.55, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {supermodule.description}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#7a7570', marginBottom: 7 }}>
        <span>{supermodule.moduleCount} modules</span>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 10.5, color: stats.percentComplete > 0 ? '#10b981' : '#c8c0b4' }}>
          {stats.completed}/{supermodule.moduleCount}
        </span>
      </div>
      <div style={{ height: 4, background: '#f0ece6', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${stats.percentComplete}%`, background: `linear-gradient(90deg, ${c.dot}, ${c.dot}cc)`, borderRadius: 10, transition: 'width 0.5s ease' }} />
      </div>
    </Link>
  );
}
