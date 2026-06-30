/**
 * 自动发现脚本 — 4 条数据源抓取开源工具
 *  ① GitHub Trending（HTML 爬取 daily+weekly）
 *  ② GitHub Topic Search（API 搜索 20 个 topic）
 *  ③ Hacker News Show HN（提取 GitHub 链接）
 *  ④ Reddit（r/MachineLearning 等板块提取 GitHub 链接）
 *
 * 由 GitHub Actions 定时触发，每天一次
 * 数据写入 data/discovered/latest.json
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.cwd(), 'data/discovered');
const OUTPUT_FILE = resolve(DATA_DIR, 'latest.json');

// GitHub Token (Actions 中自动注入，Search API 用)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// ─── 热门 Topics ──────────────────────────────────────────
const TOPICS = [
  'ai', 'llm', 'agent', 'ai-agent', 'machine-learning',
  'open-source', 'developer-tools', 'productivity',
  'cli', 'self-hosted', 'chatgpt', 'openai',
  'stable-diffusion', 'text-to-image', 'text-to-video',
  'browser-extension', 'mobile-app', 'desktop-app',
  'automation', 'workflow', 'note-taking',
];

function getApiHeaders() {
  const h = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'trey-tools-discover/1.0',
  };
  if (GITHUB_TOKEN) h['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  return h;
}

function getHtmlHeaders() {
  return {
    'Accept': 'text/html',
    'User-Agent': 'trey-tools-discover/1.0',
  };
}

// ─── 数据源一：GitHub Trending（HTML 爬取）────────────────

/**
 * 爬取 GitHub Trending 页面，返回仓库列表
 * @param {'daily'|'weekly'} since
 */
async function fetchTrending(since = 'daily') {
  const url = `https://github.com/trending?since=${since}`;
  console.log(`📈 Trending (${since})`);

  const resp = await fetch(url, { headers: getHtmlHeaders() });
  if (!resp.ok) {
    console.log(`  ⚠️  HTTP ${resp.status}`);
    return [];
  }

  const html = await resp.text();

  // 用正则提取每个仓库卡片 — GitHub Trending 的 article 结构
  // <article class="Box-row"> ... </article>
  const articleRegex = /<article\s+class="Box-row"[^>]*>([\s\S]*?)<\/article>/gi;
  const articles = html.match(articleRegex) || [];

  console.log(`  → 解析到 ${articles.length} 个仓库卡片`);

  const repos = [];
  for (const articleHtml of articles) {
    try {
      const repo = parseTrendingArticle(articleHtml, since);
      if (repo) repos.push(repo);
    } catch (e) {
      // 个别解析失败跳过，不影响整体
    }
  }

  return repos;
}

function parseTrendingArticle(html, since) {
  // 仓库路径: href="/owner/repo"
  const pathMatch = html.match(/href="\/([^"]+)"[^>]*>\s*(?:<[^>]+>)*\s*([\w.-]+)\s*\/\s*<span[^>]*>([\w.-]+)/i)
    || html.match(/href="\/([^/]+\/[\w.-]+)"/);

  if (!pathMatch) return null;

  let fullName;
  if (pathMatch[2] && pathMatch[3]) {
    // 匹配到 owner / repo 分离格式
    fullName = `${pathMatch[2]}/${pathMatch[3]}`;
  } else {
    fullName = pathMatch[1];
  }

  // 去掉可能的尾部参数
  fullName = fullName.replace(/\?.*$/, '');

  // 描述: <p class="col-9 color-fg-muted my-1 pr-4">...</p>
  const descMatch = html.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const description = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, '').trim()
    : '';

  // 今日 stars: "xxx stars today"
  const starsTodayMatch = html.match(/([\d,]+)\s+stars?\s+today/i);
  const starsToday = starsTodayMatch
    ? parseInt(starsTodayMatch[1].replace(/,/g, ''))
    : 0;

  // 总 stars: 在语言标签后面的文本
  const totalStarsMatch = html.match(/([\d,]+)\s*<\/a>\s*(?:[\d,]+)?\s*stars?\s*(?:today|this\s+\w+)/i)
    || html.match(/<\/span>\s*([\d,]+)\s*$/m);
  const totalStars = totalStarsMatch
    ? parseInt(totalStarsMatch[1].replace(/,/g, ''))
    : 0;

  // 语言
  const langMatch = html.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</i)
    || html.match(/programmingLanguage[^>]*>\s*([^<\s]+)/i);
  const language = langMatch ? langMatch[1].trim() : null;

  // 从 description 推断 topics（用于分类）
  const descLower = (description || '').toLowerCase();
  const inferredTopics = [];
  if (descLower.includes('cli') || descLower.includes('command line')) inferredTopics.push('cli');
  if (descLower.includes('browser extension') || descLower.includes('chrome extension')) inferredTopics.push('browser-extension');
  if (descLower.includes('desktop') || descLower.includes('macos') || descLower.includes('windows')) inferredTopics.push('desktop-app');
  if (descLower.includes('mobile') || descLower.includes('android') || descLower.includes('ios')) inferredTopics.push('mobile-app');

  return {
    full_name: fullName,
    name: fullName.split('/')[1],
    description,
    stargazers_count: totalStars || starsToday * 10, // fallback 估算
    language,
    topics: [],
    inferredTopics,
    pushed_at: new Date().toISOString(),
    starsToday,
    source: since,
  };
}

// ─── 数据源二：GitHub Search API（Topic 搜索）─────────────

async function fetchTopicRepos(topic, page = 1) {
  const url = `https://api.github.com/search/repositories?q=topic:${topic}+stars:>50&sort=stars&order=desc&per_page=20&page=${page}`;
  console.log(`  🔍 Topic: ${topic}`);

  const resp = await fetch(url, { headers: getApiHeaders() });
  if (!resp.ok) {
    console.log(`  ⚠️  HTTP ${resp.status}`);
    return [];
  }

  const data = await resp.json();
  return data.items || [];
}

// ─── 数据源三：Hacker News Show HN ────────────────────────

const HN_BASE = 'https://hacker-news.firebaseio.com/v0';

async function fetchHNShowHN() {
  console.log('📡 HN Show HN');
  
  // 获取 Show HN 帖子 ID 列表
  const idsResp = await fetch(`${HN_BASE}/showstories.json`);
  if (!idsResp.ok) {
    console.log(`  ⚠️  HTTP ${idsResp.status}`);
    return [];
  }
  
  const ids = await idsResp.json();
  const recentIds = ids.slice(0, 50); // 取最近 50 条
  
  console.log(`  → 获取 ${recentIds.length} 条帖子`);
  
  const repos = [];
  for (const id of recentIds) {
    try {
      const itemResp = await fetch(`${HN_BASE}/item/${id}.json`);
      const item = await itemResp.json();
      if (!item) continue;
      
      // 从标题和 URL 提取 GitHub 链接
      const githubUrl = extractGitHubUrl(item.url, item.title);
      if (!githubUrl) continue;
      
      const { owner, repo: repoName } = parseGitHubUrl(githubUrl);
      if (!owner || !repoName) continue;
      
      // 用 GitHub API 获取仓库元数据
      const repoMeta = await fetchRepoMeta(owner, repoName);
      if (!repoMeta || repoMeta.stargazers_count < 10) continue;
      
      repos.push({
        full_name: `${owner}/${repoName}`,
        name: repoName,
        description: repoMeta.description || item.title || '',
        stargazers_count: repoMeta.stargazers_count || 0,
        language: repoMeta.language,
        topics: repoMeta.topics || [],
        pushed_at: repoMeta.pushed_at || new Date().toISOString(),
        source: 'hn',
        hn_points: item.score || 0,
        hn_title: item.title || '',
      });
    } catch (e) {
      // 单个失败不影响整体
    }
    // 避免 rate limit
    await new Promise(r => setTimeout(r, 100));
  }
  
  return repos;
}

// ─── 数据源四：Reddit ─────────────────────────────────────

const REDDIT_SUBS = [
  'coolgithubprojects',
  'SideProject',
  'opensource',
  'github',
];

async function fetchRedditRepos() {
  console.log('📡 Reddit RSS');

  const repos = [];

  for (const sub of REDDIT_SUBS) {
    try {
      const url = `https://www.reddit.com/r/${sub}/.rss`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'trey-tools/1.0' }
      });
      if (!resp.ok) {
        if (resp.status === 429) {
          console.log(`  r/${sub}: HTTP 429, 等待后重试`);
          await new Promise(r => setTimeout(r, 10000));
          continue; // 跳过这个 sub，不浪费时间
        }
        console.log(`  r/${sub}: HTTP ${resp.status}`);
        continue;
      }

      const xml = await resp.text();
      const entries = parseRSSEntries(xml);
      console.log(`  r/${sub} → ${entries.length} 条`);

      for (const entry of entries) {
        const githubUrl = extractGitHubUrl(entry.link, entry.title);
        if (!githubUrl) continue;

        const { owner, repo: repoName } = parseGitHubUrl(githubUrl);
        if (!owner || !repoName) continue;

        const key = `${owner}/${repoName}`;
        if (repos.find(r => r.full_name === key)) continue;

        const repoMeta = await fetchRepoMeta(owner, repoName);
        if (!repoMeta || repoMeta.stargazers_count < 10) continue;

        repos.push({
          full_name: key,
          name: repoName,
          description: repoMeta.description || entry.title || '',
          stargazers_count: repoMeta.stargazers_count || 0,
          language: repoMeta.language,
          topics: repoMeta.topics || [],
          pushed_at: repoMeta.pushed_at || new Date().toISOString(),
          source: 'reddit',
          reddit_sub: sub,
        });
      }
    } catch (e) {
      console.log(`  r/${sub}: 请求失败`);
    }
    await new Promise(r => setTimeout(r, 8000));
  }

  return repos;
}

function parseRSSEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([^<]+)<\/title>/);
    // Reddit RSS: <link href="..."/> 指向 Reddit 帖子，外链在 <content> 中
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const content = contentMatch ? contentMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
    
    if (titleMatch) {
      entries.push({
        title: titleMatch[1].trim(),
        link: content, // 从 content 中提取 GitHub 链接
      });
    }
  }
  return entries;
}

// ─── 工具函数：URL 解析 ───────────────────────────────────

function extractGitHubUrl(url, title) {
  const text = [url, title].filter(Boolean).join(' ');
  const match = text.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
  return match ? `https://github.com/${match[1]}` : null;
}

function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (!match) return {};
  return { owner: match[1], repo: match[2] };
}

async function fetchRepoMeta(owner, repo) {
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: getApiHeaders() }
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ─── 分类 & 标签映射 ──────────────────────────────────────

function guessCategory(topics, language, inferredTopics = []) {
  const t = [...topics.map(x => x.toLowerCase()), ...inferredTopics];

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

function mapTags(topics, description = '') {
  const tagMap = {
    'ai': 'ai-coding', 'llm': 'ai-chat', 'chatgpt': 'ai-chat', 'openai': 'ai-chat',
    'agent': 'ai-agent', 'ai-agent': 'ai-agent', 'machine-learning': 'ai-coding',
    'stable-diffusion': 'ai-image', 'text-to-image': 'ai-image', 'text-to-video': 'ai-video',
    'developer-tools': 'dev-tools', 'productivity': 'productivity',
    'automation': 'ai-agent', 'self-hosted': 'self-hosted',
    'open-source': 'open-source-alt', 'cli': 'dev-tools', 'note-taking': 'productivity',
  };

  const fromTopics = topics
    .map(t => tagMap[t.toLowerCase()] || null)
    .filter(t => t !== null);

  // 从描述推断额外标签
  const descLower = (description || '').toLowerCase();
  if (descLower.includes('video') || descLower.includes('视频')) fromTopics.push('ai-video');
  if (descLower.includes('image') || descLower.includes('图片') || descLower.includes('绘画')) fromTopics.push('ai-image');
  if (descLower.includes('audio') || descLower.includes('音乐') || descLower.includes('语音')) fromTopics.push('ai-audio');
  if (descLower.includes('search') || descLower.includes('搜索') || descLower.includes('rag')) fromTopics.push('ai-search');
  if (descLower.includes('writing') || descLower.includes('写作') || descLower.includes('文案')) fromTopics.push('ai-text');

  return [...new Set(fromTopics)].slice(0, 8);
}

function isRelevant(repo) {
  const name = (repo.name || '').toLowerCase();
  const desc = (repo.description || '').toLowerCase();
  if (!desc || desc.length < 20) return false;

  // 过滤 Awesome List 和合集类项目
  const skipPatterns = [
    'awesome list', 'curated list of', 'a curated list', 'collection of lists',
    'curated list', 'list of free', 'list of awesome', 'list of public',
    'collective list', 'a list of',
  ];
  for (const p of skipPatterns) {
    if (desc.includes(p)) return false;
  }

  // 过滤名字就是 awesome- 开头的
  if (name.startsWith('awesome-') || name.startsWith('awesome_')) return false;

  return true;
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  console.log('🔍 trey-tools discover — 扫描热门仓库\n');

  const allRepos = new Map();

  // 数据源一：GitHub Trending（daily + weekly）
  for (const since of ['daily', 'weekly']) {
    const trending = await fetchTrending(since);
    console.log(`  → 获取 ${trending.length} 个 (${since})`);
    for (const repo of trending) {
      // 用 full_name 做 key，daily 优先于 weekly
      if (!allRepos.has(repo.full_name) || since === 'daily') {
        allRepos.set(repo.full_name, repo);
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 数据源二：Topic 搜索
  for (const topic of TOPICS) {
    const repos = await fetchTopicRepos(topic);
    console.log(`  → 获取 ${repos.length} 个仓库`);
    for (const repo of repos) {
      if (!allRepos.has(repo.full_name)) {
        allRepos.set(repo.full_name, repo);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // 数据源三：Hacker News Show HN
  const hnRepos = await fetchHNShowHN();
  console.log(`  → 获取 ${hnRepos.length} 个仓库`);
  for (const repo of hnRepos) {
    if (!allRepos.has(repo.full_name)) {
      allRepos.set(repo.full_name, repo);
    }
  }

  // 数据源四：Reddit
  const redditRepos = await fetchRedditRepos();
  console.log(`  → 获取 ${redditRepos.length} 个仓库`);
  for (const repo of redditRepos) {
    if (!allRepos.has(repo.full_name)) {
      allRepos.set(repo.full_name, repo);
    }
  }

  console.log(`\n📊 去重后共 ${allRepos.size} 个仓库`);

  // 转换 & 筛选
  const tools = [];
  for (const repo of allRepos.values()) {
    if (!isRelevant(repo)) continue;

    const tagsFromGH = repo.topics || [];
    const inferred = repo.inferredTopics || [];

    tools.push({
      slug: repo.full_name.replace('/', '-'),
      name: repo.name,
      repo: repo.full_name,
      description: repo.description || '',
      stars: repo.stargazers_count || 0,
      starsToday: repo.starsToday || 0,
      category: guessCategory(tagsFromGH, repo.language, inferred),
      tags: mapTags(tagsFromGH, repo.description),
      language: repo.language || 'Unknown',
      pushed_at: repo.pushed_at || new Date().toISOString(),
      discovered: new Date().toISOString().split('T')[0],
      source: repo.source || 'topic',
    });
  }

  // 混合排序：Trending 和新来源优先，Topic 垫底
  const trendingTools = tools.filter(t => t.source === 'daily' || t.source === 'weekly');
  const communityTools = tools.filter(t => t.source === 'hn' || t.source === 'reddit');
  const topicTools = tools.filter(t => t.source === 'topic');

  trendingTools.sort((a, b) => b.stars - a.stars);
  communityTools.sort((a, b) => b.stars - a.stars);
  topicTools.sort((a, b) => b.stars - a.stars);

  // 取 top 50 topic + 25 trending + 25 community
  const top = [
    ...topicTools.slice(0, 50),
    ...trendingTools.slice(0, 25),
    ...communityTools.slice(0, 25),
  ];

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(top, null, 2));

  // 统计
  const srcTrending = tools.filter(t => t.source === 'daily' || t.source === 'weekly').length;
  const srcHN = tools.filter(t => t.source === 'hn').length;
  const srcReddit = tools.filter(t => t.source === 'reddit').length;
  const srcTopic = tools.filter(t => t.source === 'topic').length;
  console.log(`\n✅ 写入 ${top.length} 个工具`);
  console.log(`   📈 Trending: ${srcTrending} 个`);
  console.log(`   📡 HN: ${srcHN} 个`);
  console.log(`   📡 Reddit: ${srcReddit} 个`);
  console.log(`   🔍 Topic: ${srcTopic} 个`);
}

main().catch(err => {
  console.error('❌ 发现失败:', err);
  process.exit(1);
});
