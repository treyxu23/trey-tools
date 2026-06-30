# 🛠️ trey-tools

开源工具导航站 — 发现好用的开源工具，以 AI 为主但不设限。

[![Deploy](https://github.com/treyxu23/trey-tools/actions/workflows/deploy.yml/badge.svg)](https://github.com/treyxu23/trey-tools/actions/workflows/deploy.yml)
[![Discover](https://github.com/treyxu23/trey-tools/actions/workflows/discover.yml/badge.svg)](https://github.com/treyxu23/trey-tools/actions/workflows/discover.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🌐 **在线地址**: [treyxu23.github.io/trey-tools](https://treyxu23.github.io/trey-tools)

---

## 🤔 痛点

GitHub 上有海量开源工具，但发现它们全靠运气——要么刷 Trending 碰到，要么靠别人的 Awesome List（纯文本长清单，根本没法浏览）。

没有一个**直观的分类导航站**，能让你按形态、用途快速找到想要的工具。

## 🛠️ 解法

trey-tools 是一个**自动发现 + 手动精选**的开源工具导航站：

- 🏷️ **两级分类**：先按形态（CLI / 桌面 / 手机 / Web / 扩展 / 库 / 模型），再按标签（AI 编程 / 视频 / 搜索 / 效率…）
- 🤖 **自动发现**：每天自动从 GitHub 热门 Topics 抓取新工具
- ⭐ **手动精选**：靠谱的工具人工加标签和描述
- 🔍 **搜索筛选**：按分类、标签、关键词快速定位

## 🎯 适合谁

- 🧑‍💻 想找好用的开源工具，但不想翻几十个 Awesome List
- 🤖 关注 AI 工具生态，想比别人早知道新项目
- 📦 开源爱好者，想发现优秀项目和替代品

## 📦 技术栈

- **框架**：[Astro](https://astro.build) — 静态站点生成
- **样式**：[Tailwind CSS v4](https://tailwindcss.com)
- **数据**：YAML（手动精选）+ JSON（自动发现）
- **自动发现**：GitHub Actions 定时任务，每天从热门 Topics 抓取
- **部署**：GitHub Pages

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## ➕ 添加新工具

在 `data/curated/` 下新建一个 `.yaml` 文件：

```yaml
slug: your-tool
name: 你的工具名
repo: owner/repo
category: cli    # 见 data/categories.yaml
tags: [ai-coding, productivity]  # 见 data/tags.yaml
description: 一句话描述这个工具
added: 2026-06-30
featured: false
```

Push 后自动出现在导航站上。

## 📄 License

MIT
