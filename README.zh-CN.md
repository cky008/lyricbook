# LyricBook

[![CI](https://github.com/cky008/lyricbook/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/cky008/lyricbook/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml/badge.svg?branch=main)](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml)
[![Full quality](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml)
[![Security](https://github.com/cky008/lyricbook/actions/workflows/security.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/security.yml)
[![License](https://img.shields.io/github/license/cky008/lyricbook)](LICENSE)

[English README](README.md) · [Roadmap](ROADMAP.md) · [贡献指南](CONTRIBUTING.md)

[**🌐 在线使用 LyricBook**](https://lyricbook.iocky.com/) · [GitHub Pages 备用地址](https://cky008.github.io/lyricbook/) · [查看 GitHub 仓库](https://github.com/cky008/lyricbook)

LyricBook 是一个隐私优先、本地优先的演唱会歌词本和打印工具。歌词默认保存在浏览器 IndexedDB 中；项目可以导出为 `.lyricbook` 文件，再在其他设备导入。

首个版本 `0.0.1` 已建立：

- 中英文界面与手动语言切换；
- 歌曲、多版本、原文与翻译的数据结构；
- 有分节或无分节歌单；
- 沉浸阅读、上一首／下一首和歌词末尾下一首入口；
- 安全的主题令牌编辑；
- `.lyricbook`、JSON、Markdown、TXT 和显式 HTTPS URL 导入；
- 带毫秒时间和随机后缀的导出文件名；
- A4、A5 浏览器打印基础版；
- G.E.M. GLORIA 与 DIOR 大颖伦敦预测元数据预设；
- Rust Core／WASM／CLI 源码；
- Node 单元测试、Playwright 测试源文件与 GitHub Pages CI/CD。

当前版本不会把未经授权的完整歌词放进公开仓库。原生 A4 对折自动拼版、LRC、云备份、AI 图片识别和自动检索仍在 Roadmap 中。

## 在线地址与状态

- 正式域名：**https://lyricbook.iocky.com/**
- GitHub Pages 备用地址：**https://cky008.github.io/lyricbook/**
- GitHub 仓库：**https://github.com/cky008/lyricbook**

页面顶部徽章分别显示 `develop` CI、`main` 正式部署、完整浏览器测试和定期安全检查的最新状态。

## 本地运行

```bash
npm ci
npm run check
npm run dev
```

打开 `http://127.0.0.1:4173`。

项目完整性检查会验证 `locales/`、`docs/`、静态资源、预设、README 链接和构建输入是否齐全，避免因为发布包漏文件而直到部署阶段才失败。

Copyright © 2026 iocky.com。除非文件另有说明，代码使用 Apache-2.0 许可证。
