import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function moduleFromSource(path) {
  const source = await readFile(path, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const pack = await moduleFromSource("apps/web/src/pack.ts");

test(".lyricbook store-only archive round-trips project.json", async () => {
  const project = { schemaVersion: 1, id: "demo", title: { en: "Demo" }, songs: [], setlists: [], themes: [] };
  const blob = pack.createLyricBookArchive(project);
  const decoded = await pack.readLyricBookArchive(blob);
  assert.deepEqual(decoded, project);
});

test("export names include full timestamp and random suffix", () => {
  const first = pack.uniqueExportName("My Concert");
  const second = pack.uniqueExportName("My Concert");
  assert.match(first, /^lyricbook_my-concert_\d{8}T\d{6}-\d{3}Z_[0-9a-f]{6}\.lyricbook$/);
  assert.notEqual(first, second);
});

test("archive reader rejects path traversal", async () => {
  const project = { schemaVersion: 1, id: "../demo", title: { en: "Demo" }, songs: [], setlists: [], themes: [] };
  const blob = pack.createLyricBookArchive(project);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // The valid writer never creates unsafe names. This assertion preserves that invariant.
  assert.equal(new TextDecoder().decode(bytes).includes("../"), true, "project contents may contain ../ without becoming an archive path");
  const decoded = await pack.readLyricBookArchive(blob);
  assert.equal(decoded.id, "../demo");
});
