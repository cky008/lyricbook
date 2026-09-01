import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "content/presets/index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
if (!Array.isArray(index) || index.length < 2)
  throw new Error("Preset index must contain at least two validation presets");

const ids = new Set();
let songCount = 0;
let setlistCount = 0;
let sourceCount = 0;
for (const entry of index) {
  if (!entry?.id || !entry?.path || !entry?.title) throw new Error("Invalid preset index entry");
  if (ids.has(entry.id)) throw new Error(`Duplicate preset id: ${entry.id}`);
  ids.add(entry.id);
  const projectPath = path.resolve(root, entry.path.replace(/^\.\//, ""));
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  if (project.schemaVersion !== 1) throw new Error(`${entry.id}: unsupported schemaVersion`);
  if (
    !Array.isArray(project.songs) ||
    !Array.isArray(project.setlists) ||
    !Array.isArray(project.themes)
  ) {
    throw new Error(`${entry.id}: missing songs, setlists, or themes`);
  }
  if (!Array.isArray(project.sources)) throw new Error(`${entry.id}: sources must be an array`);
  const sourceIds = new Set();
  for (const source of project.sources) {
    if (!source.id || sourceIds.has(source.id))
      throw new Error(`${entry.id}: duplicate or blank source id ${source.id}`);
    sourceIds.add(source.id);
    if (source.url && !/^https:\/\//.test(source.url))
      throw new Error(`${entry.id}/${source.id}: source URL must use HTTPS`);
    if (source.confidence != null && (source.confidence < 0 || source.confidence > 1)) {
      throw new Error(`${entry.id}/${source.id}: confidence must be between zero and one`);
    }
  }
  sourceCount += project.sources.length;

  const songIds = new Set();
  for (const song of project.songs) {
    if (!song.id || songIds.has(song.id))
      throw new Error(`${entry.id}: duplicate or blank song id ${song.id}`);
    songIds.add(song.id);
    songCount += 1;
    if (!song.titles || !Array.isArray(song.lyricVersions))
      throw new Error(`${entry.id}/${song.id}: invalid song`);
    const defaults = song.lyricVersions.filter((version) => version.isDefault).length;
    if (defaults > 1) throw new Error(`${entry.id}/${song.id}: multiple default versions`);
    for (const sourceRef of song.sourceRefs ?? []) {
      if (!sourceIds.has(sourceRef))
        throw new Error(`${entry.id}/${song.id}: missing source ${sourceRef}`);
    }
    for (const version of song.lyricVersions) {
      if (!version.id || !Array.isArray(version.tracks))
        throw new Error(`${entry.id}/${song.id}: invalid lyric version`);
      for (const track of version.tracks) {
        if (!track.language || !track.role)
          throw new Error(`${entry.id}/${song.id}/${version.id}: invalid lyric track`);
        if (String(track.text ?? "").trim()) {
          throw new Error(
            `${entry.id}/${song.id}/${version.id}: public presets must not include full lyric text`,
          );
        }
      }
    }
  }
  for (const setlist of project.setlists) {
    if (!setlist.id || !Array.isArray(setlist.items))
      throw new Error(`${entry.id}: invalid setlist`);
    setlistCount += 1;
    for (const item of setlist.items) {
      if (item.type === "song") {
        if (!songIds.has(item.songId))
          throw new Error(`${entry.id}/${setlist.id}: missing song ${item.songId}`);
        if (item.confidence != null && (item.confidence < 0 || item.confidence > 1)) {
          throw new Error(
            `${entry.id}/${setlist.id}/${item.songId}: confidence must be between zero and one`,
          );
        }
        for (const sourceRef of item.sourceRefs ?? []) {
          if (!sourceIds.has(sourceRef))
            throw new Error(`${entry.id}/${setlist.id}: missing source ${sourceRef}`);
        }
      }
    }
  }
  const themeIds = new Set(project.themes.map((theme) => theme.id));
  if (project.activeThemeId && !themeIds.has(project.activeThemeId))
    throw new Error(`${entry.id}: missing active theme`);
  const setlistIds = new Set(project.setlists.map((setlist) => setlist.id));
  if (project.activeSetlistId && !setlistIds.has(project.activeSetlistId))
    throw new Error(`${entry.id}: missing active setlist`);
}

const themeDirs = await readdir(path.join(root, "themes"), { withFileTypes: true });
for (const entry of themeDirs.filter((value) => value.isDirectory())) {
  const theme = JSON.parse(
    await readFile(path.join(root, "themes", entry.name, "theme.json"), "utf8"),
  );
  if (!theme.id || !theme.name || !theme.tokens?.accent || !theme.tokens?.background) {
    throw new Error(`Invalid standalone theme: ${entry.name}`);
  }
  const serialized = JSON.stringify(theme);
  if (/javascript:|<script|@import|url\s*\(/i.test(serialized))
    throw new Error(`Unsafe standalone theme: ${entry.name}`);
}

console.log(
  `Content validation passed: ${index.length} presets, ${songCount} songs, ${setlistCount} setlists, ${sourceCount} sources, and ${themeDirs.filter((value) => value.isDirectory()).length} safe themes.`,
);
