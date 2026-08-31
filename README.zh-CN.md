# LyricBook

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

## 本地运行

```bash
npm ci
npm run check
npm run dev
```

打开 `http://127.0.0.1:4173`。

计划部署域名：`https://lyricbook.iocky.com`
