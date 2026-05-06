import { useParams, Link } from 'react-router-dom';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { ModuleCard } from '../components/module/ModuleCard';
import { ModuleStatusControl } from '../components/module/ModuleStatusControl';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';
import type { ModuleStatus } from '../types/progress';

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };
const COND: React.CSSProperties = { fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui' };

export function SupermodulePage() {
  const { supermoduleSlug } = useParams<{ supermoduleSlug: string }>();
  const { getSupermoduleBySlug, getModulesForSupermodule } = useCurriculum();
  const { getModuleProgress, setModuleStatus, getSupermoduleStats } = useProgress();
  const { isMobile, isTablet } = useBreakpoint();

  const sm = getSupermoduleBySlug(supermoduleSlug ?? '');
  if (!sm) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ ...MONO, fontSize: 11, color: '#a09890' }}>Supermodule not found.</div>
        <Link to="/curriculum" style={{ ...MONO, fontSize: 11, color: '#131311', textDecoration: 'none', display: 'block', marginTop: 8 }}>← Curriculum</Link>
      </div>
    );
  }

  const modules = getModulesForSupermodule(sm.id);
  const stats = getSupermoduleStats(sm.id, sm.moduleIds);
  const c = SUPERMODULE_COLORS[sm.id];
  const px = isMobile ? '16px' : isTablet ? '28px' : '48px';

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ padding: `28px ${px} 0`, borderBottom: '3px solid #131311' }}>
        <div style={{ marginBottom: 10 }}>
          <Link to="/curriculum" style={{ ...MONO, fontSize: 9, color: '#a09890', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ← Curriculum
          </Link>
        </div>

        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          justifyContent: 'space-between',
          paddingBottom: 20, gap: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, background: c.dot, flexShrink: 0 }} />
              <span style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Supermodule {String(sm.id).padStart(2, '0')}
              </span>
            </div>
            <h1 style={{ ...COND, fontWeight: 700, fontSize: isMobile ? 36 : 52, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 0.92, color: '#131311', margin: 0 }}>
              {sm.title}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 20 : 24, flexShrink: 0 }}>
            {[
              [stats.completed, 'Done'],
              [stats.inProgress, 'Active'],
              [stats.notStarted, 'Pending'],
            ].map(([val, label], idx) => (
              <div key={String(label)} style={{ borderLeft: idx > 0 ? '1px solid #d5cfc6' : 'none', paddingLeft: idx > 0 ? 20 : 0 }}>
                <div style={{ ...COND, fontSize: isMobile ? 28 : 36, fontWeight: 700, color: '#131311', lineHeight: 1, letterSpacing: '-0.02em' }}>{val}</div>
                <div style={{ ...MONO, fontSize: 9, color: '#a09890', marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 3, background: '#e5e0d8' }}>
          <div style={{ height: '100%', width: `${stats.percentComplete}%`, background: c.dot, transition: 'width 0.4s' }} />
        </div>
      </div>

      {sm.description && (
        <div style={{ padding: `16px ${px}`, borderBottom: '1px solid #d5cfc6' }}>
          <p style={{ fontSize: 13.5, color: '#6b6560', lineHeight: 1.7, maxWidth: '60ch', margin: 0 }}>{sm.description}</p>
        </div>
      )}

      <div style={{ padding: `0 ${px} 80px` }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '44px 1fr' : '56px 1fr 140px',
          padding: '10px 0', borderBottom: '1px solid #d5cfc6',
        }}>
          {(isMobile ? ['#', 'Module'] : ['#', 'Module', 'Status']).map(h => (
            <div key={h} style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {modules.map((module) => {
          const progress = getModuleProgress(module.id);
          return (
            <div key={module.id} style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '44px 1fr' : '56px 1fr 140px',
              alignItems: 'center', gap: 0,
              borderBottom: '1px solid #f0ece6',
              padding: '12px 0',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f5f2ec'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ ...MONO, fontSize: 10, color: '#a09890', letterSpacing: '0.04em' }}>
                {String(module.id).padStart(3, '0')}
              </div>
              <div style={{ minWidth: 0, paddingRight: isMobile ? 0 : 20 }}>
                <ModuleCard module={module} status={progress.status} />
              </div>
              {!isMobile && (
                <div>
                  <ModuleStatusControl layout="compact" status={progress.status} onChange={(s: ModuleStatus) => setModuleStatus(module.id, s)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
