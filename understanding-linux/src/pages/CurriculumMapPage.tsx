import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { ModuleCard } from '../components/module/ModuleCard';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };
const COND: React.CSSProperties = { fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui' };

export function CurriculumMapPage() {
  const { supermodules, getModulesForSupermodule } = useCurriculum();
  const { getModuleProgress, getSupermoduleStats } = useProgress();
  const { isMobile, isTablet } = useBreakpoint();
  const px = isMobile ? '16px' : isTablet ? '28px' : '48px';

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ padding: `28px ${px} 0`, borderBottom: '3px solid #131311' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 14 }}>
          <h1 style={{ ...COND, fontWeight: 700, fontSize: isMobile ? 36 : 56, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1, color: '#131311', margin: 0 }}>
            Curriculum Map
          </h1>
          {!isMobile && <span style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.08em', textTransform: 'uppercase' }}>215 modules · 12 supermodules</span>}
        </div>
      </div>

      {/* Anchor nav */}
      <div style={{
        padding: `10px ${px}`, borderBottom: '1px solid #d5cfc6',
        display: 'flex', flexWrap: 'wrap', gap: 0,
        background: '#faf7f2', position: 'sticky', top: 48, zIndex: 30,
        overflowX: 'auto',
      }}>
        {supermodules.map((sm, i) => {
          const c = SUPERMODULE_COLORS[sm.id];
          return (
            <a key={sm.id} href={`#sm-${sm.id}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px 4px 0',
              ...MONO, fontSize: 9, color: '#6b6560', textDecoration: 'none',
              borderLeft: i > 0 ? '1px solid #e5e0d8' : 'none',
              paddingLeft: i > 0 ? 10 : 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 5, height: 5, background: c.dot, flexShrink: 0 }} />
              SM{sm.id}
            </a>
          );
        })}
      </div>

      <div style={{ padding: `0 ${px} 80px` }}>
        {supermodules.map(sm => {
          const modules = getModulesForSupermodule(sm.id);
          const smStats = getSupermoduleStats(sm.id, sm.moduleIds);
          const c = SUPERMODULE_COLORS[sm.id];
          const cols = isMobile ? 'repeat(auto-fill, minmax(130px, 1fr))' : 'repeat(auto-fill, minmax(148px, 1fr))';
          return (
            <section key={sm.id} id={`sm-${sm.id}`} style={{ paddingTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #d5cfc6', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, background: c.dot, flexShrink: 0 }} />
                  <div>
                    <div style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                      SM {String(sm.id).padStart(2, '0')}
                    </div>
                    <h2 style={{ ...COND, fontWeight: 700, fontSize: isMobile ? 18 : 22, textTransform: 'uppercase', color: '#131311', letterSpacing: '0.01em', margin: 0, lineHeight: 1 }}>
                      {sm.title}
                    </h2>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {!isMobile && (
                    <div style={{ width: 64, height: 2, background: '#e5e0d8' }}>
                      <div style={{ height: '100%', width: `${smStats.percentComplete}%`, background: c.dot }} />
                    </div>
                  )}
                  <span style={{ ...MONO, fontSize: 9, color: '#a09890' }}>{smStats.completed}/{sm.moduleCount}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 0 }}>
                {modules.map(m => (
                  <ModuleCard key={m.id} module={m} status={getModuleProgress(m.id).status} compact />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
