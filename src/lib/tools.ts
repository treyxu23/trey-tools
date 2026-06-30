import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, parse } from 'node:path';
import yaml from 'js-yaml';

export interface Tool {
  slug: string;
  name: string;
  repo: string;
  category: string;
  tags: string[];
  description: string;
  stars?: number;
  starsToday?: number;
  added?: string;
  featured?: boolean;
  source: 'curated' | 'discovered' | 'daily' | 'weekly';
}

const DATA_DIR = resolve(process.cwd(), 'data');

function loadYamlFiles(dir: string, source: 'curated' | 'discovered'): Tool[] {
  const fullPath = resolve(DATA_DIR, dir);
  if (!existsSync(fullPath)) return [];

  const files = readdirSync(fullPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map(file => {
    const content = readFileSync(resolve(fullPath, file), 'utf-8');
    const data = yaml.load(content) as any;
    return { ...data, source, slug: data.slug || parse(file).name };
  });
}

function loadJsonFile(dir: string, source: 'discovered'): Tool[] {
  const fullPath = resolve(DATA_DIR, dir, 'latest.json');
  if (!existsSync(fullPath)) return [];
  const content = readFileSync(fullPath, 'utf-8');
  const items = JSON.parse(content) as any[];
  return items.map((item: any) => ({
    ...item,
    source,
    slug: item.slug || item.repo?.replace('/', '-'),
  }));
}

export function getAllTools(): Tool[] {
  const curated = loadYamlFiles('curated', 'curated');
  const discovered = loadJsonFile('discovered', 'discovered');
  return [...curated, ...discovered];
}

export function getToolsByCategory(category: string): Tool[] {
  return getAllTools().filter(t => t.category === category);
}

export function getToolBySlug(slug: string): Tool | undefined {
  return getAllTools().find(t => t.slug === slug || t.repo?.replace('/', '-') === slug);
}

export function getFeaturedTools(): Tool[] {
  return getAllTools().filter(t => t.featured);
}

export function getDiscoveredTools(): Tool[] {
  return getAllTools().filter(t => t.source === 'discovered');
}

export function filterByTags(tools: Tool[], tagSlugs: string[]): Tool[] {
  if (!tagSlugs.length) return tools;
  return tools.filter(t => tagSlugs.some(s => t.tags?.includes(s)));
}
