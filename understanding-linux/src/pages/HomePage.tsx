import { Link } from 'react-router-dom';
import { useProgress } from '../hooks/useProgress';
import { useCurriculum } from '../hooks/useCurriculum';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';

const TICKER = [
  'Math', 'Physics', 'Circuits', 'Digital Logic', 'Architecture',
  'C / Toolchain', 'OS Concepts', 'Linux Userspace', 'Kernel',
  'Drivers', 'Networking', 'Performance & Security',
];

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };
const COND: React.CSSProperties = { fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui' };

export function HomePage() {
  const { getOverallStats, getSupermoduleStats } = useProgress();
  const { supermodules } = useCurriculum();
  const { isMobile, isTablet } = useBreakpoint();
  const stats = getOverallStats();
  const nextSM = supermodules.find(sm => getSupermoduleStats(sm.id, sm.moduleIds).percentComplete < 100);
  const compact = isMobile || isTablet;

  const px = isMobile ? '20px' : isTablet ? '32px' : '56px';

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif', background: '#faf7f2' }}>

      {/* ── MASTHEAD HERO ── */}
      <section style={{ padding: `48px ${px} 0`, borderBottom: '3px solid #131311' }}>
        {/* Top info bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap',
          justifyContent: 'space-between', alignItems: 'baseline',
          paddingBottom: 10, borderBottom: '1px solid #d5cfc6', marginBottom: 20,
          gap: 8,
        }}>
          <span style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            A Self-Directed Linux Curriculum
          </span>
          {!isMobile && (
            <span style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.08em' }}>
              215 Modules · 12 Supermodules · From First Principles
            </span>
          )}
        </div>

        {/* Headline + right column */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : '1fr 340px',
          gap: compact ? 32 : 48,
        }}>
          {/* Headline */}
          <div style={{ paddingBottom: compact ? 32 : 48 }}>
            <h1 style={{
              ...COND, fontWeight: 700,
              fontSize: isMobile ? 72 : isTablet ? 88 : 'clamp(72px, 10vw, 120px)',
              textTransform: 'uppercase',
              letterSpacing: '-0.03em', lineHeight: 0.88,
              color: '#131311', margin: '0 0 28px',
            }}>
              Under&shy;standing
              <br />Linux
            </h1>
            <p style={{ fontSize: 14, color: '#6b6560', lineHeight: 1.75, maxWidth: '44ch', marginBottom: 28 }}>
              A causal curriculum from mathematics and semiconductor physics
              through digital logic, the C toolchain, and the Linux kernel.
              Built in sequence.
            </p>
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
              <Link to="/curriculum" style={{
                ...MONO, display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 20px', background: '#131311', color: '#faf7f2',
                fontSize: 10, fontWeight: 600, textDecoration: 'none',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                Browse Curriculum →
              </Link>
              {nextSM && (
                <Link to={`/supermodule/${nextSM.slug}`} style={{
                  ...MONO, display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 20px', background: 'transparent', color: '#6b6560',
                  fontSize: 10, textDecoration: 'none',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  border: '1px solid #d5cfc6', marginLeft: -1,
                }}>
                  Continue →
                </Link>
              )}
            </div>
          </div>

          {/* Right: stats + SM list (hidden on mobile) */}
          {!isMobile && (
            <div style={{ borderLeft: '1px solid #d5cfc6', paddingLeft: 32, paddingBottom: 40 }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                  Your Progress
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {[
                    [stats.completed, 'Done'],
                    [stats.inProgress, 'Active'],
                    [stats.notStarted, 'Pending'],
                    [`${stats.percentComplete}%`, 'Complete'],
                  ].map(([val, label], i) => (
                    <div key={String(label)} style={{
                      padding: '10px 0',
                      borderTop: i < 2 ? 'none' : '1px solid #e5e0d8',
                      borderLeft: i % 2 === 1 ? '1px solid #e5e0d8' : 'none',
                      paddingLeft: i % 2 === 1 ? 14 : 0,
                    }}>
                      <div style={{ ...COND, fontSize: 28, fontWeight: 700, color: '#131311', lineHeight: 1, letterSpacing: '-0.02em' }}>{val}</div>
                      <div style={{ ...MONO, fontSize: 9, color: '#a09890', marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 2, background: '#e5e0d8', marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${stats.percentComplete}%`, background: '#131311' }} />
                </div>
              </div>
              <div style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                Supermodules
              </div>
              {supermodules.slice(0, 8).map((sm, i) => {
                const c = SUPERMODULE_COLORS[sm.id];
                const smStats = getSupermoduleStats(sm.id, sm.moduleIds);
                return (
                  <div key={sm.id} style={{ borderTop: i === 0 ? '1px solid #d5cfc6' : 'none' }}>
                    <Link to={`/supermodule/${sm.slug}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 0', borderBottom: '1px solid #f0ece6', textDecoration: 'none',
                    }}>
                      <span style={{ width: 6, height: 6, background: c.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#131311', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sm.title}</span>
                      <span style={{ ...MONO, fontSize: 9, color: '#a09890', flexShrink: 0 }}>{smStats.completed}/{sm.moduleCount}</span>
                    </Link>
                  </div>
                );
              })}
              <Link to="/curriculum" style={{ ...MONO, fontSize: 9, color: '#a09890', textDecoration: 'none', display: 'block', paddingTop: 8 }}>
                + {supermodules.length - 8} more →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── TICKER ── */}
      <div style={{ background: '#131311', overflow: 'hidden', padding: '10px 0' }}>
        <div style={{ display: 'flex', animation: 'marquee 40s linear infinite', width: 'max-content' }}>
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 16,
              ...MONO, fontSize: 9, color: 'rgba(250,247,242,.25)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '0 16px', whiteSpace: 'nowrap',
            }}>
              {item}
              <span style={{ color: 'rgba(250,247,242,.15)', fontSize: 7 }}>◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── CURRICULUM OVERVIEW ── */}
      <section style={{ padding: `48px ${px} 72px` }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          paddingBottom: 14, borderBottom: '2px solid #131311', marginBottom: 0,
        }}>
          <h2 style={{ ...COND, fontWeight: 700, fontSize: isMobile ? 28 : 40, textTransform: 'uppercase', letterSpacing: '-0.01em', color: '#131311', margin: 0 }}>
            The 12 Supermodules
          </h2>
          <Link to="/curriculum" style={{ ...MONO, fontSize: 9, color: '#a09890', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Full Map →
          </Link>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        }}>
          {supermodules.map((sm, i) => {
            const c = SUPERMODULE_COLORS[sm.id];
            const smStats = getSupermoduleStats(sm.id, sm.moduleIds);
            const col = isMobile ? 0 : isTablet ? i % 2 : i % 3;
            return (
              <Link key={sm.id} to={`/supermodule/${sm.slug}`} style={{
                display: 'block', padding: '20px 20px 20px 0',
                paddingLeft: col > 0 ? 20 : 0,
                borderTop: '1px solid #d5cfc6',
                borderLeft: col > 0 ? '1px solid #d5cfc6' : 'none',
                textDecoration: 'none', transition: 'background 0.1s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f5f2ec'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, background: c.dot, flexShrink: 0 }} />
                  <span style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.08em', textTransform: 'uppercase' }}>SM {String(sm.id).padStart(2, '0')}</span>
                </div>
                <div style={{ ...COND, fontSize: 18, fontWeight: 700, textTransform: 'uppercase', color: '#131311', letterSpacing: '0.01em', lineHeight: 1.1, marginBottom: 6 }}>
                  {sm.title}
                </div>
                <p style={{ fontSize: 12, color: '#6b6560', lineHeight: 1.6, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {sm.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 2, background: '#e5e0d8' }}>
                    <div style={{ height: '100%', width: `${smStats.percentComplete}%`, background: c.dot }} />
                  </div>
                  <span style={{ ...MONO, fontSize: 9, color: '#a09890' }}>{smStats.completed}/{sm.moduleCount}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{
        borderTop: '3px solid #131311',
        padding: `32px ${px}`,
        display: 'flex', flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'flex-start' : 'center',
        justifyContent: 'space-between', gap: 24,
        background: '#131311',
      }}>
        <div>
          <div style={{ ...COND, fontSize: compact ? 28 : 36, fontWeight: 700, textTransform: 'uppercase', color: '#faf7f2', letterSpacing: '-0.01em', lineHeight: 1, marginBottom: 8 }}>
            Begin from Module 1
          </div>
          <p style={{ ...MONO, fontSize: 9, color: 'rgba(250,247,242,.35)', letterSpacing: '0.06em' }}>
            Math → Physics → Circuits → Logic → Architecture → C → OS → Kernel
          </p>
        </div>
        <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
          <Link to="/supermodule/math-for-physical-computing" style={{
            ...MONO, display: 'inline-flex', alignItems: 'center',
            padding: '12px 20px', background: '#faf7f2', color: '#131311',
            fontSize: 10, fontWeight: 600, textDecoration: 'none',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Start →
          </Link>
          <Link to="/curriculum" style={{
            ...MONO, display: 'inline-flex', alignItems: 'center',
            padding: '12px 20px', background: 'transparent', color: 'rgba(250,247,242,.4)',
            fontSize: 10, textDecoration: 'none',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            border: '1px solid rgba(250,247,242,.15)', marginLeft: -1,
          }}>
            Browse All
          </Link>
        </div>
      </section>
    </div>
  );
}
