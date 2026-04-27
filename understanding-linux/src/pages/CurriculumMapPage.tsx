import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { ModuleCard } from '../components/module/ModuleCard';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';

export function CurriculumMapPage() {
  const { supermodules, getModulesForSupermodule } = useCurriculum();
  const { getModuleProgress, getSupermoduleStats } = useProgress();

  return (
    <div style={{ padding: '28px 32px 40px', fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800, fontSize: 26, color: '#131311', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>
          Curriculum Map
        </h1>
        <p style={{ fontSize: 13.5, color: '#7a7570' }}>215 modules across 12 supermodules — click any tile to open the lesson</p>
      </div>

      {/* Anchor nav */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32,
        padding: '14px 16px', background: '#ffffff', borderRadius: 18,
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
      }}>
        {supermodules.map(sm => {
          const c = SUPERMODULE_COLORS[sm.id];
          return (
            <a key={sm.id} href={`#sm-${sm.id}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 20,
              fontSize: 11.5, fontWeight: 500, textDecoration: 'none',
              background: c.bg, color: c.text,
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
              {sm.id}. {sm.title.split(' ').slice(0, 3).join(' ')}
            </a>
          );
        })}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {supermodules.map(sm => {
          const modules = getModulesForSupermodule(sm.id);
          const smStats = getSupermoduleStats(sm.id, sm.moduleIds);
          const c = SUPERMODULE_COLORS[sm.id];
          return (
            <section key={sm.id} id={`sm-${sm.id}`}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 14, paddingBottom: 12, borderBottom: '2px solid #e5e0d8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: `${c.dot}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.dot }} />
                  </span>
                  <div>
                    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7a7570', marginBottom: 3 }}>
                      Supermodule {sm.id}
                    </div>
                    <h2 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 700, fontSize: 16.5, color: '#131311', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
                      {sm.title}
                    </h2>
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: smStats.percentComplete > 0 ? '#10b981' : '#7a7570' }}>
                    {smStats.completed}/{sm.moduleCount}
                  </span>
                  <div style={{ width: 64, height: 4, background: '#f0ece6', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${smStats.percentComplete}%`, background: c.dot, borderRadius: 10, transition: 'width 0.4s' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
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
