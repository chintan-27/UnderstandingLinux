import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SUPERMODULE_COLORS } from '../../data/supermoduleColors';
import { ModuleDotGrid } from './ModuleDotGrid';
import type { Supermodule } from '../../types/curriculum';
import type { SupermoduleStats, ModuleProgress } from '../../types/progress';
import type { Module } from '../../types/curriculum';

interface SupermoduleProgressRowProps {
  supermodule: Supermodule;
  stats: SupermoduleStats;
  getModuleProgress: (id: number) => ModuleProgress;
  getModule: (id: number) => Module | undefined;
  index: number;
}

export function SupermoduleProgressRow({
  supermodule,
  stats,
  getModuleProgress,
  getModule,
  index,
}: SupermoduleProgressRowProps) {
  const c = SUPERMODULE_COLORS[supermodule.id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.25, 0, 0, 1] }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '14px 0',
        borderTop: index > 0 ? '1px solid #d5cfc6' : 'none',
      }}
    >
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, background: c.dot, flexShrink: 0, display: 'block' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: '#a09890',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}>
            SM {String(supermodule.id).padStart(2, '0')}
          </div>
          <Link
            to={`/supermodule/${supermodule.slug}`}
            style={{
              fontFamily: '"Barlow Condensed", system-ui',
              fontSize: 14,
              fontWeight: 700,
              color: '#131311',
              textDecoration: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {supermodule.title}
          </Link>
        </div>
      </div>

      {/* Dot grid */}
      <div style={{ flex: 1 }}>
        <ModuleDotGrid
          moduleIds={supermodule.moduleIds}
          getProgress={getModuleProgress}
          getModule={getModule}
        />
      </div>

      {/* Count */}
      <div style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: '#6b6560',
        flexShrink: 0,
        width: 48,
        textAlign: 'right',
      }}>
        {stats.completed}/{supermodule.moduleCount}
      </div>
    </motion.div>
  );
}
