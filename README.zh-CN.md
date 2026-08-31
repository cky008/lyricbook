# LyricBook

[![CI](https://github.com/cky008/lyricbook/actions/workflows/ci.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml)
[![Full quality](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml)
[![Security](https://github.com/cky008/lyricbook/actions/workflows/security.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/security.yml)

[English README](README.md) · [🌐 在线使用 LyricBook](https://lyricbook.iocky.com/) · [GitHub Pages 备用地址](https://cky008.github.io/lyricbook/) · [路线图](ROADMAP.md)

LyricBook 是一个**隐私优先、本地优先、无需后端**的演唱会歌词本编辑器、沉浸式歌单阅读器和实体歌词本／PDF 生成器。

> **0.0.3 是现代技术栈重置版本。** 项目使用 React 19.2.8、React DOM 19.2.8、Vite 8.2.2、TypeScript 7.0.2、Tailwind CSS 4.3.3、Rust 1.98.0、Vitest 4.1.11 和 Playwright 1.62.1；不再包含 React 16、本地 vendor React 或 `window.React` 兼容层。

## 主要功能

- 自动根据浏览器语言选择中文／英文，也可随时手动切换。
- 项目保存在 IndexedDB；替换项目前自动创建本机备份。
- 支持 `.lyricbook`、JSON、Markdown、TXT、安全主题 JSON 和用户主动输入的 HTTPS 链接。
- 导出文件名包含 UTC 毫秒时间和随机后缀，同一天多次保存不会出现 `(1)(2)`。
- 一首歌支持多个歌词版本；每个版本支持原文、翻译、音译和改编轨道。
- 演唱会小节是可选项，没有 Part 的纯歌曲顺序也完全合法。
- 所有设备支持上移／下移；iOS 原生长按拖拽列入后续路线图。
- 沉浸模式按当前歌单切换上一首／下一首；歌词底部直接显示下一首卡片。
- 支持 A4、A5、A4 对折小册、目录跳转、页码安全区和动态字号。
- 内置 G.E.M. GLORIA 与 DIOR 大颖伦敦预测元数据／主题验证包，不内置未经授权的完整歌词。

## 本地运行

需要：

```text
Node.js 26.8.1
npm 12.0.2
Rust 1.98.0
wasm-pack 0.15.0（构建 WASM 时）
```

```bash
npm install
npm run build:wasm
npm run check
npm run dev
```

第一次执行 `npm install` 会生成 `package-lock.json`，再执行 `cargo generate-lockfile` 生成 `Cargo.lock`；请立即提交这两个锁文件。工作流只为“整仓覆盖的第一个提交”保留一次性兜底，正常受保护流程会使用 `npm ci` 和 Cargo 锁文件。

完整使用说明见：

- [用户指南](docs/zh-CN/USER_GUIDE.md)
- [打印与装订指南](docs/zh-CN/PRINTING_GUIDE.md)
- [部署指南](docs/DEPLOYMENT.md)
- [路线图](ROADMAP.md)

## 隐私与版权

歌词默认只保存在浏览器中。仓库不得提交私人歌词备份、带歌词 `.lyricbook`、含歌词 HTML 或私人 PDF。请仅导入、翻译和打印你有权使用的内容。

Copyright © 2026 iocky.com. 代码使用 Apache-2.0 许可证。
