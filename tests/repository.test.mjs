import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const buildInputs = [
  "apps/web/public",
  "content",
  "themes",
  "locales",
  "apps/web/src/app.ts",
  "apps/web/src/pack.ts",
  "apps/web/src/storage.ts",
  "apps/web/src/i18n.ts",
  "apps/web/src/app.css"
];

test("every production-build input is present", async () => {
  for (const path of buildInputs) {
    const info = await stat(path);
    assert.ok(info.isFile() || info.isDirectory(), path);
  }
});

test("repository completeness validator passes", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-repository.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Repository validation passed/);
});

test("English and Chinese locale files expose the same keys", async () => {
  const keySet = source => new Set(source.split(/\r?\n/).map(line => line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=/)?.[1]).filter(Boolean));
  const [english, chinese] = await Promise.all([
    readFile("locales/en-US/main.ftl", "utf8"),
    readFile("locales/zh-CN/main.ftl", "utf8")
  ]);
  assert.deepEqual([...keySet(english)].sort(), [...keySet(chinese)].sort());
});

test("README advertises the live site, repository and workflow status", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /https:\/\/lyricbook\.iocky\.com\//);
  assert.match(readme, /https:\/\/github\.com\/cky008\/lyricbook/);
  assert.match(readme, /actions\/workflows\/ci\.yml\/badge\.svg/);
  assert.match(readme, /actions\/workflows\/deploy-pages\.yml\/badge\.svg/);
});
