/**
 * Obsidian 公众号文章扫描 — 提取 GitHub 仓库引用
 * 
 * 扫描: 知识沉淀/公众号文章/
 * 输出: data/curated/obsidian-{date}.yaml
 * 验证: GitHub API 确认仓库存在 + 获取 stars/topics/language
 * 
 * 用法: node scripts/scan-obsidian.mjs
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

const OBSIDIAN_VAULT = resolve(process.env.HOME, 'Library/Mobile Documents/iCloud~md~obsidian/Documents/imtrey');
const SCAN_DIR = resolve(OBSIDIAN_VAULT, '知识沉淀/公众号文章');
const REPO_DIR = resolve(process.cwd());
const CURATED_DIR = resolve(REPO_DIR, 'data/curated');
const DISCOVERED_FILE = resolve(REPO_DIR, 'data/discovered/latest.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'trey-tools-obsidian-scan/1.0',
};
if (GITHUB_TOKEN) HEADERS['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

// ─── 分类映射（从 topics 推断）──────────────────────────

function guessCategory(topics, language) {
  const t = topics.map(x => x.toLowerCase());
  if (t.includes('browser-extension')) return 'extension';
  if (t.includes('mobile-app') || t.includes('android') || t.includes('ios')) return 'mobile';
  if (t.includes('desktop-app') || t.includes('macos')) return 'desktop';
  if (t.includes('cli') || t.includes('terminal')) return 'cli';
  if (t.includes('self-hosted')) return 'web';
  if (t.includes('library') || t.includes('sdk') || t.includes('framework')) return 'library';
  if (language === 'TypeScript' || language === 'JavaScript' || language === 'Vue') return 'web';
  if (language === 'Swift' || language === 'Kotlin') return 'mobile';
  return 'web';
}

function mapTags(topics) {
  const tagMap = {
    'ai': 'ai-coding', 'llm': 'ai-chat', 'chatgpt': 'ai-chat', 'agent': 'ai-agent',
    'ai-agent': 'ai-agent', 'machine-learning': 'ai-coding',
    'stable-diffusion': 'ai-image', 'text-to-image': 'ai-image', 'text-to-video': 'ai-video',
    'developer-tools': 'dev-tools', 'productivity': 'productivity',
    'automation': 'ai-agent', 'self-hosted': 'self-hosted',
    'open-source': 'open-source-alt', 'cli': 'dev-tools',
  };
  return [...new Set(topics.map(t => tagMap[t.toLowerCase()] || null).filter(Boolean))].slice(0, 6);
}

// ─── 提取 GitHub 仓库引用 ─────────────────────────────────

function extractRepos(text) {
  const repos = new Set();
  const ghPattern = /github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/g;
  let match;
  while ((match = ghPattern.exec(text)) !== null) {
    const repo = match[1].replace(/\/$/, '').replace(/\.git$/, '');
    if (!repo.includes('#') && repo.split('/').length === 2) repos.add(repo);
  }
  return [...repos];
}

// ─── 加载已有工具 ─────────────────────────────────────────

function loadExistingTools() {
  const existing = new Set();
  if (existsSync(CURATED_DIR)) {
    for (const file of readdirSync(CURATED_DIR)) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      if (file.startsWith('obsidian-')) continue;
      const content = readFileSync(resolve(CURATED_DIR, file), 'utf-8');
      const repoMatch = content.match(/repo:\s*(\S+)/);
      if (repoMatch) existing.add(repoMatch[1].toLowerCase());
    }
  }
  if (existsSync(DISCOVERED_FILE)) {
    try {
      for (const t of JSON.parse(readFileSync(DISCOVERED_FILE, 'utf-8'))) {
        if (t.repo) existing.add(t.repo.toLowerCase());
      }
    } catch {}
  }
  return existing;
}

// ─── 验证仓库 + 获取元数据 ────────────────────────────────

async function verifyRepo(owner, repo) {
  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: HEADERS });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  console.log('📚 扫描 Obsidian 公众号文章...\n');
  
  if (!existsSync(SCAN_DIR)) {
    console.error(`❌ 目录不存在: ${SCAN_DIR}`);
    process.exit(1);
  }
  
  const files = readdirSync(SCAN_DIR).filter(f => f.endsWith('.md'));
  console.log(`📂 找到 ${files.length} 篇文章\n`);
  
  const existing = loadExistingTools();
  console.log(`📊 已有 ${existing.size} 个工具（去重用）\n`);
  
  // 收集所有新候选
  const candidates = new Map();
  for (const file of files) {
    const content = readFileSync(resolve(SCAN_DIR, file), 'utf-8');
    const repos = extractRepos(content);
    if (repos.length === 0) continue;
    
    const titleMatch = content.match(/^title:\s*"?(.+?)"?$/m);
    const title = titleMatch ? titleMatch[1].trim() : basename(file, '.md');
    
    for (const repo of repos) {
      const key = repo.toLowerCase();
      if (!existing.has(key) && !candidates.has(key)) {
        candidates.set(key, { repo, title, file });
      }
    }
  }
  
  if (candidates.size === 0) {
    console.log('✅ 没有新仓库。');
    return;
  }
  
  console.log(`🔍 验证 ${candidates.size} 个候选仓库...\n`);
  
  const validated = [];
  for (const [key, info] of candidates) {
    const [owner, repoName] = info.repo.split('/');
    process.stdout.write(`  ${info.repo} ... `);
    
    const meta = await verifyRepo(owner, repoName);
    if (!meta) {
      console.log('❌ 不存在或私有');
      continue;
    }
    
    console.log(`✅ ⭐${meta.stargazers_count} ${meta.language || '?'}`);
    
    validated.push({ ...info, meta });
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
  
  console.log(`\n✅ 验证通过: ${validated.length} 个\n`);
  
  if (validated.length === 0) return;
  
  // 写入 YAML
  const date = new Date().toISOString().split('T')[0];
  let yaml = `# Obsidian 公众号文章自动提取 — ${date}\n# 已验证仓库存在\n`;
  
  for (const v of validated) {
    const m = v.meta;
    yaml += `
---
slug: ${v.repo.replace('/', '-').toLowerCase()}
name: ${m.name || v.repo.split('/')[1]}
repo: ${v.repo}
description: >-
  ${(m.description || `来自公众号: ${v.title}`).replace(/\n/g, '\n  ').substring(0, 300)}
category: ${guessCategory(m.topics || [], m.language)}
tags: [${mapTags(m.topics || []).join(', ')}]
added: ${date}
source: curated
featured: false
`;
  }
  
  if (!existsSync(CURATED_DIR)) mkdirSync(CURATED_DIR, { recursive: true });
  const outFile = resolve(CURATED_DIR, `obsidian-${date}.yaml`);
  writeFileSync(outFile, yaml, 'utf-8');
  console.log(`📝 写入 ${outFile}`);
  
  // Git
  try {
    execSync('git add data/curated/', { cwd: REPO_DIR, stdio: 'inherit' });
    execSync(`git commit -m "📚 obsidian: 扫描 ${date} — ${validated.length} 个新仓库"`, { cwd: REPO_DIR, stdio: 'inherit' });
    console.log('✅ 已提交');
  } catch {
    console.log('⚠️ Git 操作失败');
  }
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
