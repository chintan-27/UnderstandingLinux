import { useMemo } from 'react';
import curriculumData from '../data/curriculum.json';
import type { CurriculumData, Module, Supermodule } from '../types/curriculum';

const data = curriculumData as CurriculumData;

export function useCurriculum() {
  const moduleById = useMemo(() => {
    const map = new Map<number, Module>();
    for (const m of data.modules) map.set(m.id, m);
    return map;
  }, []);

  const moduleBySlug = useMemo(() => {
    const map = new Map<string, Module>();
    for (const m of data.modules) map.set(m.slug, m);
    return map;
  }, []);

  const supermoduleById = useMemo(() => {
    const map = new Map<number, Supermodule>();
    for (const s of data.supermodules) map.set(s.id, s);
    return map;
  }, []);

  const supermoduleBySlug = useMemo(() => {
    const map = new Map<string, Supermodule>();
    for (const s of data.supermodules) map.set(s.slug, s);
    return map;
  }, []);

  const sortedModules = useMemo(() => [...data.modules].sort((a, b) => a.id - b.id), []);

  return {
    supermodules: data.supermodules,
    modules: data.modules,
    getModule: (id: number) => moduleById.get(id),
    getModuleBySlug: (slug: string) => moduleBySlug.get(slug),
    getSupermodule: (id: number) => supermoduleById.get(id),
    getSupermoduleBySlug: (slug: string) => supermoduleBySlug.get(slug),
    getModulesForSupermodule: (supermoduleId: number) =>
      sortedModules.filter(m => m.supermoduleId === supermoduleId),
    getPreviousModule: (moduleId: number) => {
      const idx = sortedModules.findIndex(m => m.id === moduleId);
      return idx > 0 ? sortedModules[idx - 1] : undefined;
    },
    getNextModule: (moduleId: number) => {
      const idx = sortedModules.findIndex(m => m.id === moduleId);
      return idx >= 0 && idx < sortedModules.length - 1 ? sortedModules[idx + 1] : undefined;
    },
  };
}
