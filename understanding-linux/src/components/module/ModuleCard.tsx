import { Link } from 'react-router-dom';
import type { Module } from '../../types/curriculum';
import type { ModuleStatus } from '../../types/progress';

const statusDot: Record<ModuleStatus, string> = {
  not_started: '#e5e0d8',
  in_progress: '#a09890',
  completed:   '#1e1a16',
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
        display: 'block',
        textDecoration: 'none',
        padding: '10px 12px',
        borderRight: '1px solid #e5e0d8',
        borderBottom: '1px solid #e5e0d8',
        background: '#faf7f2',
        transition: 'background 0.1s',
        minHeight: 70,
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f0ece6'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#faf7f2'}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#a09890', letterSpacing: '0.06em' }}>
            #{module.id}
          </span>
          <span style={{ width: 6, height: 6, background: statusDot[status], flexShrink: 0 }} />
        </div>
        <p style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: '#1e1a16',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          margin: 0,
        }}>
          {module.title}
        </p>
      </Link>
    );
  }

  return (
    <Link to={`/module/${module.slug}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <h4 style={{
            fontFamily: '"Inter", system-ui',
            fontSize: 14, fontWeight: 600, color: '#131311', lineHeight: 1.3, margin: 0,
          }}>
            {module.title}
          </h4>
        </div>
        <span style={{ width: 8, height: 8, background: statusDot[status], flexShrink: 0 }} />
      </div>
      {module.topics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {module.topics.slice(0, 4).map(topic => (
            <span key={topic} style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {topic}
            </span>
          ))}
          {module.topics.length > 4 && (
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#c8c0b4' }}>
              +{module.topics.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
