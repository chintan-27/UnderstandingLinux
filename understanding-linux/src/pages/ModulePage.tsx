import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useModuleContent } from '../hooks/useModuleContent';
import { LessonBody } from '../components/lesson/LessonBody';
import { LessonSidebar } from '../components/lesson/LessonSidebar';
import { Spinner } from '../components/ui/Spinner';
import { Breadcrumb } from '../components/nav/Breadcrumb';
import type { ModuleStatus, MasteryLevel } from '../types/progress';

export function ModulePage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const { getModuleBySlug, getSupermodule, getPreviousModule, getNextModule } = useCurriculum();
  const { getModuleProgress, setModuleStatus, setMasteryLevel, markVisited } = useProgress();
  const navigate = useNavigate();

  const module = getModuleBySlug(moduleSlug ?? '');
  const supermodule = module ? getSupermodule(module.supermoduleId) : undefined;
  const { markdown, frontmatter, loading, notFound } = useModuleContent(module?.contentPath);

  const progress = module ? getModuleProgress(module.id) : { status: 'not_started' as const };
  const prev = module ? getPreviousModule(module.id) : undefined;
  const next = module ? getNextModule(module.id) : undefined;

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
        <p style={{ color: '#6b6560' }}>Module not found.</p>
        <Link to="/curriculum" style={{ color: '#e85c2c', fontSize: 14 }}>← Curriculum</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px 40px', fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, display: 'grid', gap: 24, gridTemplateColumns: '1fr 280px' }}>

        {/* ── Left: lesson ── */}
        <div style={{ minWidth: 0 }}>
          <Breadcrumb crumbs={[
            { label: 'Curriculum', to: '/curriculum' },
            { label: supermodule.title, to: `/supermodule/${supermodule.slug}` },
            { label: `#${module.id}` },
          ]} />

          {/* Module header card */}
          <div style={{
            marginTop: 16, marginBottom: 22,
            background: '#ffffff', borderRadius: 24, padding: '26px 32px',
            boxShadow: '0 1px 4px rgba(0,0,0,.05)',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Gradient top accent */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: 'linear-gradient(90deg, #e85c2c, #e85c2c)',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20,
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5,
                background: '#fef2ee', color: '#c94a1e', fontWeight: 500,
              }}>
                Part {module.part}
              </span>
              <span style={{ fontSize: 12.5, color: '#7a7570' }}>{module.partTitle}</span>
            </div>

            <h1 style={{
              fontFamily: '"Plus Jakarta Sans", system-ui',
              fontSize: 'clamp(1.45rem, 3vw, 1.9rem)',
              fontWeight: 800, color: '#131311',
              lineHeight: 1.12, letterSpacing: '-0.035em', marginBottom: 16,
            }}>
              {module.title}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
              {frontmatter?.estimatedMinutes && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, color: '#7a7570',
                  padding: '4px 12px', borderRadius: 20, background: '#faf7f2',
                  fontWeight: 500,
                }}>
                  <Clock size={12} /> ~{frontmatter.estimatedMinutes} min
                </div>
              )}
              {module.topics.map(t => (
                <span key={t} style={{
                  fontSize: 11.5, borderRadius: 20, padding: '4px 12px',
                  background: '#faf7f2', color: '#6b6560',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Content card */}
          <div style={{
            background: '#ffffff', borderRadius: 24, padding: '32px 36px',
            boxShadow: '0 1px 4px rgba(0,0,0,.05)', minHeight: 300,
          }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
                <Spinner size="lg" />
              </div>
            )}

            {!loading && notFound && (
              <div style={{
                background: '#faf7f2', borderRadius: 16, padding: 32, textAlign: 'center',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: '#fef2ee', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <span style={{ fontSize: 22 }}>📝</span>
                </div>
                <p style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 17, fontWeight: 700, color: '#1e1a16', marginBottom: 8 }}>
                  Content coming soon
                </p>
                <p style={{ fontSize: 13, color: '#7a7570', marginBottom: 20 }}>This lesson will cover:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {module.topics.map(t => (
                    <span key={t} style={{
                      fontSize: 12.5, borderRadius: 20, padding: '6px 16px',
                      background: '#ffffff', color: '#3a3530',
                      boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!loading && markdown && <LessonBody markdown={markdown} />}
          </div>

          {/* Prev / Next nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 18 }}>
            {prev ? (
              <Link to={`/module/${prev.slug}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                flex: 1, padding: '14px 18px', borderRadius: 18,
                background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf7f2', flexShrink: 0 }}>
                  <ArrowLeft size={13} color="#6b6560" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: '#7a7570', fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Previous</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e1a16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prev.title}</div>
                </div>
              </Link>
            ) : <div style={{ flex: 1 }} />}

            {next ? (
              <Link to={`/module/${next.slug}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                flex: 1, justifyContent: 'flex-end', textAlign: 'right',
                padding: '14px 18px', borderRadius: 18,
                background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,.05)'}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: '#7a7570', fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Next</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e1a16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.title}</div>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2ee', flexShrink: 0 }}>
                  <ArrowRight size={13} color="#e85c2c" />
                </div>
              </Link>
            ) : <div style={{ flex: 1 }} />}
          </div>

          <p style={{ textAlign: 'center', marginTop: 10, fontSize: 10.5, color: '#c8c0b4', fontFamily: '"JetBrains Mono", monospace' }}>
            <kbd style={{ background: '#f0ece6', borderRadius: 5, padding: '2px 6px', marginRight: 3, border: '1px solid #e5e0d8' }}>p</kbd> prev ·
            <kbd style={{ background: '#f0ece6', borderRadius: 5, padding: '2px 6px', marginLeft: 3, marginRight: 3, border: '1px solid #e5e0d8' }}>n</kbd> next
          </p>
        </div>

        {/* ── Right: sidebar ── */}
        <div style={{ position: 'sticky', top: 28, alignSelf: 'start' }}>
          <LessonSidebar
            progress={progress}
            resources={frontmatter?.resources ?? []}
            onStatusChange={(s: ModuleStatus) => setModuleStatus(module.id, s)}
            onMasteryChange={(l: MasteryLevel) => setMasteryLevel(module.id, l)}
          />
        </div>
      </div>
    </div>
  );
}
