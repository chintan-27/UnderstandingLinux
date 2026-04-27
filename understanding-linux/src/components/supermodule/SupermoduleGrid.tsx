import { SupermoduleCard } from './SupermoduleCard';
import { useCurriculum } from '../../hooks/useCurriculum';
import { useProgress } from '../../hooks/useProgress';

export function SupermoduleGrid() {
  const { supermodules } = useCurriculum();
  const { getSupermoduleStats } = useProgress();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {supermodules.map(sm => (
        <SupermoduleCard
          key={sm.id}
          supermodule={sm}
          stats={getSupermoduleStats(sm.id, sm.moduleIds)}
        />
      ))}
    </div>
  );
}
