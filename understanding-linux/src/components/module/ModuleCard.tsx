import { Link } from 'react-router-dom';
import type { Module } from '../../types/curriculum';
import type { ModuleStatus } from '../../types/progress';

const statusDot: Record<ModuleStatus, string> = {
  not_started: '#c8c0b4',
  in_progress: '#f59e0b',
  completed: '#10b981',
};

interface ModuleCardProps {
  module: Module;
  status: ModuleStatus;
  compact?: boolean;
}

export function ModuleCard({ module, status, compact = false }: ModuleCardProps) {
  if (compact) {
    return (
      <Link to={`/module/${module.slug}`} title={module.title} style={{
        display: 'block', borderRadius: 14, textDecoration: 'none',
        padding: '11px 13px', transition: 'all 0.15s',
        background: '#ffffff',
        boxShadow: status === 'completed' ? 'inset 0 0 0 1.5px rgba(16,185,129,0.25), 0 1px 3px rgba(0,0,0,.04)' :
                   status === 'in_progress' ? 'inset 0 0 0 1.5px rgba(245,158,11,0.25), 0 1px 3px rgba(0,0,0,.04)' :
                   '0 1px 3px rgba(0,0,0,.04)',
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = status === 'completed'
          ? 'inset 0 0 0 1.5px rgba(16,185,129,0.25), 0 1px 3px rgba(0,0,0,.04)'
          : status === 'in_progress'
          ? 'inset 0 0 0 1.5px rgba(245,158,11,0.25), 0 1px 3px rgba(0,0,0,.04)'
          : '0 1px 3px rgba(0,0,0,.04)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 5 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, color: '#7a7570' }}>#{module.id}</span>
          <span style={{ width: 6.5, height: 6.5, borderRadius: '50%', background: statusDot[status], flexShrink: 0 }} />
        </div>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#1e1a16', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {module.title}
        </p>
      </Link>
    );
  }

  return (
    <Link to={`/module/${module.slug}`} style={{ display: 'block', textDecoration: 'none', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: '#7a7570', flexShrink: 0 }}>#{module.id}</span>
          <h4 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 14, fontWeight: 600, color: '#131311', lineHeight: 1.3 }}>{module.title}</h4>
        </div>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot[status], flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
        {module.topics.slice(0, 4).map(topic => (
          <span key={topic} style={{ fontSize: 11, borderRadius: 20, padding: '3px 10px', background: '#faf7f2', color: '#6b6560' }}>
            {topic}
          </span>
        ))}
        {module.topics.length > 4 && <span style={{ fontSize: 11, color: '#7a7570' }}>+{module.topics.length - 4}</span>}
      </div>
    </Link>
  );
}
