import { useState, useEffect } from 'react';
import yaml from 'js-yaml';
import type { ModuleFrontmatter } from '../types/content';

interface UseModuleContentReturn {
  markdown: string | null;
  frontmatter: ModuleFrontmatter | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

function parseFrontmatter(raw: string): { frontmatter: ModuleFrontmatter | null; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: raw };
  try {
    const frontmatter = yaml.load(match[1]) as ModuleFrontmatter;
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: null, body: raw };
  }
}

export function useModuleContent(contentPath: string | undefined): UseModuleContentReturn {
  const [state, setState] = useState<UseModuleContentReturn>({
    markdown: null,
    frontmatter: null,
    loading: true,
    notFound: false,
    error: null,
  });

  useEffect(() => {
    if (!contentPath) {
      setState({ markdown: null, frontmatter: null, loading: false, notFound: true, error: null });
      return;
    }

    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null, notFound: false }));

    fetch(`${import.meta.env.BASE_URL}${contentPath}`, { signal: controller.signal })
      .then(async res => {
        // Vite SPA fallback returns index.html (text/html) for missing files — treat as 404
        const ct = res.headers.get('content-type') ?? '';
        if (res.status === 404 || ct.includes('text/html')) {
          setState({ markdown: null, frontmatter: null, loading: false, notFound: true, error: null });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.text();
        const { frontmatter, body } = parseFrontmatter(raw);
        setState({ markdown: body, frontmatter, loading: false, notFound: false, error: null });
      })
      .catch(err => {
        if ((err as Error).name === 'AbortError') return;
        setState({ markdown: null, frontmatter: null, loading: false, notFound: false, error: String(err) });
      });

    return () => controller.abort();
  }, [contentPath]);

  return state;
}
