import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = JSON.parse(await readFile("content/presets/index.json", "utf8"));

test("ships two independently themed validation presets", () => {
  assert.deepEqual(index.map(item => item.id), ["gem-gloria", "dior-kampung-girl-london"]);
});

for (const entry of index) {
  test(`${entry.id} has valid references and no bundled lyrics`, async () => {
    const project = JSON.parse(await readFile(entry.path.replace(/^\.\//, ""), "utf8"));
    const ids = new Set(project.songs.map(song => song.id));
    assert.equal(ids.size, project.songs.length);
    for (const setlist of project.setlists) for (const item of setlist.items) if (item.type === "song") assert.ok(ids.has(item.songId));
    const text = project.songs.flatMap(song => song.lyricVersions || []).flatMap(version => version.tracks || []).map(track => track.text).join("");
    assert.equal(text, "");
  });
}
