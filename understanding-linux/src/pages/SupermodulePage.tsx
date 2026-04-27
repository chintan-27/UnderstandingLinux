import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { ModuleCard } from '../components/module/ModuleCard';
import { ModuleStatusControl } from '../components/module/ModuleStatusControl';
import { Breadcrumb } from '../components/nav/Breadcrumb';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';
import type { ModuleStatus } from '../types/progress';

export function SupermodulePage() {
  const { supermoduleSlug } = useParams<{ supermoduleSlug: string }>();
  const { getSupermoduleBySlug, getModulesForSupermodule } = useCurriculum();
  const { getModuleProgress, setModuleStatus, getSupermoduleStats } = useProgress();

  const sm = getSupermoduleBySlug(supermoduleSlug ?? '');
  if (!sm) {
    return <div style={{ padding: 40, color: '#6b6560' }}>Supermodule not found. <Link to="/curriculum" style={{ color: '#e85c2c' }}>← Back</Link></div>;
  }

  const modules = getModulesForSupermodule(sm.id);
  const stats = getSupermoduleStats(sm.id, sm.moduleIds);
  const c = SUPERMODULE_COLORS[sm.id];

  return (
    <div style={{ padding: '28px 32px 40px', maxWidth: 880, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <Breadcrumb crumbs={[{ label: 'Curriculum', to: '/curriculum' }, { label: sm.title }]} />

      {/* Header card */}
      <div style={{
        marginTop: 18, marginBottom: 24,
        background: '#ffffff', borderRadius: 24, padding: '28px 32px',
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Accent top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.dot }} />
        {/* Subtle corner tint */}
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 200, height: 200,
          borderRadius: '0 24px 0 200px', background: `${c.dot}08`, pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${c.dot}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.dot }} />
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7a7570' }}>
            Supermodule {sm.id}
          </span>
        </div>

        <h1 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800, fontSize: 26, color: '#131311', letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 10 }}>
          {sm.title}
        </h1>
        <p style={{ fontSize: 13.5, color: '#6b6560', lineHeight: 1.65, maxWidth: '55ch', marginBottom: 22 }}>
          {sm.description}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
            <div style={{ flex: 1, height: 6, background: '#f0ece6', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${stats.percentComplete}%`, background: c.dot, borderRadius: 10, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#10b981', fontWeight: 600, flexShrink: 0 }}>
              {stats.percentComplete}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}>
            <span style={{ color: '#10b981' }}>{stats.completed} done</span>
            <span style={{ color: '#f59e0b' }}>{stats.inProgress} active</span>
            <span style={{ color: '#7a7570' }}>{stats.notStarted} pending</span>
          </div>
        </div>
      </div>

      {/* Module list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modules.map(module => {
          const progress = getModuleProgress(module.id);
          return (
            <div key={module.id} style={{
              background: '#ffffff', borderRadius: 18,
              boxShadow: '0 1px 4px rgba(0,0,0,.05)',
              transition: 'box-shadow 0.15s',
            }}>
              <div style={{ padding: '16px 20px 12px' }}>
                <ModuleCard module={module} status={progress.status} />
              </div>
              <div style={{ padding: '10px 20px 14px', borderTop: '1px solid #f0ece6' }}>
                <ModuleStatusControl status={progress.status} onChange={(s: ModuleStatus) => setModuleStatus(module.id, s)} />
              </div>
            </div>
          );
        })}
      </div>

      <Link to="/curriculum"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 28, fontSize: 13, color: '#7a7570', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#131311'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#7a7570'}
      >
        <ArrowLeft size={13} /> Curriculum map
      </Link>
    </div>
  );
}
