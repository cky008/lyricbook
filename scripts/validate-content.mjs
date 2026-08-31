import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const index = JSON.parse(await readFile("content/presets/index.json", "utf8"));
if (!Array.isArray(index) || index.length < 2) throw new Error("At least two presets are required.");
for (const entry of index) {
  const diskPath = entry.path.replace(/^\.\//, "");
  const project = JSON.parse(await readFile(diskPath, "utf8"));
  if (project.schemaVersion !== 1 || project.id !== entry.id) throw new Error(`Invalid preset ${entry.id}`);
  const songIds = new Set();
  for (const song of project.songs || []) {
    if (!song.id || songIds.has(song.id)) throw new Error(`Duplicate song ${song.id} in ${entry.id}`);
    songIds.add(song.id);
    for (const version of song.lyricVersions || []) for (const track of version.tracks || []) if (track.text) throw new Error(`Public preset contains lyric text: ${entry.id}/${song.id}`);
  }
  for (const setlist of project.setlists || []) for (const item of setlist.items || []) if (item.type === "song" && !songIds.has(item.songId)) throw new Error(`Missing ${item.songId} in ${entry.id}`);
}
const suspicious = (await readdir(".")).filter(name => /backup|含歌词|private.*lyric/i.test(name));
if (suspicious.length) throw new Error(`Suspicious private files in repository root: ${suspicious.join(", ")}`);
console.log(`Content validation passed (${index.length} presets, no bundled lyric text).`);
