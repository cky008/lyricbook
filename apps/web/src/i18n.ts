export const messages = {
  en: {
    library: "Library", setlist: "Setlist", theme: "Theme", import: "Import", export: "Export", print: "Print",
    search: "Search songs", lyrics: "Lyrics", translation: "Translation", emptyLyrics: "Paste lyrics you are allowed to use.",
    saveLocal: "Saved locally", immersive: "Immersive mode", previous: "Previous", next: "Next", nextSong: "Next song",
    choosePreset: "Choose preset", source: "Sources", confidence: "Confidence", optional: "Optional", editTheme: "Theme editor",
    accent: "Accent", background: "Background", surface: "Surface", text: "Text", close: "Close", load: "Load",
    noSong: "Select a song", github: "Star on GitHub", privacy: "Your lyrics stay in this browser unless you export them.",
    project: "Project", allSongs: "All songs", activeSetlist: "Active setlist", uploadHelp: "Upload .lyricbook, JSON, Markdown, or TXT.",
    exportHelp: "Exports include millisecond timestamps and a random suffix.", printHelp: "Use the browser print dialog to save PDF.",
    urlImport: "Import HTTPS URL", urlPlaceholder: "https://example.com/project.json", language: "Language"
  },
  zh: {
    library: "曲库", setlist: "歌单", theme: "主题", import: "导入", export: "导出", print: "打印",
    search: "搜索歌曲", lyrics: "歌词", translation: "翻译", emptyLyrics: "在此粘贴你有权使用的歌词。",
    saveLocal: "已保存到本机", immersive: "沉浸模式", previous: "上一首", next: "下一首", nextSong: "下一首",
    choosePreset: "选择预设", source: "来源", confidence: "置信度", optional: "可选", editTheme: "主题编辑器",
    accent: "强调色", background: "背景", surface: "卡片", text: "文字", close: "关闭", load: "载入",
    noSong: "请选择歌曲", github: "在 GitHub 点 Star", privacy: "歌词默认只保存在当前浏览器，除非你主动导出。",
    project: "项目", allSongs: "全部歌曲", activeSetlist: "当前歌单", uploadHelp: "支持 .lyricbook、JSON、Markdown 或 TXT。",
    exportHelp: "导出文件含毫秒时间与随机后缀，不会反复出现 (1)(2)。", printHelp: "通过系统打印对话框保存为 PDF。",
    urlImport: "导入 HTTPS 链接", urlPlaceholder: "https://example.com/project.json", language: "语言"
  }
};

export function detectLanguage() {
  const saved = localStorage.getItem("lyricbook-ui-language");
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}
