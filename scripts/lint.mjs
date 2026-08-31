import { readFile } from "node:fs/promises";
import path from "node:path";
const files = ["apps/web/src/app.ts", "apps/web/src/pack.ts", "apps/web/src/storage.ts", "apps/web/src/i18n.ts", "scripts/build.mjs"];
let failed = false;
for (const file of files) {
  const text = await readFile(path.resolve(file), "utf8");
  if (/\beval\s*\(/.test(text) || /innerHTML\s*=/.test(text) || /document\.write\s*\(/.test(text)) {
    console.error(`Unsafe browser pattern in ${file}`); failed = true;
  }
  if (/\t/.test(text)) { console.error(`Tab character in ${file}`); failed = true; }
  if (text.split("\n").some(line => /[ \t]+$/.test(line))) { console.error(`Trailing whitespace in ${file}`); failed = true; }
}
if (failed) process.exit(1);
console.log(`Lint passed (${files.length} files; no eval, innerHTML, document.write, tabs, or trailing whitespace).`);
