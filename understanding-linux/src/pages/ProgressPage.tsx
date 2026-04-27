import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload, RotateCcw, ArrowRight, TrendingUp } from 'lucide-react';
import { useCurriculum } from '../hooks/useCurriculum';
import { useProgress } from '../hooks/useProgress';
import { SupermoduleProgressRow } from '../components/progress/SupermoduleProgressRow';
import { ProgressBar } from '../components/ui/ProgressBar';

export function ProgressPage() {
  const { supermodules, modules } = useCurriculum();
  const { getOverallStats, getSupermoduleStats, getModuleProgress, resetAll, exportJSON, importJSON } = useProgress();
  const importRef = useRef<HTMLInputElement>(null);
  const overall = getOverallStats();

  const nextModule = modules.slice().sort((a, b) => a.id - b.id).find(m => getModuleProgress(m.id).status === 'not_started');

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `understanding-linux-progress-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (!importJSON(String(ev.target?.result ?? ''))) alert('Invalid progress file.'); };
    reader.readAsText(file);
  };
  const handleReset = () => { if (confirm('Reset all progress? This cannot be undone.')) resetAll(); };

  const pillBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 20,
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: '"Inter", system-ui',
    background: '#ffffff', color: '#3a3530',
    boxShadow: '0 1px 4px rgba(0,0,0,.05)', border: 'none',
  };

  return (
    <div style={{ padding: '28px 32px 40px', maxWidth: 920, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontWeight: 800, fontSize: 26, color: '#131311', letterSpacing: '-0.04em' }}>
            Your Progress
          </h1>
          <p style={{ color: '#7a7570', marginTop: 4, fontSize: 13.5 }}>Tracked locally in your browser — no account needed.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={pillBtn} onClick={handleExport}><Download size={12} /> Export</button>
          <button style={pillBtn} onClick={() => importRef.current?.click()}><Upload size={12} /> Import</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          <button style={{ ...pillBtn, background: 'transparent', boxShadow: 'none', color: '#7a7570' }} onClick={handleReset}>
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Bento stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 14, marginBottom: 18 }}>
        {[
          { label: 'Completed', value: overall.completed, color: '#10b981', bg: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)' },
          { label: 'In Progress', value: overall.inProgress, color: '#f59e0b', bg: 'linear-gradient(135deg, #fffbeb, #fef3c7)' },
          { label: 'Not Started', value: overall.notStarted, color: '#7a7570', bg: '#ffffff' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, borderRadius: 20, padding: '22px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,.05)', textAlign: 'center',
          }}>
            <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.04em' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: '#7a7570', marginTop: 6, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
        {/* Overall progress card */}
        <div style={{ background: '#ffffff', borderRadius: 20, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232,92,44,.06) 0%, transparent 70%)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#7a7570', marginBottom: 4, fontWeight: 500 }}>Overall completion</div>
              <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 32, fontWeight: 800, color: '#e85c2c', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {overall.percentComplete}<span style={{ fontSize: 16, color: '#7a7570', fontWeight: 500 }}>%</span>
              </div>
            </div>
            <TrendingUp size={18} color="#f5c4b0" />
          </div>
          <ProgressBar value={overall.percentComplete} size="md" />
          <div style={{ fontSize: 11.5, color: '#7a7570', marginTop: 8 }}>{overall.completed} of {overall.total} modules</div>
        </div>
      </div>

      {/* Up next */}
      {nextModule && (
        <div style={{
          background: 'linear-gradient(135deg, #fef2ee 0%, #f0ebff 100%)',
          borderRadius: 20, padding: '20px 24px', marginBottom: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232,92,44,.15) 0%, transparent 70%)',
          }} />
          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, color: '#e85c2c', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, fontFamily: '"JetBrains Mono", monospace' }}>
              Up next
            </p>
            <p style={{ fontWeight: 700, color: '#131311', fontSize: 14.5, fontFamily: '"Plus Jakarta Sans", system-ui' }}>#{nextModule.id} · {nextModule.title}</p>
            <p style={{ fontSize: 12, color: '#6b6560', marginTop: 3 }}>{nextModule.topics.slice(0, 3).join(', ')}</p>
          </div>
          <Link to={`/module/${nextModule.slug}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #e85c2c, #e85c2c)',
            color: '#fff', padding: '10px 20px',
            borderRadius: 12, fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(232,92,44,.25)',
          }}>
            Start <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Mastery breakdown */}
      {overall.completed > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          {[
            { label: 'Architectural', count: overall.masteryLevel1, color: '#3b82f6', bg: '#eff6ff' },
            { label: 'Operational', count: overall.masteryLevel2, color: '#e85c2c', bg: '#f5f3ff' },
            { label: 'Implementer', count: overall.masteryLevel3, color: '#ec4899', bg: '#fdf2f8' },
          ].map(l => (
            <div key={l.label} style={{ background: l.bg, borderRadius: 20, padding: '22px 24px', textAlign: 'center' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, margin: '0 auto 12px' }} />
              <div style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 28, fontWeight: 800, color: l.color }}>{l.count}</div>
              <div style={{ fontSize: 12, color: '#7a7570', marginTop: 5, fontWeight: 500 }}>{l.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-supermodule */}
      <div>
        <h2 style={{ fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 17, fontWeight: 700, color: '#131311', marginBottom: 12, letterSpacing: '-0.02em' }}>
          By Supermodule
        </h2>
        <div style={{ background: '#ffffff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          {supermodules.map((sm, i) => (
            <div key={sm.id} style={{ borderBottom: i < supermodules.length - 1 ? '1px solid #f0ece6' : 'none' }}>
              <SupermoduleProgressRow supermodule={sm} stats={getSupermoduleStats(sm.id, sm.moduleIds)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
