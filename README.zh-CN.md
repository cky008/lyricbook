# LyricBook

[![CI](https://github.com/cky008/lyricbook/actions/workflows/ci.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/deploy-pages.yml)
[![Full quality](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/full-quality.yml)
[![Security](https://github.com/cky008/lyricbook/actions/workflows/security.yml/badge.svg)](https://github.com/cky008/lyricbook/actions/workflows/security.yml)

[English README](README.md) · [🌐 在线使用 LyricBook](https://lyricbook.iocky.com/) · [GitHub Pages 备用地址](https://cky008.github.io/lyricbook/) · [路线图](ROADMAP.md)

LyricBook 是一个**隐私优先、本地优先、无需后端**的演唱会歌词本编辑器、沉浸式歌单阅读器和实体歌词本／PDF 生成器。

> **0.0.8 在可靠打印基础上带来新的工作区选择。** 可随时切换“现代工作室”与“雅集书房”，项目主题、实测分页和 PDF 输出保持一致。

## 主要功能

- 自动根据浏览器语言选择中文／英文，也可随时手动切换。
- 项目保存在 IndexedDB；替换项目前自动创建本机备份。
- 支持 `.lyricbook`、JSON、Markdown、TXT、安全主题 JSON 和用户主动输入的 HTTPS 链接。
- 导出文件使用唯一名称，方便连续保存。
- 一首歌支持多个歌词版本；每个版本支持原文、翻译、音译和改编轨道。
- 演唱会小节是可选项，没有 Part 的纯歌曲顺序也完全合法。
- 歌单可在结构化编辑和无损 Markdown 编辑之间自行切换。
- 提供影棚岩灰、墨玉、青花、朱砂绢、月白宣纸五套离线精选主题，各自拥有不同字体、留白、卡片质感和打印配色。
- 可在熟悉的“现代工作室”与纸页感更强的“雅集书房”之间切换；界面风格只保存在当前浏览器。
- 精选主题原版保持只读；复制到当前项目后即可按需自定义，并随项目备份一起导出。
- 所有设备支持上移／下移；iOS 原生长按拖拽列入后续路线图。
- 沉浸模式按当前歌单切换上一首／下一首；歌词底部直接显示下一首卡片。
- 可按本地化歌名打开 Apple Music 与 YouTube 搜索；不会把歌词、别名或标签发送给这些服务。
- 支持实测排版的 A4、A5、A4 对折小册、双语独立分页、目录跳转、可选歌曲标识、页码安全区和动态字号。
- 长歌词不安全时会按段落或行重新分页而不裁切；严格页数模式只有在所有页面校验安全后才允许打印。
- 对折小册可使用随主题配色的系统生成封面、本地图片封面或图片＋系统文字；图片只在浏览器本地处理，绝不上传。
- 窄屏和 iOS 顶栏保留常用操作，其余操作收纳在可访问的“更多操作”菜单中。
- 离线缓存按构建隔离，普通刷新会优先获取当前页面，避免旧资源哈希导致空白页。
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
npm ci
npm run build:wasm
npm run check
npm run dev
```

请使用 `npm ci`，确保本地安装与已提交的锁文件一致。

完整使用说明见：

- [用户指南](docs/zh-CN/USER_GUIDE.md)
- [打印与装订指南](docs/zh-CN/PRINTING_GUIDE.md)
- [部署指南](docs/DEPLOYMENT.md)
- [路线图](ROADMAP.md)

## 隐私与版权

歌词默认只保存在浏览器中。仓库不得提交私人歌词备份、带歌词 `.lyricbook`、含歌词 HTML 或私人 PDF。请仅导入、翻译和打印你有权使用的内容。

Copyright © 2026 iocky.com. 代码使用 Apache-2.0 许可证。
