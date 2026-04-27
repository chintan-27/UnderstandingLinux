import { Link, NavLink, useLocation } from 'react-router-dom';
import { Terminal, LayoutGrid, TrendingUp, Home } from 'lucide-react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/curriculum', label: 'Curriculum', icon: LayoutGrid, end: false },
  { to: '/progress', label: 'Progress', icon: TrendingUp, end: false },
];

export function TopNav() {
  const { supermodules } = useCurriculum();
  const { getSupermoduleStats, getOverallStats } = useProgress();
  const { pathname } = useLocation();
  const overall = getOverallStats();

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 50,
      background: 'rgba(250,247,242,.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid #e5e0d8',
      display: 'flex', alignItems: 'center',
      padding: '0 36px', gap: 0,
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>

      {/* Logo */}
      <Link to="/" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        textDecoration: 'none', marginRight: 40, flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: '#131311',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Terminal size={15} color="#faf7f2" strokeWidth={2} />
        </div>
        <span style={{
          fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800,
          fontSize: 14, color: '#131311', letterSpacing: '-0.03em',
        }}>
          Understanding Linux
        </span>
      </Link>

      {/* Primary nav */}
      <nav style={{ display: 'flex', gap: 2 }}>
        {NAV.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
            display: 'inline-flex', alignItems: 'center',
            padding: '6px 14px', borderRadius: 8,
            fontSize: 13.5, fontWeight: isActive ? 600 : 450,
            color: isActive ? '#131311' : '#6b6560',
            textDecoration: 'none', transition: 'all 0.12s',
            background: isActive ? '#ffffff' : 'transparent',
            boxShadow: isActive ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
          })}>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Supermodule dot trail */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 24 }}>
        {supermodules.map(sm => {
          const stats = getSupermoduleStats(sm.id, sm.moduleIds);
          const c = SUPERMODULE_COLORS[sm.id];
          const isActive = pathname.startsWith(`/supermodule/${sm.slug}`);
          return (
            <Link key={sm.id} to={`/supermodule/${sm.slug}`} title={sm.title} style={{
              width: isActive ? 20 : 8, height: 8, borderRadius: 10,
              background: stats.percentComplete === 100 ? c.dot : stats.percentComplete > 0 ? c.dot : `${c.dot}40`,
              transition: 'all 0.2s ease', textDecoration: 'none', flexShrink: 0,
            }} />
          );
        })}
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 64, height: 4, background: '#e5e0d8', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${overall.percentComplete}%`, background: '#e85c2c', borderRadius: 10, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: '#a09890', fontWeight: 500 }}>
          {overall.percentComplete}%
        </span>
      </div>
    </header>
  );
}
