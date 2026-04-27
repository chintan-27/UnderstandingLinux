import { Clock } from 'lucide-react';
import { Breadcrumb } from '../nav/Breadcrumb';
import type { Module } from '../../types/curriculum';
import type { Supermodule } from '../../types/curriculum';

interface LessonHeaderProps {
  module: Module;
  supermodule: Supermodule;
  estimatedMinutes?: number;
}

export function LessonHeader({ module, supermodule, estimatedMinutes }: LessonHeaderProps) {
  return (
    <div className="mb-8">
      <Breadcrumb
        crumbs={[
          { label: 'Curriculum', to: '/curriculum' },
          { label: supermodule.title, to: `/supermodule/${supermodule.slug}` },
          { label: `Module ${module.id}` },
        ]}
      />

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-mono text-surface-400 bg-surface-100 px-2 py-1 rounded-md">
          Part {module.part}
        </span>
        <span className="text-xs text-surface-400">{module.partTitle}</span>
      </div>

      <h1 className="text-3xl font-black text-surface-900 mt-3 leading-tight">{module.title}</h1>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {estimatedMinutes && (
          <div className="flex items-center gap-1.5 text-xs text-surface-400">
            <Clock size={12} />
            ~{estimatedMinutes} min read
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {module.topics.map(topic => (
            <span
              key={topic}
              className="text-xs bg-surface-100 text-surface-500 rounded-md px-2 py-0.5"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
