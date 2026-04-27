import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/content/modules');
const FORCE = process.argv.includes('--force');

export function write(id, slug, part, supermoduleId, estimatedMinutes, resources, body) {
  const filename = `${String(id).padStart(3, '0')}-${slug}.md`;
  const path = resolve(OUT, filename);
  if (existsSync(path) && !FORCE) { console.log(`  skip ${filename}`); return; }
  const fm = [
    '---',
    `id: ${id}`,
    `title: "${body.split('\n').find(l => l.startsWith('# ')).slice(2)}"`,
    `part: "${part}"`,
    `supermoduleId: ${supermoduleId}`,
    `estimatedMinutes: ${estimatedMinutes}`,
    'resources:',
    ...resources.map(r => [
      `  - type: ${r.type}`,
      `    title: "${r.title}"`,
      `    url: "${r.url}"`,
      r.description ? `    description: "${r.description}"` : null,
      r.required    ? `    required: true` : null,
    ].filter(Boolean).join('\n')),
    '---',
    '',
  ].join('\n');
  writeFileSync(path, fm + body.trim() + '\n');
  console.log(`✓ ${filename}`);
}
