# 开源工具导航站

> 一个网站，帮你发现 GitHub 上的好工具。自动更新，不用你刷。

[![网站](https://img.shields.io/badge/打开网站-treyxu23.github.io%2Ftrey--tools-blue)](https://treyxu23.github.io/trey-tools)
[![工具数量](https://img.shields.io/badge/已收录-100%2B-brightgreen)](https://treyxu23.github.io/trey-tools)

![站点预览](https://raw.githubusercontent.com/treyxu23/trey-tools/main/public/preview.png)

---

## 一句话说清楚

**这网站就是 GitHub 工具的黄页。** AI 工具、效率软件、开源替代品——分好类，标好签，每天自动更新。点进去就能逛。

[🔗 打开看看 →](https://treyxu23.github.io/trey-tools)

## 有哪几类工具

左边点分类，上面筛标签：

- ⌨️ CLI 工具 —— 命令行里跑的
- 💻 桌面应用 —— macOS / Windows 原生软件  
- 📱 移动应用 —— iOS / Android
- 🌐 Web 应用 —— 浏览器打开就能用
- 🧩 浏览器扩展 —— Chrome / Safari 插件
- 📦 库和 SDK —— 开发者用的
- 🤖 开源模型 —— 可部署的 AI 模型

每个工具还能按用途筛：AI 编程、AI 写作、AI 视频、效率工具、自部署……

## 数据从哪来

每天自动从 5 条线抓新工具：

| 来源 | 怎么抓 | 
|---|---|
| 🔥 GitHub Trending | 爬每日/每周趋势榜 |
| 🔍 Topic 搜索 | GitHub API 搜 20 个热门话题 |
| 📡 Hacker News | Show HN 帖子里的 GitHub 链接 |
| 📡 Reddit | r/coolgithubprojects 板块 RSS |
| 📚 公众号文章 | 从 Obsidian 笔记自动提取 |

不会重复——每个工具入库前都会去重验证。

## 怎么加新工具

在 `data/curated/` 新建一个文件：

```yaml
repo: owner/项目名
description: 一句话介绍
tags: [ai-coding, productivity]
```

Push 上去，自动出现在网站上。

## 技术相关

纯静态网站，GitHub Pages 免费托管。前端用 Astro + Tailwind CSS，数据是 YAML 和 JSON。GitHub Actions 每天定时跑发现脚本。

**想自己部署一套？** Fork 这个仓库，GitHub 自动帮你部署到 `你的用户名.github.io/trey-tools`。

---

[网站](https://treyxu23.github.io/trey-tools) · [Issues](https://github.com/treyxu23/trey-tools/issues) · MIT License
