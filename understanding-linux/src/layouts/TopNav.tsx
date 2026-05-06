import { Link, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';
import { Home, LayoutGrid, TrendingUp, X, Menu } from 'lucide-react';

function useScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop || document.body.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? (scrolled / max) * 100 : 0);
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return pct;
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/curriculum', label: 'Curriculum', icon: LayoutGrid, end: false },
  { to: '/progress', label: 'Progress', icon: TrendingUp, end: false },
];

export function TopNav() {
  const { supermodules } = useCurriculum();
  const { getSupermoduleStats, getOverallStats } = useProgress();
  const { isMobile, isTablet } = useBreakpoint();
  const overall = getOverallStats();
  const scrollPct = useScrollProgress();
  const [menuOpen, setMenuOpen] = useState(false);

  const compact = isMobile || isTablet;

  return (
    <>
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 48, zIndex: 50,
        background: '#faf7f2',
        borderBottom: '1px solid #131311',
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}>
        {/* Scroll progress */}
        {scrollPct > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            height: 2, background: '#131311',
            width: `${scrollPct}%`,
            transition: 'width 0.05s linear',
            zIndex: 1,
          }} />
        )}

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', flexShrink: 0, marginRight: compact ? 0 : 24 }}>
          <span style={{
            fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
            fontWeight: 700,
            fontSize: compact ? 15 : 16,
            color: '#131311',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}>
            {isMobile ? 'UL' : 'Understanding Linux'}
          </span>
        </Link>

        {/* Desktop: divider + nav */}
        {!compact && (
          <>
            <div style={{ width: 1, height: 20, background: '#d5cfc6', marginRight: 24 }} />
            <nav style={{ display: 'flex', gap: 0 }}>
              {NAV.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                  display: 'inline-flex', alignItems: 'center',
                  padding: '0 14px', height: 48,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10, fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#131311' : '#a09890',
                  textDecoration: 'none',
                  letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                  borderBottom: isActive ? '2px solid #131311' : '2px solid transparent',
                  transition: 'color 0.1s, border-color 0.1s',
                })}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Desktop: dot trail + progress */}
        {!compact && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 20 }}>
              {supermodules.map(sm => {
                const stats = getSupermoduleStats(sm.id, sm.moduleIds);
                const c = SUPERMODULE_COLORS[sm.id];
                return (
                  <Link key={sm.id} to={`/supermodule/${sm.slug}`} title={sm.title} style={{
                    width: 8, height: 8,
                    background: stats.percentComplete === 100 ? c.dot
                      : stats.percentComplete > 0 ? c.dot + '80'
                      : '#e5e0d8',
                    display: 'block', flexShrink: 0, textDecoration: 'none',
                  }} />
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 64, height: 2, background: '#e5e0d8' }}>
                <div style={{ height: '100%', width: `${overall.percentComplete}%`, background: '#131311', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#a09890', letterSpacing: '0.08em' }}>
                {overall.percentComplete}%
              </span>
            </div>
          </>
        )}

        {/* Tablet: icon nav */}
        {isTablet && !isMobile && (
          <nav style={{ display: 'flex', gap: 0 }}>
            {NAV.map(({ to, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 48,
                color: isActive ? '#131311' : '#a09890',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid #131311' : '2px solid transparent',
              })}>
                {({ isActive }) => <Icon size={15} color={isActive ? '#131311' : '#a09890'} />}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Mobile: hamburger */}
        {isMobile && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, padding: 0,
            }}
          >
            {menuOpen ? <X size={18} color="#131311" /> : <Menu size={18} color="#131311" />}
          </button>
        )}
      </header>

      {/* Mobile dropdown menu */}
      {isMobile && menuOpen && (
        <div style={{
          position: 'fixed', top: 48, left: 0, right: 0, zIndex: 49,
          background: '#faf7f2',
          borderBottom: '2px solid #131311',
        }}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              onClick={() => setMenuOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 24px',
                borderBottom: '1px solid #e5e0d8',
                textDecoration: 'none',
                fontFamily: '"Barlow Condensed", system-ui',
                fontSize: 20, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: isActive ? '#131311' : '#a09890',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} color={isActive ? '#131311' : '#a09890'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 2, background: '#e5e0d8' }}>
              <div style={{ height: '100%', width: `${overall.percentComplete}%`, background: '#131311' }} />
            </div>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#a09890' }}>
              {overall.percentComplete}% complete
            </span>
          </div>
        </div>
      )}
    </>
  );
}
