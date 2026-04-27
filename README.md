# Understanding Linux

A personal study platform for learning Linux from first principles — 215 modules across 12 stages, from basic math through kernel internals, drivers, networking, and performance engineering.

**Live site:** https://chintan-27.github.io/UnderstandingLinux/

## Structure

215 modules organized into 12 progressive stages:

| Stage | Topic |
|---|---|
| 1–3 | Math, Physics, Circuits |
| 4–6 | Digital Logic, Architecture, C & Toolchain |
| 7–9 | Operating Systems, Linux User Space, Linux Kernel |
| 10–12 | Drivers, Networking, Performance / Security / Containers |

## Tech

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- React Router v7
- Markdown lessons with syntax highlighting
- Progress tracking in localStorage (no backend)

## Adding content

Drop a `.md` file into `understanding-linux/public/content/modules/` — no build step needed.

```
public/content/modules/055-caches.md
```

Use `public/content/modules/_template.md` as the starting point. The filename must match the `contentPath` in `src/data/curriculum.json`.

## Development

```bash
cd understanding-linux
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the Actions workflow in `.github/workflows/deploy.yml`.
