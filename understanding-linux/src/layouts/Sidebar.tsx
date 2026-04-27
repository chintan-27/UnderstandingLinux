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

export function Sidebar() {
  const { supermodules } = useCurriculum();
  const { getSupermoduleStats, getOverallStats } = useProgress();
  const { pathname } = useLocation();
  const overall = getOverallStats();

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, width: 64,
      height: '100vh', background: '#131311',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: 'hidden', zIndex: 40,
      paddingTop: 12, paddingBottom: 16,
      borderRight: '1px solid rgba(255,255,255,.05)',
    }}>

      {/* Brand icon */}
      <Link to="/" title="Home" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: 'linear-gradient(135deg, #e85c2c 0%, #e85c2c 100%)',
        boxShadow: '0 4px 12px rgba(232,92,44,.35)',
        textDecoration: 'none', marginBottom: 24,
      }}>
        <Terminal size={17} color="#fff" strokeWidth={2} />
      </Link>

      {/* Primary nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={label} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 11, textDecoration: 'none',
            background: isActive ? 'rgba(232,92,44,.18)' : 'transparent',
            transition: 'background 0.15s',
          })}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; if (el.style.background === 'transparent') el.style.background = 'rgba(255,255,255,.06)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; if (el.style.background === 'rgba(255,255,255, 0.06)') el.style.background = 'transparent'; }}
          >
            {({ isActive }) => <Icon size={17} color={isActive ? '#f5b8a0' : 'rgba(255,255,255,.35)'} strokeWidth={isActive ? 2.2 : 1.8} />}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,.08)', marginBottom: 12 }} />

      {/* Supermodule dots — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', padding: '4px 0', scrollbarWidth: 'none' }}>
        {supermodules.map(sm => {
          const stats = getSupermoduleStats(sm.id, sm.moduleIds);
          const c = SUPERMODULE_COLORS[sm.id];
          const isActive = pathname.startsWith(`/supermodule/${sm.slug}`);
          return (
            <Link
              key={sm.id} to={`/supermodule/${sm.slug}`} title={sm.title}
              style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `${c.dot}22` : 'transparent',
                textDecoration: 'none', transition: 'background 0.12s',
                position: 'relative',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${c.dot}18`}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isActive ? `${c.dot}22` : 'transparent'}
            >
              {/* Progress ring-ish: filled dot vs outlined */}
              {stats.percentComplete === 100 ? (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
              ) : stats.percentComplete > 0 ? (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, opacity: 0.55 }} />
              ) : (
                <span style={{ width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${c.dot}55`, background: 'transparent' }} />
              )}
            </Link>
          );
        })}
      </div>

      {/* Progress indicator at bottom */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 10 }}>
        <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${overall.percentComplete}%`, background: 'linear-gradient(90deg, #e85c2c, #f5b8a0)', borderRadius: 10, transition: 'width 0.5s' }} />
        </div>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8.5, color: 'rgba(255,255,255,.2)', letterSpacing: '0.05em' }}>
          {overall.percentComplete}%
        </span>
      </div>
    </aside>
  );
}
