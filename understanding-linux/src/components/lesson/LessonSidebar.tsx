import { ModuleStatusControl } from '../module/ModuleStatusControl';
import { MasterySelector } from '../module/MasterySelector';
import { ResourceList } from './ResourceList';
import type { ModuleProgress, ModuleStatus, MasteryLevel } from '../../types/progress';
import type { Resource } from '../../types/content';

interface LessonSidebarProps {
  progress: ModuleProgress;
  resources: Resource[];
  onStatusChange: (s: ModuleStatus) => void;
  onMasteryChange: (l: MasteryLevel) => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7a7570', marginBottom: 10 }}>
      {children}
    </p>
  );
}

export function LessonSidebar({ progress, resources, onStatusChange, onMasteryChange }: LessonSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#ffffff', borderRadius: 20, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
        <SectionLabel>Status</SectionLabel>
        <ModuleStatusControl status={progress.status} onChange={onStatusChange} layout="stack" />
        {progress.status === 'completed' && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f3f6' }}>
            <MasterySelector level={progress.masteryLevel} onChange={onMasteryChange} />
          </div>
        )}
      </div>
      {resources.length > 0 && (
        <div style={{ background: '#ffffff', borderRadius: 20, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <SectionLabel>Resources</SectionLabel>
          <ResourceList resources={resources} />
        </div>
      )}
    </div>
  );
}
