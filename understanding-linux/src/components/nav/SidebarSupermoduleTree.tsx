import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useCurriculum } from '../../hooks/useCurriculum';
import { useProgress } from '../../hooks/useProgress';
import { SUPERMODULE_COLORS } from '../../data/supermoduleColors';

export function SidebarSupermoduleTree() {
  const { supermodules } = useCurriculum();
  const { getSupermoduleStats } = useProgress();
  const { pathname } = useLocation();

  return (
    <div className="px-3 pb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-3 mb-2">
        Supermodules
      </p>
      {supermodules.map(sm => {
        const stats = getSupermoduleStats(sm.id, sm.moduleIds);
        const colors = SUPERMODULE_COLORS[sm.id];
        const isActive = pathname.includes(`/supermodule/${sm.slug}`);

        return (
          <Link
            key={sm.id}
            to={`/supermodule/${sm.slug}`}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors mb-0.5 group',
              isActive ? 'bg-white/8 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
            )}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.border.replace('border-l-', 'bg-')}`} />
            <span className="truncate flex-1">{sm.title}</span>
            {stats.percentComplete > 0 && (
              <span className="text-gray-600 group-hover:text-gray-400 shrink-0">
                {stats.percentComplete}%
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
