import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useProgress } from '../hooks/useProgress';
import { useCurriculum } from '../hooks/useCurriculum';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';

const PHASES = [
  { label: 'Foundations', ids: [1, 2, 3], color: '#7c6af5' },
  { label: 'Digital Systems', ids: [4, 5, 6], color: '#0ea5e9' },
  { label: 'Operating Systems', ids: [7, 8, 9], color: '#22c55e' },
  { label: 'Advanced Systems', ids: [10, 11, 12], color: '#f59e0b' },
];

const TICKER = [
  'Math', 'Physics', 'Circuits', 'Digital Logic', 'Architecture',
  'C / Toolchain', 'OS Concepts', 'Linux Userspace', 'Kernel',
  'Drivers', 'Networking', 'Performance & Security',
];

export function HomePage() {
  const { getOverallStats, getSupermoduleStats } = useProgress();
  const { supermodules, modules } = useCurriculum();
  const stats = getOverallStats();

  const nextSM = supermodules.find(sm => getSupermoduleStats(sm.id, sm.moduleIds).percentComplete < 100);

  // Build module→color map for the grid visualization
  const colorMap: Record<number, string> = {};
  supermodules.forEach(sm => {
    const c = SUPERMODULE_COLORS[sm.id];
    sm.moduleIds.forEach(id => { colorMap[id] = c.dot; });
  });

  const getSM = (id: number) => supermodules.find(sm => sm.id === id);

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ══════════════════════════════════════════
          DARK HERO — full width
      ══════════════════════════════════════════ */}
      <section style={{
        background: '#131311',
        minHeight: 'calc(100vh - 56px)',
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
        gap: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle bg texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        {/* Warm glow — left */}
        <div style={{ position: 'absolute', bottom: -100, left: -80, width: 500, height: 500, borderRadius: '50%', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(232,92,44,.08) 0%, transparent 65%)' }} />

        {/* ── Left: text ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '80px 72px', position: 'relative', zIndex: 1,
        }}>
          {/* Overline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div style={{ width: 28, height: 2, background: '#e85c2c', borderRadius: 2 }} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#e85c2c' }}>
              From first principles
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: '"Plus Jakarta Sans", system-ui',
            fontSize: 'clamp(3.5rem, 6.5vw, 6.5rem)',
            fontWeight: 800, color: '#faf7f2',
            lineHeight: 0.92, letterSpacing: '-0.055em',
            marginBottom: 36,
          }}>
            Under&shy;standing
            <br />
            <span style={{ color: '#e85c2c' }}>Linux.</span>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 16, color: 'rgba(250,247,242,.45)', lineHeight: 1.78, maxWidth: '36ch', marginBottom: 48 }}>
            A causal curriculum from mathematics and semiconductor physics through
            digital logic, the C toolchain, and the Linux kernel.
            215 modules, built in sequence.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 72 }}>
            <Link to="/curriculum" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 24px', borderRadius: 10,
              background: '#e85c2c', color: '#ffffff',
              fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
              transition: 'transform 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#d14e22'; el.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#e85c2c'; el.style.transform = ''; }}
            >
              Browse curriculum <ArrowRight size={15} />
            </Link>
            {nextSM && (
              <Link to={`/supermodule/${nextSM.slug}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '13px 20px', borderRadius: 10,
                background: 'rgba(250,247,242,.07)', color: 'rgba(250,247,242,.6)',
                fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
                border: '1px solid rgba(250,247,242,.10)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(250,247,242,.11)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(250,247,242,.07)'}
              >
                Continue
              </Link>
            )}
          </div>

          {/* Stat strip */}
          <div style={{ display: 'flex', gap: 40, paddingTop: 36, borderTop: '1px solid rgba(250,247,242,.08)' }}>
            {[
              { val: '215', label: 'Modules' },
              { val: '12', label: 'Supermodules' },
              { val: String(stats.completed), label: 'Completed', coral: stats.completed > 0 },
              { val: `${stats.percentComplete}%`, label: 'Progress', coral: stats.percentComplete > 0 },
            ].map(s => (
              <div key={s.label}>
                <div style={{
                  fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 28,
                  fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1,
                  color: s.coral ? '#e85c2c' : '#faf7f2',
                }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(250,247,242,.3)', marginTop: 6, fontWeight: 500, letterSpacing: '0.01em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: module grid ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 56px 60px 24px',
          borderLeft: '1px solid rgba(255,255,255,.04)',
          position: 'relative',
        }}>
          {/* Label */}
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,.2)', marginBottom: 18, alignSelf: 'flex-start',
          }}>
            215 modules
          </div>

          {/* Module grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(15, 1fr)',
            gap: 4,
            width: '100%',
          }}>
            {Array.from({ length: 215 }, (_, i) => i + 1).map(id => {
              const color = colorMap[id];
              const smId = modules.find(m => m.id === id)?.supermoduleId ?? 1;
              const smStats = getSupermoduleStats(smId, supermodules.find(s => s.id === smId)?.moduleIds ?? []);
              const done = smStats.percentComplete === 100;
              return (
                <div
                  key={id}
                  title={`Module ${id}`}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 3,
                    background: color || '#333',
                    opacity: done ? 0.9 : 0.25,
                    transition: 'opacity 0.2s',
                  }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20, justifyContent: 'flex-start', width: '100%' }}>
            {supermodules.slice(0, 6).map(sm => (
              <div key={sm.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 1.5, background: SUPERMODULE_COLORS[sm.id].dot }} />
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8.5, color: 'rgba(255,255,255,.2)' }}>
                  SM{sm.id}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          TICKER STRIP
      ══════════════════════════════════════════ */}
      <div style={{
        background: '#1e1b17', borderTop: '1px solid #2a2520',
        overflow: 'hidden', padding: '14px 0',
      }}>
        <div style={{
          display: 'flex', gap: 0,
          animation: 'marquee 36s linear infinite',
          width: 'max-content',
        }}>
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 20,
              fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
              color: 'rgba(250,247,242,.25)', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '0 20px', whiteSpace: 'nowrap',
            }}>
              {item}
              <span style={{ color: '#e85c2c', fontSize: 8 }}>◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          CURRICULUM PATH — warm cream
      ══════════════════════════════════════════ */}
      <section style={{ background: '#faf7f2', padding: '96px 72px 112px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 80 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 2, background: '#e85c2c', borderRadius: 2 }} />
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#e85c2c' }}>
                Study path
              </span>
            </div>
            <h2 style={{
              fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800,
              fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)', color: '#131311',
              letterSpacing: '-0.045em', lineHeight: 1,
            }}>
              12 Stages to Mastery
            </h2>
          </div>
          <Link to="/curriculum" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
            color: '#6b6560', textDecoration: 'none', fontWeight: 500,
            padding: '9px 18px', borderRadius: 20, background: '#ffffff',
            border: '1px solid #e5e0d8', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#131311'; el.style.borderColor = '#c8c0b4'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#6b6560'; el.style.borderColor = '#e5e0d8'; }}
          >
            All modules <ArrowRight size={12} />
          </Link>
        </div>

        {/* 4 phase columns in 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {PHASES.map(phase => (
            <div key={phase.label}>
              {/* Phase header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, paddingBottom: 16, borderBottom: `2px solid ${phase.color}28` }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${phase.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color }} />
                </div>
                <span style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 700, fontSize: 14, color: '#131311', letterSpacing: '-0.01em' }}>
                  {phase.label}
                </span>
              </div>

              {/* SM rows */}
              {phase.ids.map(smId => {
                const sm = getSM(smId);
                if (!sm) return null;
                const smStats = getSupermoduleStats(sm.id, sm.moduleIds);
                const c = SUPERMODULE_COLORS[sm.id];
                return (
                  <Link key={sm.id} to={`/supermodule/${sm.slug}`} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 16,
                    padding: '16px 16px', borderRadius: 12,
                    textDecoration: 'none', transition: 'all 0.15s',
                    marginBottom: 4,
                  }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#ffffff'; el.style.boxShadow = '0 2px 16px rgba(0,0,0,.06)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.boxShadow = 'none'; }}
                  >
                    {/* Number + dot */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 2 }}>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#a09890', width: 20 }}>
                        {String(sm.id).padStart(2, '0')}
                      </span>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.dot }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 14, fontWeight: 700, color: '#131311', letterSpacing: '-0.02em', marginBottom: 3 }}>
                        {sm.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#a09890', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sm.description}
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 3, background: '#e5e0d8', borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${smStats.percentComplete}%`, background: c.dot, borderRadius: 10, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: smStats.percentComplete > 0 ? '#6b6560' : '#c8c0b4' }}>
                          {smStats.completed}/{sm.moduleCount}
                        </span>
                      </div>
                    </div>

                    <ArrowUpRight size={14} color="#c8c0b4" style={{ flexShrink: 0, marginTop: 2 }} />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          DARK BOTTOM CTA
      ══════════════════════════════════════════ */}
      <section style={{
        background: '#131311', padding: '64px 72px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', pointerEvents: 'none', background: 'linear-gradient(270deg, rgba(232,92,44,.05) 0%, transparent 100%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800, fontSize: 26, color: '#faf7f2', letterSpacing: '-0.04em', marginBottom: 8 }}>
            Ready to start?
          </div>
          <p style={{ fontSize: 14, color: 'rgba(250,247,242,.35)', maxWidth: '40ch' }}>
            Start from module one and follow the causal chain all the way to the kernel.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, position: 'relative' }}>
          <Link to="/supermodule/math-for-physical-computing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '12px 22px', borderRadius: 10,
            background: '#e85c2c', color: '#fff',
            fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
            transition: 'transform 0.15s, background 0.15s',
          }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#d14e22'; el.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#e85c2c'; el.style.transform = ''; }}
          >
            Start Module 1 <ArrowRight size={14} />
          </Link>
          <Link to="/curriculum" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '12px 20px', borderRadius: 10,
            background: 'rgba(250,247,242,.07)', color: 'rgba(250,247,242,.6)',
            fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
            border: '1px solid rgba(250,247,242,.10)',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(250,247,242,.11)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(250,247,242,.07)'}
          >
            Browse all
          </Link>
        </div>
      </section>
    </div>
  );
}
