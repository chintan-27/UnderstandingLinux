import { Book, FileText, Film, Wrench, ExternalLink, Star } from 'lucide-react';
import type { Resource } from '../../types/content';

const ICONS: Record<string, typeof Book> = {
  book: Book,
  article: FileText,
  paper: FileText,
  video: Film,
  tool: Wrench,
  reference: ExternalLink,
};

interface ResourceListProps {
  resources: Resource[];
}

export function ResourceList({ resources }: ResourceListProps) {
  if (resources.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Resources</p>
      <div className="space-y-2">
        {resources.map((r, i) => {
          const Icon = ICONS[r.type] ?? ExternalLink;
          return (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 p-2.5 rounded-xl border border-surface-200 hover:border-accent/30 hover:bg-accent-muted transition-all group"
            >
              <Icon size={13} className="text-surface-400 group-hover:text-accent mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-surface-700 group-hover:text-surface-900 leading-snug">
                    {r.title}
                  </span>
                  {r.required && <Star size={10} className="text-amber-400 shrink-0" fill="currentColor" />}
                </div>
                {r.description && (
                  <p className="text-xs text-surface-400 mt-0.5 leading-snug">{r.description}</p>
                )}
                <span className="text-xs text-surface-300 capitalize">{r.type}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
