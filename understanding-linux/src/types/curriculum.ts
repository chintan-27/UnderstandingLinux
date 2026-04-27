export interface Module {
  id: number;
  title: string;
  slug: string;
  part: string;
  partTitle: string;
  supermoduleId: number;
  topics: string[];
  contentPath: string;
}

export interface Supermodule {
  id: number;
  title: string;
  slug: string;
  description: string;
  moduleCount: number;
  moduleIds: number[];
}

export interface CurriculumData {
  supermodules: Supermodule[];
  modules: Module[];
}
