import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useModuleContent } from '../hooks/useModuleContent';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { LessonBody } from '../components/lesson/LessonBody';
import { LessonSidebar } from '../components/lesson/LessonSidebar';
import { Spinner } from '../components/ui/Spinner';
import { SUPERMODULE_COLORS } from '../data/supermoduleColors';
import type { ModuleStatus, MasteryLevel } from '../types/progress';

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", monospace' };
const COND: React.CSSProperties = { fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui' };

export function ModulePage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const { getModuleBySlug, getSupermodule, getPreviousModule, getNextModule } = useCurriculum();
  const { getModuleProgress, setModuleStatus, setMasteryLevel, markVisited } = useProgress();
  const { isMobile, isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const module = getModuleBySlug(moduleSlug ?? '');
  const supermodule = module ? getSupermodule(module.supermoduleId) : undefined;
  const { markdown, frontmatter, loading, notFound } = useModuleContent(module?.contentPath);

  const progress = module ? getModuleProgress(module.id) : { status: 'not_started' as const };
  const prev = module ? getPreviousModule(module.id) : undefined;
  const next = module ? getNextModule(module.id) : undefined;
  const c = supermodule ? SUPERMODULE_COLORS[supermodule.id] : undefined;
  const compact = isMobile || isTablet;

  useEffect(() => { if (module) markVisited(module.id); }, [module?.id]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' && next) navigate(`/module/${next.slug}`);
      if (e.key === 'p' && prev) navigate(`/module/${prev.slug}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next?.slug, prev?.slug]);

  if (!module || !supermodule) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ ...MONO, fontSize: 11, color: '#a09890' }}>Module not found.</p>
        <Link to="/curriculum" style={{ ...MONO, fontSize: 11, color: '#131311', textDecoration: 'none' }}>← Curriculum</Link>
      </div>
    );
  }

  const px = isMobile ? '16px' : isTablet ? '28px' : '48px';

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: '3px solid #131311' }}>
        {/* Breadcrumb + topics bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `10px ${px}`, borderBottom: '1px solid #d5cfc6', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/curriculum" style={{ ...MONO, fontSize: 9, color: '#a09890', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Curriculum</Link>
            <span style={{ ...MONO, fontSize: 9, color: '#d5cfc6' }}>›</span>
            {!isMobile && (
              <>
                <Link to={`/supermodule/${supermodule.slug}`} style={{ ...MONO, fontSize: 9, color: '#a09890', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {supermodule.title}
                </Link>
                <span style={{ ...MONO, fontSize: 9, color: '#d5cfc6' }}>›</span>
              </>
            )}
            <span style={{ ...MONO, fontSize: 9, color: '#6b6560', letterSpacing: '0.08em', textTransform: 'uppercase' }}>#{module.id}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isMobile && module.topics.slice(0, 3).map(t => (
              <span key={t} style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t}</span>
            ))}
            {/* Mobile: inline status toggle */}
            {compact && (
              <button onClick={() => setSidebarOpen(o => !o)} style={{
                ...MONO, fontSize: 9, color: '#a09890', background: 'none', border: '1px solid #d5cfc6',
                padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Status ↓
              </button>
            )}
          </div>
        </div>

        {/* Mobile sidebar panel */}
        {compact && sidebarOpen && (
          <div style={{ padding: `16px ${px}`, borderBottom: '1px solid #d5cfc6', background: '#f8f5f0' }}>
            <LessonSidebar
              progress={progress}
              resources={frontmatter?.resources ?? []}
              onStatusChange={(s: ModuleStatus) => { setModuleStatus(module.id, s); setSidebarOpen(false); }}
              onMasteryChange={(l: MasteryLevel) => setMasteryLevel(module.id, l)}
            />
          </div>
        )}

        {/* Title area */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : '100px 1fr',
          padding: compact ? `20px ${px}` : '0 0 0 48px',
        }}>
          {!compact && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #d5cfc6', padding: '24px 0' }}>
              <div style={{ textAlign: 'center' }}>
                {c && <div style={{ width: 8, height: 8, background: c.dot, margin: '0 auto 8px' }} />}
                <div style={{ ...COND, fontSize: 44, fontWeight: 700, color: '#d5cfc6', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {String(module.id).padStart(3, '0')}
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: compact ? '0' : '24px 36px 20px' }}>
            {compact && c && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, background: c.dot }} />
                <span style={{ ...MONO, fontSize: 9, color: '#a09890' }}>#{module.id}</span>
              </div>
            )}
            <h1 style={{
              ...COND, fontWeight: 700,
              fontSize: isMobile ? 28 : isTablet ? 36 : 'clamp(28px, 3.5vw, 48px)',
              textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1,
              color: '#131311', margin: 0,
            }}>
              {module.title}
            </h1>
            {frontmatter?.estimatedMinutes && (
              <div style={{ ...MONO, fontSize: 9, color: '#a09890', marginTop: 10, letterSpacing: '0.08em' }}>
                ~{frontmatter.estimatedMinutes} MIN READ
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column layout (desktop) / single (mobile) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr 220px',
        alignItems: 'start',
      }}>
        {/* Content */}
        <div style={{
          borderRight: compact ? 'none' : '1px solid #d5cfc6',
          padding: isMobile ? '32px 16px 60px' : isTablet ? '40px 28px 60px' : '48px 56px 80px',
        }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <Spinner size="lg" />
            </div>
          )}

          {!loading && notFound && (
            <div style={{ padding: '32px 0' }}>
              <div style={{ ...MONO, fontSize: 10, color: '#a09890', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                Content coming soon
              </div>
              <div style={{ ...COND, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', color: '#131311', marginBottom: 14 }}>
                This lesson covers:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {module.topics.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f0ece6', padding: '8px 0' }}>
                    <span style={{ width: 4, height: 4, background: '#d5cfc6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#6b6560' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && markdown && <LessonBody markdown={markdown} />}

          {/* Prev / Next */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 48, borderTop: '1px solid #d5cfc6', paddingTop: 20 }}>
            {prev ? (
              <Link to={`/module/${prev.slug}`} style={{ display: 'block', textDecoration: 'none', padding: '14px 14px 14px 0', borderRight: '1px solid #e5e0d8', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f5f2ec'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>← Prev</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#131311', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prev.title}</div>
              </Link>
            ) : <div />}
            {next ? (
              <Link to={`/module/${next.slug}`} style={{ display: 'block', textDecoration: 'none', padding: '14px 0 14px 14px', textAlign: 'right', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f5f2ec'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ ...MONO, fontSize: 9, color: '#a09890', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Next →</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#131311', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.title}</div>
              </Link>
            ) : <div />}
          </div>
          <div style={{ ...MONO, fontSize: 9, color: '#c8c0b4', textAlign: 'center', marginTop: 10, letterSpacing: '0.06em' }}>
            <kbd style={{ background: '#f0ece6', padding: '2px 5px', border: '1px solid #e5e0d8', fontSize: 9 }}>p</kbd> prev ·
            <kbd style={{ background: '#f0ece6', padding: '2px 5px', border: '1px solid #e5e0d8', fontSize: 9, marginLeft: 4 }}>n</kbd> next
          </div>
        </div>

        {/* Desktop sidebar */}
        {!compact && (
          <div style={{ padding: '28px 20px', position: 'sticky', top: 48, alignSelf: 'start' }}>
            <LessonSidebar
              progress={progress}
              resources={frontmatter?.resources ?? []}
              onStatusChange={(s: ModuleStatus) => setModuleStatus(module.id, s)}
              onMasteryChange={(l: MasteryLevel) => setMasteryLevel(module.id, l)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
