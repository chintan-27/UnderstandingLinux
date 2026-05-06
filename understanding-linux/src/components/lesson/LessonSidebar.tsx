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
    <p style={{
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 9,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#a09890',
      marginBottom: 12,
    }}>
      {children}
    </p>
  );
}

export function LessonSidebar({ progress, resources, onStatusChange, onMasteryChange }: LessonSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ borderBottom: '1px solid #d5cfc6', paddingBottom: 20, marginBottom: 20 }}>
        <SectionLabel>Status</SectionLabel>
        <ModuleStatusControl status={progress.status} onChange={onStatusChange} layout="stack" />
        {progress.status === 'completed' && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e0d8' }}>
            <MasterySelector level={progress.masteryLevel} onChange={onMasteryChange} />
          </div>
        )}
      </div>

      {resources.length > 0 && (
        <div>
          <SectionLabel>Resources</SectionLabel>
          <ResourceList resources={resources} />
        </div>
      )}
    </div>
  );
}
