import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Crumb { label: string; to?: string; }

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.04em' }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <ChevronRight size={11} color="#cdd1d9" />}
          {c.to ? (
            <Link to={c.to} style={{ color: '#7a7570', textDecoration: 'none', transition: 'color 0.12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#1e1a16'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#7a7570'}
            >
              {c.label}
            </Link>
          ) : (
            <span style={{ color: '#3a3530', fontWeight: 500 }}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
