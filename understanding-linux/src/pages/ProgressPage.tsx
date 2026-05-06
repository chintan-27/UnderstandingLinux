import { useRef, useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { SupermoduleProgressRow } from '../components/progress/SupermoduleProgressRow';
import { CompletionHeatmap } from '../components/progress/CompletionHeatmap';

function useCountUp(target: number, duration = 1000): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    const start = performance.now();
    const id = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(eased * target));
      if (t < 1) requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return current;
}

export function ProgressPage() {
  const { supermodules, modules, getModule } = useCurriculum();
  const {
    getOverallStats, getSupermoduleStats, getModuleProgress,
    getStudyStreak, getHeatmapData, getRecentCompletions,
    resetAll, exportJSON, importJSON,
  } = useProgress();

  const { isMobile, isTablet } = useBreakpoint();
  const importRef = useRef<HTMLInputElement>(null);
  const overall = getOverallStats();
  const px = isMobile ? '16px' : isTablet ? '28px' : '48px';
  const streak = getStudyStreak();
  const heatmapData = getHeatmapData(12);
  const recentCompletions = getRecentCompletions(5);
  const animatedPercent = useCountUp(overall.percentComplete);

  const nextModule = useMemo(
    () => modules.slice().sort((a, b) => a.id - b.id).find(m => getModuleProgress(m.id).status === 'not_started'),
    [modules, getModuleProgress],
  );

  const handleExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `understandinglinux-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (!importJSON(String(ev.target?.result ?? ''))) alert('Invalid file.'); };
    reader.readAsText(file);
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();

  return (
    <div style={{ fontFamily: '"Inter", system-ui, sans-serif', background: '#faf7f2', minHeight: '100vh' }}>

      {/* ── NEWSPAPER MASTHEAD ── */}
      <div style={{ borderBottom: '3px solid #131311', padding: `0 ${px}` }}>
        {/* Top utility bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #d5cfc6',
          padding: '8px 0',
        }}>
          <span style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: '#a09890',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {today}
          </span>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { label: 'Export', icon: <Download size={9} />, fn: handleExport },
              { label: 'Import', icon: <Upload size={9} />, fn: () => importRef.current?.click() },
              { label: 'Reset', icon: <RotateCcw size={9} />, fn: () => { if (confirm('Reset all progress?')) resetAll(); } },
            ].map(b => (
              <button key={b.label} onClick={b.fn} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9, color: '#a09890',
                background: 'none', border: 'none', cursor: 'pointer',
                letterSpacing: '0.08em', textTransform: 'uppercase', padding: 0,
              }}>
                {b.icon} {b.label}
              </button>
            ))}
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </div>
        </div>

        {/* Big headline */}
        <div style={{ padding: '20px 0 16px' }}>
          <h1 style={{
            fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
            fontWeight: 700,
            fontSize: isMobile ? 52 : isTablet ? 68 : 88,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            lineHeight: 0.88,
            color: '#131311',
            margin: 0,
          }}>
            Progress
            <br />
            Report
          </h1>
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        borderBottom: '1px solid #131311',
        padding: `0 ${px}`,
      }}>
        {([
          [overall.total, 'Total Modules', '#131311'],
          [overall.completed, 'Completed', '#131311'],
          [overall.inProgress, 'In Progress', '#131311'],
          [overall.notStarted, 'Not Started', '#a09890'],
        ] as [number, string, string][]).map(([val, label, col], i) => (
          <div key={label} style={{
            padding: '20px 24px 20px 0',
            borderLeft: i > 0 ? '1px solid #d5cfc6' : 'none',
            paddingLeft: i > 0 ? 24 : 0,
          }}>
            <div style={{
              fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1,
              color: col,
              letterSpacing: '-0.02em',
            }}>
              {val}
            </div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginTop: 4,
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ padding: `0 ${px}` }}>

        {/* ── TWO COLUMN: COMPLETION + UP NEXT ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 0,
          borderBottom: '1px solid #d5cfc6',
        }}>
          {/* Completion column */}
          <div style={{ padding: '28px 32px 28px 0', borderRight: '1px solid #d5cfc6' }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 16,
            }}>
              Overall Completion
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
                fontSize: 96,
                fontWeight: 700,
                lineHeight: 1,
                color: '#131311',
                letterSpacing: '-0.03em',
              }}>
                {animatedPercent}
              </span>
              <span style={{
                fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
                fontSize: 40,
                fontWeight: 600,
                color: '#a09890',
              }}>
                %
              </span>
            </div>
            {/* Thin progress track */}
            <div style={{ height: 2, background: '#e5e0d8', marginTop: 20, position: 'relative' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overall.percentComplete}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: '#131311' }}
              />
            </div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              marginTop: 8,
              letterSpacing: '0.06em',
            }}>
              {overall.completed} / {overall.total} MODULES DONE
            </div>
          </div>

          {/* Up next column */}
          <div style={{ padding: '28px 0 28px 32px' }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 16,
            }}>
              Up Next
            </div>
            {nextModule ? (
              <div>
                <div style={{
                  fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
                  fontSize: 28,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#131311',
                  letterSpacing: '0.01em',
                  lineHeight: 1.1,
                  marginBottom: 8,
                }}>
                  #{nextModule.id} — {nextModule.title}
                </div>
                <div style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9,
                  color: '#a09890',
                  letterSpacing: '0.06em',
                  marginBottom: 20,
                }}>
                  {nextModule.topics.slice(0, 4).join(' · ')}
                </div>
                <Link to={`/module/${nextModule.slug}`} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#131311',
                  color: '#faf7f2',
                  padding: '10px 20px',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  fontWeight: 600,
                  textDecoration: 'none',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  Begin Study →
                </Link>
              </div>
            ) : (
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#a09890' }}>
                All modules complete.
              </div>
            )}
          </div>
        </div>

        {/* ── THREE COLUMN: STREAK + HEATMAP + RECENT ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '160px 1fr 220px',
          gap: 0,
          borderBottom: '1px solid #d5cfc6',
        }}>
          {/* Streak */}
          <div style={{ padding: '24px 24px 24px 0', borderRight: '1px solid #d5cfc6' }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
            }}>
              Streak
            </div>
            {streak.currentStreak > 0 ? (
              <>
                <div style={{
                  fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui',
                  fontSize: 64,
                  fontWeight: 700,
                  color: '#e85c2c',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}>
                  {streak.currentStreak}
                </div>
                <div style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9,
                  color: '#a09890',
                  marginTop: 4,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  Day{streak.currentStreak !== 1 ? 's' : ''} in a row
                </div>
              </>
            ) : streak.lastStudiedDaysAgo >= 0 ? (
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#a09890', lineHeight: 1.8 }}>
                Last studied<br />
                <span style={{ color: '#131311' }}>
                  {streak.lastStudiedDaysAgo === 0 ? 'today' : streak.lastStudiedDaysAgo === 1 ? 'yesterday' : `${streak.lastStudiedDaysAgo}d ago`}
                </span>
              </div>
            ) : (
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#c8c0b4', lineHeight: 1.6 }}>
                No activity<br />yet
              </div>
            )}
          </div>

          {/* Heatmap */}
          <div style={{ padding: '24px 24px', borderRight: '1px solid #d5cfc6' }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
            }}>
              Activity — 12 Weeks
            </div>
            <CompletionHeatmap data={heatmapData} />
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8, marginLeft: 20 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#a09890' }}>less</span>
              {['#ede8e1', '#c8bfb4', '#8a7f74', '#4a4038', '#1e1a16'].map(c => (
                <div key={c} style={{ width: 10, height: 8, background: c }} />
              ))}
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#a09890' }}>more</span>
            </div>
          </div>

          {/* Recent completions */}
          <div style={{ padding: '24px 0 24px 24px' }}>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: '#a09890',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
            }}>
              Recent
            </div>
            {recentCompletions.length === 0 ? (
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#c8c0b4', lineHeight: 1.8 }}>
                No completions<br />yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentCompletions.map(rc => {
                  const mod = getModule(rc.moduleId);
                  if (!mod) return null;
                  const date = new Date(rc.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <div key={rc.moduleId} style={{ borderBottom: '1px solid #f0ece6', padding: '7px 0' }}>
                      <Link to={`/module/${mod.slug}`} style={{
                        display: 'block',
                        fontFamily: '"Inter", system-ui',
                        fontSize: 12,
                        color: '#131311',
                        textDecoration: 'none',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}>
                        {mod.title}
                      </Link>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#a09890' }}>
                        #{mod.id} · {date}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── BY SUPERMODULE ── */}
        <div style={{ padding: '24px 0 80px' }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: '#a09890',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 4,
            paddingBottom: 12,
            borderBottom: '1px solid #d5cfc6',
          }}>
            By Supermodule
          </div>
          {supermodules.map((sm, i) => (
            <SupermoduleProgressRow
              key={sm.id}
              supermodule={sm}
              stats={getSupermoduleStats(sm.id, sm.moduleIds)}
              getModuleProgress={getModuleProgress}
              getModule={getModule}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
