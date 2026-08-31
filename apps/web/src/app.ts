import { createLyricBookArchive, downloadBlob, readLyricBookArchive, uniqueExportName } from "./pack.js";
import { loadProject, replaceProjectAtomically, saveProject } from "./storage.js";
import { detectLanguage, messages } from "./i18n.js";

const React = window.React;
const ReactDOM = window.ReactDOM;
const h = React.createElement;

const EMPTY_PROJECT = {
  schemaVersion: 1,
  id: "untitled-project",
  title: { "zh-Hans": "未命名歌词本", en: "Untitled LyricBook" },
  songs: [], setlists: [], themes: [], activeSetlistId: null, activeThemeId: null, sources: []
};

function localized(value, lang) {
  if (!value) return "";
  return lang === "zh" ? (value["zh-Hans"] || value.en || "") : (value.en || value["zh-Hans"] || "");
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function songMap(project) { return new Map((project.songs || []).map(song => [song.id, song])); }
function activeSetlist(project) { return (project.setlists || []).find(item => item.id === project.activeSetlistId) || project.setlists?.[0] || null; }
function activeTheme(project) { return (project.themes || []).find(item => item.id === project.activeThemeId) || project.themes?.[0] || null; }
function setlistSongs(project) {
  const map = songMap(project);
  const setlist = activeSetlist(project);
  if (!setlist) return project.songs || [];
  return setlist.items.filter(item => item.type === "song").map(item => map.get(item.songId)).filter(Boolean);
}
function defaultVersion(song) {
  return song?.lyricVersions?.find(version => version.isDefault) || song?.lyricVersions?.[0] || null;
}
function trackOf(version, role) { return version?.tracks?.find(track => track.role === role) || null; }
function ensureVersion(song) {
  if (!song.lyricVersions?.length) {
    song.lyricVersions = [{ id: "default", label: { "zh-Hans": "默认版", en: "Default" }, kind: "studio", isDefault: true, tracks: [] }];
  }
  const version = defaultVersion(song);
  if (!trackOf(version, "original")) version.tracks.push({ language: "und", role: "original", text: "" });
  if (!trackOf(version, "translation")) version.tracks.push({ language: "zh-Hans", role: "translation", text: "", alignedTo: "original" });
  return version;
}
function validateProject(project) {
  if (!project || project.schemaVersion !== 1 || !project.id || !Array.isArray(project.songs) || !Array.isArray(project.setlists)) throw new Error("Unsupported or invalid LyricBook project.");
  const ids = new Set();
  for (const song of project.songs) {
    if (!song.id || ids.has(song.id)) throw new Error(`Duplicate or empty song id: ${song.id || "(empty)"}`);
    ids.add(song.id);
  }
  for (const setlist of project.setlists) for (const item of setlist.items || []) if (item.type === "song" && !ids.has(item.songId)) throw new Error(`Setlist references missing song: ${item.songId}`);
  return project;
}
function slugify(value) { return String(value || "song").normalize("NFKD").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || `song-${Date.now()}`; }
function parseSimpleSetlist(text, project) {
  const next = clone(project);
  const byName = new Map();
  for (const song of next.songs) {
    for (const name of [song.titles?.["zh-Hans"], song.titles?.en, ...(song.aliases || [])].filter(Boolean)) byName.set(name.trim().toLowerCase(), song);
  }
  const items = [];
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
  for (const raw of lines) {
    if (/^#{1,6}\s+/.test(raw) || /^\[(.+)]$/.test(raw)) {
      const label = raw.replace(/^#{1,6}\s+/, "").replace(/^\[|]$/g, "");
      items.push({ type: "section", label: { "zh-Hans": label, en: label }, optional: false });
      continue;
    }
    const title = raw.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (!title) continue;
    let song = byName.get(title.toLowerCase());
    if (!song) {
      let id = `song-${slugify(title)}`;
      let serial = 2;
      while (next.songs.some(candidate => candidate.id === id)) id = `song-${slugify(title)}-${serial++}`;
      song = { id, titles: { "zh-Hans": title, en: title }, aliases: [], tags: ["imported"], sourceRefs: [], lyricVersions: [] };
      ensureVersion(song);
      next.songs.push(song);
      byName.set(title.toLowerCase(), song);
    }
    items.push({ type: "song", songId: song.id, optional: false, confidence: 1 });
  }
  const setlist = { id: `setlist-${Date.now()}`, title: { "zh-Hans": "导入歌单", en: "Imported Setlist" }, status: "custom", items };
  next.setlists.push(setlist);
  next.activeSetlistId = setlist.id;
  return next;
}
function applyTheme(theme) {
  const tokens = theme?.tokens || {};
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) if (["accent", "background", "surface", "text", "radius"].includes(key)) root.style.setProperty(`--${key}`, String(value));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && tokens.background) meta.setAttribute("content", tokens.background);
}
function lockBody(locked) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, project: EMPTY_PROJECT, presets: [], selectedSongId: null, lang: detectLanguage(), query: "", tab: "edit", sidebar: false, modal: null, immersive: false, toast: "", showTranslation: true, printSize: "a4", url: "" };
    this.saveTimer = null;
    this.fileInput = React.createRef();
  }
  async componentDidMount() {
    try {
      const presets = await fetch("./content/presets/index.json").then(response => response.json());
      let project = await loadProject();
      if (!project) project = await fetch(presets[0].path).then(response => response.json());
      validateProject(project);
      const selectedSongId = setlistSongs(project)[0]?.id || project.songs?.[0]?.id || null;
      applyTheme(activeTheme(project));
      this.setState({ loading: false, presets, project, selectedSongId });
    } catch (error) {
      console.error(error);
      this.setState({ loading: false, project: clone(EMPTY_PROJECT), toast: String(error.message || error) });
    }
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  componentWillUnmount() { lockBody(false); }
  t = key => messages[this.state.lang][key] || key;
  notify = text => { this.setState({ toast: text }); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.setState({ toast: "" }), 2600); };
  persist(project, message) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => saveProject(project).then(() => message && this.notify(message)).catch(error => this.notify(error.message)), 180);
  }
  updateProject(mutator, message = "") {
    const project = clone(this.state.project);
    mutator(project);
    applyTheme(activeTheme(project));
    this.setState({ project });
    this.persist(project, message);
  }
  openModal(modal) { lockBody(true); this.setState({ modal, sidebar: false }); }
  closeModal() { lockBody(this.state.immersive); this.setState({ modal: null }); }
  toggleImmersive(value) { lockBody(value || Boolean(this.state.modal)); this.setState({ immersive: value, sidebar: false }, () => value && window.scrollTo(0, 0)); }
  async loadPreset(path) {
    try {
      const project = validateProject(await fetch(path).then(response => response.json()));
      await replaceProjectAtomically(project);
      applyTheme(activeTheme(project));
      this.setState({ project, selectedSongId: setlistSongs(project)[0]?.id || project.songs[0]?.id || null, modal: null });
      lockBody(false);
      this.notify(this.t("saveLocal"));
    } catch (error) { this.notify(error.message); }
  }
  selectSong(id) { this.setState({ selectedSongId: id, sidebar: false }); }
  updateTrack(role, text) {
    this.updateProject(project => {
      const song = project.songs.find(item => item.id === this.state.selectedSongId);
      if (!song) return;
      const version = ensureVersion(song);
      const track = trackOf(version, role);
      track.text = text;
    });
  }
  async importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      let project;
      if (file.name.toLowerCase().endsWith(".lyricbook")) project = await readLyricBookArchive(file);
      else {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) project = JSON.parse(text);
        else project = parseSimpleSetlist(text, this.state.project);
      }
      validateProject(project);
      await replaceProjectAtomically(project);
      applyTheme(activeTheme(project));
      this.setState({ project, selectedSongId: setlistSongs(project)[0]?.id || project.songs[0]?.id || null, modal: null });
      lockBody(false);
      this.notify(this.t("saveLocal"));
    } catch (error) { this.notify(error.message); }
  }
  async importUrl() {
    try {
      const url = new URL(this.state.url);
      if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed.");
      const response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get("content-length") || 0) > 10_000_000) throw new Error("Remote project is too large.");
      const project = validateProject(await response.json());
      await replaceProjectAtomically(project);
      applyTheme(activeTheme(project));
      this.setState({ project, selectedSongId: setlistSongs(project)[0]?.id || project.songs[0]?.id || null, modal: null, url: "" });
      lockBody(false);
      this.notify(this.t("saveLocal"));
    } catch (error) { this.notify(error.message); }
  }
  exportProject() {
    const blob = createLyricBookArchive(this.state.project);
    downloadBlob(blob, uniqueExportName(this.state.project.id));
    this.notify(this.t("exportHelp"));
  }
  print() {
    document.body.dataset.printSize = this.state.printSize === "booklet" ? "a5" : this.state.printSize;
    this.closeModal();
    setTimeout(() => window.print(), 100);
  }
  move(direction) {
    const songs = setlistSongs(this.state.project);
    const index = songs.findIndex(song => song.id === this.state.selectedSongId);
    const next = songs[index + direction];
    if (next) this.setState({ selectedSongId: next.id }, () => document.querySelector(".immersive")?.scrollTo({ top: 0, behavior: "smooth" }));
  }
  renderHeader() {
    const title = localized(this.state.project.title, this.state.lang);
    return h("header", { className: "topbar" },
      h("button", { className: "icon-button mobile-only", onClick: () => this.setState({ sidebar: true }) }, "☰"),
      h("div", { className: "brand" }, h("div", { className: "brand-mark" }, "L"), h("div", { className: "brand-copy" }, h("h1", { className: "brand-title" }, "LyricBook"), h("div", { className: "brand-subtitle" }, title))),
      h("div", { className: "toolbar" },
        h("button", { className: "button ghost", onClick: () => { const lang = this.state.lang === "zh" ? "en" : "zh"; localStorage.setItem("lyricbook-ui-language", lang); this.setState({ lang }); } }, this.state.lang === "zh" ? "EN" : "中文"),
        h("a", { className: "icon-button", href: "https://github.com/cky008/lyricbook", target: "_blank", rel: "noopener noreferrer", title: this.t("github") }, "★"),
        h("button", { className: "button primary", onClick: () => this.openModal("print") }, h("span", { className: "label" }, this.t("print")), " ↗")
      )
    );
  }
  renderLibrary() {
    const query = this.state.query.toLowerCase();
    const songs = (this.state.project.songs || []).filter(song => [localized(song.titles, this.state.lang), ...(song.aliases || []), ...(song.tags || [])].join(" ").toLowerCase().includes(query));
    return h("aside", { className: `panel sidebar ${this.state.sidebar ? "open" : ""}` },
      h("div", { className: "panel-head" },
        h("div", { className: "panel-kicker" }, this.t("project")),
        h("h2", { className: "panel-title" }, `${this.t("library")} · ${songs.length}`),
        h("input", { className: "search", value: this.state.query, placeholder: this.t("search"), onChange: event => this.setState({ query: event.target.value }) })
      ),
      h("div", { className: "song-list" }, songs.map((song, index) => h("button", { key: song.id, className: `song-row ${song.id === this.state.selectedSongId ? "active" : ""}`, onClick: () => this.selectSong(song.id) },
        h("span", { className: "song-index" }, String(index + 1).padStart(2, "0")),
        h("span", null, h("div", { className: "song-name" }, localized(song.titles, this.state.lang)), h("div", { className: "song-meta" }, (song.tags || []).join(" · ") || localized(song.titles, this.state.lang === "zh" ? "en" : "zh")))
      )))
    );
  }
  renderMain() {
    const song = this.state.project.songs.find(item => item.id === this.state.selectedSongId);
    if (!song) return h("main", { className: "panel main empty" }, this.t("noSong"));
    const version = defaultVersion(song) || ensureVersion(song);
    const original = trackOf(version, "original")?.text || "";
    const translation = trackOf(version, "translation")?.text || "";
    const multiple = song.lyricVersions?.length > 1;
    return h("main", { className: "panel main" },
      h("section", { className: "hero" }, h("div", { className: "hero-content" },
        h("div", { className: "eyebrow" }, `${this.t("activeSetlist")} · ${localized(activeSetlist(this.state.project)?.title, this.state.lang) || this.t("allSongs")}`),
        h("h2", { className: "song-title" }, localized(song.titles, this.state.lang)),
        h("div", { className: "song-alias" }, localized(song.titles, this.state.lang === "zh" ? "en" : "zh") || (song.aliases || []).join(" · ")),
        h("div", { className: "tags" }, multiple && h("span", { className: "tag" }, `${song.lyricVersions.length} versions`), ...(song.tags || []).map(tag => h("span", { key: tag, className: "tag" }, tag)))
      )),
      h("div", { className: "editor-tabs" },
        h("button", { className: `tab ${this.state.tab === "edit" ? "active" : ""}`, onClick: () => this.setState({ tab: "edit" }) }, this.state.lang === "zh" ? "编辑" : "Edit"),
        h("button", { className: `tab ${this.state.tab === "read" ? "active" : ""}`, onClick: () => this.setState({ tab: "read" }) }, this.state.lang === "zh" ? "阅读" : "Read"),
        h("button", { className: "tab", onClick: () => this.toggleImmersive(true) }, this.t("immersive"))
      ),
      h("section", { className: "editor" }, this.state.tab === "edit" ?
        h("div", { className: "track-grid" },
          h("div", { className: "track-card" }, h("div", { className: "track-label" }, this.t("lyrics")), h("textarea", { className: "lyric-textarea", value: original, placeholder: this.t("emptyLyrics"), onChange: event => this.updateTrack("original", event.target.value) })),
          h("div", { className: `track-card translation ${this.state.showTranslation ? "visible" : ""}` }, h("div", { className: "track-label" }, this.t("translation")), h("textarea", { className: "lyric-textarea", value: translation, placeholder: this.t("translation"), onChange: event => this.updateTrack("translation", event.target.value) }))
        ) : h("div", { className: "track-grid" },
          h("div", { className: "reader-text" }, original || this.t("emptyLyrics")),
          translation && h("div", { className: "reader-text" }, translation)
        )
      )
    );
  }
  renderSetlist() {
    const setlist = activeSetlist(this.state.project);
    const map = songMap(this.state.project);
    let number = 0;
    return h("aside", { className: "panel right-panel" },
      h("div", { className: "panel-head" }, h("div", { className: "panel-kicker" }, this.t("setlist")), h("h2", { className: "panel-title" }, localized(setlist?.title, this.state.lang) || this.t("allSongs"))),
      setlist ? setlist.items.map((item, index) => {
        if (item.type === "section") return h("div", { key: `section-${index}`, className: "setlist-section" }, localized(item.label, this.state.lang));
        if (item.type !== "song") return null;
        number += 1; const song = map.get(item.songId); if (!song) return null;
        return h("div", { key: `${item.songId}-${index}`, className: `setlist-item song ${item.songId === this.state.selectedSongId ? "current" : ""}`, onClick: () => this.selectSong(item.songId) }, h("span", { className: "setlist-number" }, number), h("span", null, localized(song.titles, this.state.lang), item.optional && h("span", { className: "tag", style: { marginLeft: "7px" } }, this.t("optional"))));
      }) : null,
      h("div", { className: "action-stack" },
        h("button", { className: "button", onClick: () => this.openModal("presets") }, `✦ ${this.t("choosePreset")}`),
        h("button", { className: "button", onClick: () => this.openModal("theme") }, `◐ ${this.t("editTheme")}`),
        h("button", { className: "button", onClick: () => this.fileInput.current?.click() }, `↑ ${this.t("import")}`),
        h("button", { className: "button", onClick: () => this.exportProject() }, `↓ ${this.t("export")}`),
        h("input", { ref: this.fileInput, className: "sr-only", type: "file", accept: ".lyricbook,.json,.md,.txt", onChange: event => this.importFile(event) })
      ),
      h("div", { className: "notice" }, this.t("privacy"))
    );
  }
  renderModal() {
    if (!this.state.modal) return null;
    const close = event => { if (event.target === event.currentTarget) this.closeModal(); };
    let content;
    if (this.state.modal === "presets") content = h(React.Fragment, null,
      h("h2", null, this.t("choosePreset")), h("p", { className: "song-alias" }, this.state.lang === "zh" ? "内置快照离线可用；载入前当前项目会保留在本地备份中。" : "Built-in snapshots work offline. The current project is retained before replacement."),
      h("div", { className: "preset-grid" }, this.state.presets.map(preset => h("button", { key: preset.id, className: "preset", onClick: () => this.loadPreset(preset.path) }, h("strong", null, localized(preset.title, this.state.lang)), h("div", { className: "song-meta" }, preset.id))))
    );
    if (this.state.modal === "theme") {
      const theme = activeTheme(this.state.project) || { id: "custom", name: { en: "Custom", "zh-Hans": "自定义" }, tokens: { accent: "#8f67ff", background: "#17132b", surface: "#25203a", text: "#f9f7ff", radius: "22px" } };
      const colorFields = ["accent", "background", "surface", "text"].map(key =>
        h("label", { className: "field", key },
          this.t(key),
          h("input", {
            className: "color-input",
            type: "color",
            value: theme.tokens[key],
            onChange: event => this.updateProject(project => {
              let target = activeTheme(project);
              if (!target) {
                target = clone(theme);
                project.themes.push(target);
                project.activeThemeId = target.id;
              }
              target.tokens[key] = event.target.value;
            })
          })
        )
      );
      content = h(React.Fragment, null,
        h("h2", null, this.t("editTheme")),
        h("div", { className: "modal-grid" }, ...colorFields)
      );
    }
    if (this.state.modal === "import") content = h(React.Fragment, null,
      h("h2", null, this.t("import")), h("p", { className: "song-alias" }, this.t("uploadHelp")),
      h("button", { className: "button primary", onClick: () => this.fileInput.current?.click() }, this.state.lang === "zh" ? "选择文件" : "Choose file"),
      h("div", { className: "modal-grid" }, h("label", { className: "field", style: { gridColumn: "1/-1" } }, this.t("urlImport"), h("input", { value: this.state.url, placeholder: this.t("urlPlaceholder"), onChange: event => this.setState({ url: event.target.value }) }))),
      h("div", { className: "modal-actions" }, h("button", { className: "button", onClick: () => this.importUrl() }, this.t("load")))
    );
    if (this.state.modal === "print") content = h(React.Fragment, null,
      h("h2", null, this.t("print")), h("p", { className: "song-alias" }, this.t("printHelp")),
      h("div", { className: "modal-grid" }, h("label", { className: "field" }, this.state.lang === "zh" ? "版式" : "Layout", h("select", { value: this.state.printSize, onChange: event => this.setState({ printSize: event.target.value }) }, h("option", { value: "a4" }, "A4"), h("option", { value: "a5" }, "A5"), h("option", { value: "booklet" }, this.state.lang === "zh" ? "A4 对折（A5逻辑页）" : "Booklet (A5 logical pages)")))),
      h("div", { className: "notice", style: { margin: "18px 0 0" } }, this.state.lang === "zh" ? "首版通过浏览器打印生成 PDF；对折版请在打印机中使用小册子或每张两页设置。原生自动拼版列入后续打印引擎迭代。" : "v0.0.1 prints through the browser. For booklets, use your printer's booklet or two-pages-per-sheet option. Native imposition remains on the print-engine roadmap."),
      h("div", { className: "modal-actions" }, h("button", { className: "button primary", onClick: () => this.print() }, this.t("print")))
    );
    return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: close }, h("section", { className: "modal", role: "dialog", "aria-modal": "true" }, content, h("div", { className: "modal-actions" }, h("button", { className: "button ghost", onClick: () => this.closeModal() }, this.t("close")))));
  }
  renderImmersive() {
    if (!this.state.immersive) return null;
    const songs = setlistSongs(this.state.project); const index = songs.findIndex(song => song.id === this.state.selectedSongId); const song = songs[index] || this.state.project.songs.find(item => item.id === this.state.selectedSongId); if (!song) return null;
    const text = trackOf(defaultVersion(song), "original")?.text || this.t("emptyLyrics"); const next = songs[index + 1];
    return h("section", { className: "immersive" },
      h("header", { className: "immersive-head" }, h("button", { className: "icon-button", onClick: () => this.toggleImmersive(false) }, "×"), h("div", null, h("strong", null, localized(song.titles, this.state.lang)), h("div", { className: "song-meta" }, `${index + 1} / ${songs.length}`))),
      h("div", { className: "immersive-body" }, h("h1", null, localized(song.titles, this.state.lang)), h("div", { className: "immersive-text" }, text), next && h("button", { className: "next-card", onClick: () => this.move(1) }, h("div", { className: "eyebrow" }, this.t("nextSong")), h("h2", null, localized(next.titles, this.state.lang)))),
      h("nav", { className: "immersive-nav" }, h("button", { className: "button", disabled: index <= 0, onClick: () => this.move(-1) }, `← ${this.t("previous")}`), h("button", { className: "button primary", disabled: index >= songs.length - 1, onClick: () => this.move(1) }, `${this.t("next")} →`))
    );
  }
  renderPrint() {
    const songs = setlistSongs(this.state.project); const setlist = activeSetlist(this.state.project);
    return h("section", { className: "print-root" },
      h("article", { className: "print-page" }, h("h1", { className: "print-title" }, localized(this.state.project.title, this.state.lang)), h("div", { className: "print-meta" }, localized(setlist?.title, this.state.lang) || this.t("allSongs")), h("div", { className: "print-toc" }, songs.map((song,index) => h("a", { key: song.id, href: `#print-${song.id}` }, h("span", null, `${index + 1}. ${localized(song.titles, this.state.lang)}`), h("span", null, "→")))), h("footer", { className: "print-footer" }, h("span", null, "LyricBook"), h("span", null, "iocky.com"))),
      ...songs.map((song,index) => { const version = defaultVersion(song); const original = trackOf(version,"original")?.text || this.t("emptyLyrics"); const translation = trackOf(version,"translation")?.text || ""; return h("article", { id:`print-${song.id}`, key:song.id, className:"print-page" }, h("h2", { className:"print-title" }, localized(song.titles,this.state.lang)), h("div", { className:"print-meta" }, localized(setlist?.title,this.state.lang)), h("div", { className:"print-columns" }, original, translation ? `\n\n${this.t("translation")}\n${translation}` : ""), h("footer", { className:"print-footer" }, h("span", null, `${index+1} · ${localized(song.titles,this.state.lang)}`), h("span", null, "iocky.com"))); })
    );
  }
  render() {
    if (this.state.loading) return h("div", { className: "empty", style: { minHeight: "100vh" } }, "LyricBook…");
    return h(React.Fragment, null,
      h("div", { className: "app" }, this.renderHeader(), h("div", { className: "layout" }, this.renderLibrary(), this.renderMain(), this.renderSetlist()), h("footer", { className: "footer" }, "LyricBook 0.0.1 · Copyright © 2026 iocky.com")),
      this.state.sidebar && h("div", { className:"modal-backdrop", style:{zIndex:70,background:"rgba(0,0,0,.38)"}, onMouseDown:()=>this.setState({sidebar:false}) }),
      this.renderModal(), this.renderImmersive(), this.renderPrint(), this.state.toast && h("div", { className: "toast" }, this.state.toast),
      h("input", { ref: this.fileInput, className: "sr-only", type: "file", accept: ".lyricbook,.json,.md,.txt", onChange: event => this.importFile(event) })
    );
  }
}

ReactDOM.render(h(App), document.getElementById("root"));
