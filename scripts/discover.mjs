/**
 * 自动发现脚本 — 从 GitHub 热门 Topics 抓取开源工具
 * 由 GitHub Actions 定时触发，每天一次
 *
 * 数据写入 data/discovered/latest.json
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), 'data/discovered');
const OUTPUT_FILE = resolve(DATA_DIR, 'latest.json');

// GitHub Token (Actions 中自动注入)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// 热门 Topics
const TOPICS = [
  'ai', 'llm', 'agent', 'ai-agent', 'machine-learning',
  'open-source', 'developer-tools', 'productivity',
  'cli', 'self-hosted', 'chatgpt', 'openai',
  'stable-diffusion', 'text-to-image', 'text-to-video',
  'browser-extension', 'mobile-app', 'desktop-app',
  'automation', 'workflow', 'note-taking',
];

function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'trey-tools-discover/1.0',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchTopicRepos(topic, page = 1) {
  const url = `https://api.github.com/search/repositories?q=topic:${topic}+stars:>50&sort=stars&order=desc&per_page=20&page=${page}`;
  console.log(`  Fetching: ${topic}`);

  const resp = await fetch(url, { headers: getHeaders() });
  if (!resp.ok) {
    console.log(`  ⚠️  HTTP ${resp.status}`);
    return [];
  }

  const data = await resp.json();
  return data.items || [];
}

function guessCategory(topics, language) {
  const t = topics.map(x => x.toLowerCase());

  if (t.includes('browser-extension')) return 'extension';
  if (t.includes('mobile-app') || t.includes('android') || t.includes('ios')) return 'mobile';
  if (t.includes('desktop-app') || t.includes('macos')) return 'desktop';
  if (t.includes('cli') || t.includes('terminal') || t.includes('command-line')) return 'cli';
  if (t.includes('self-hosted')) return 'web';
  if (t.includes('library') || t.includes('sdk') || t.includes('framework') || t.includes('api')) return 'library';

  if (language === 'TypeScript' || language === 'JavaScript' || language === 'Vue') return 'web';
  if (language === 'Swift' || language === 'Kotlin') return 'mobile';
  if (language === 'Python' || language === 'Go' || language === 'Rust') return 'cli';

  return 'web';
}

function mapTags(topics) {
  const tagMap = {
    'ai': 'ai-coding', 'llm': 'ai-chat', 'chatgpt': 'ai-chat', 'openai': 'ai-chat',
    'agent': 'ai-agent', 'ai-agent': 'ai-agent', 'machine-learning': 'ai-coding',
    'stable-diffusion': 'ai-image', 'text-to-image': 'ai-image', 'text-to-video': 'ai-video',
    'developer-tools': 'dev-tools', 'productivity': 'productivity',
    'automation': 'ai-agent', 'self-hosted': 'self-hosted',
    'open-source': 'open-source-alt', 'cli': 'dev-tools', 'note-taking': 'productivity',
  };

  const mapped = topics
    .map(t => tagMap[t.toLowerCase()] || null)
    .filter(t => t !== null);

  return [...new Set(mapped)].slice(0, 8);
}

function isRelevant(repo) {
  if (!repo.description || repo.description.length < 20) return false;

  const desc = repo.description.toLowerCase();
  const skipWords = ['awesome list', 'curated list of', 'a curated list', 'awesome-', 'collection of'];
  for (const w of skipWords) {
    if (desc.includes(w)) return false;
  }

  return true;
}

async function main() {
  console.log('🔍 trey-tools discover — 扫描热门仓库\n');

  const allRepos = new Map();

  for (const topic of TOPICS) {
    const repos = await fetchTopicRepos(topic);
    console.log(`   → 获取 ${repos.length} 个仓库`);
    for (const repo of repos) {
      allRepos.set(repo.full_name, repo);
    }
    // 避免触发 rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 去重后共 ${allRepos.size} 个仓库`);

  const tools = [];
  for (const repo of allRepos.values()) {
    if (!isRelevant(repo)) continue;

    const tagsFromGH = repo.topics || [];
    tools.push({
      slug: repo.full_name.replace('/', '-'),
      name: repo.name,
      repo: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      category: guessCategory(tagsFromGH, repo.language),
      tags: mapTags(tagsFromGH),
      language: repo.language || 'Unknown',
      pushed_at: repo.pushed_at,
      discovered: new Date().toISOString().split('T')[0],
    });
  }

  tools.sort((a, b) => b.stars - a.stars);
  const top = tools.slice(0, 100);

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(top, null, 2));
  console.log(`\n✅ 写入 ${top.length} 个工具到 data/discovered/latest.json`);
}

main().catch(err => {
  console.error('❌ 发现失败:', err);
  process.exit(1);
});
