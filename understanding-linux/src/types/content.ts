export type ResourceType = 'book' | 'article' | 'paper' | 'video' | 'tool' | 'reference';

export interface Resource {
  type: ResourceType;
  title: string;
  url: string;
  description?: string;
  required?: boolean;
}

export interface ModuleFrontmatter {
  id: number;
  title: string;
  part: string;
  supermoduleId: number;
  estimatedMinutes: number;
  resources: Resource[];
}
