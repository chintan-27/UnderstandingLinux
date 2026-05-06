import { Book, FileText, Film, Wrench, ExternalLink } from 'lucide-react';
import type { Resource } from '../../types/content';

const ICONS: Record<string, typeof Book> = {
  book: Book,
  article: FileText,
  paper: FileText,
  video: Film,
  tool: Wrench,
  reference: ExternalLink,
};

export function ResourceList({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {resources.map((r, i) => {
        const Icon = ICONS[r.type] ?? ExternalLink;
        return (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 0',
              borderBottom: '1px solid #f0ece6',
              textDecoration: 'none',
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.65'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            <Icon size={11} color="#a09890" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#131311', lineHeight: 1.35 }}>
                {r.title}
              </div>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9, color: '#a09890',
                textTransform: 'capitalize', letterSpacing: '0.06em', marginTop: 2,
              }}>
                {r.type}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
