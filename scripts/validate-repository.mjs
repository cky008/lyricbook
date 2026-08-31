import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-pages.yml",
  "apps/web/public/index.html",
  "apps/web/public/vendor/react.production.min.js",
  "apps/web/public/vendor/react-dom.production.min.js",
  "apps/web/src/app.ts",
  "apps/web/src/app.css",
  "content/presets/index.json",
  "themes/default/theme.json",
  "locales/en-US/main.ftl",
  "locales/zh-CN/main.ftl",
  "docs/PRODUCT_REQUIREMENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/CONTENT_PACK_SPEC.md",
  "docs/THEME_SPEC.md",
  "docs/PRINT_ENGINE.md",
  "docs/TESTING.md",
  "docs/DEPLOYMENT.md",
  "docs/SECURITY.md",
  "docs/AI_SETLIST_RESEARCH.md",
  "docs/MIGRATING_FROM_GEM.md",
  "docs/zh-CN/USER_GUIDE.md",
  "docs/zh-CN/PRINTING_GUIDE.md",
  "README.md",
  "README.zh-CN.md",
  "AGENTS.md",
  "package.json"
];

const requiredDirectories = [
  "apps/web/public",
  "apps/web/src",
  "content/presets",
  "crates/lyricbook-core",
  "crates/lyricbook-cli",
  "crates/lyricbook-wasm",
  "themes",
  "locales",
  "docs",
  "tests"
];

const failures = [];

for (const relative of requiredDirectories) {
  const absolute = path.join(root, relative);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) failures.push(`${relative} exists but is not a directory`);
  } catch {
    failures.push(`missing directory: ${relative}`);
  }
}

for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  try {
    await access(absolute);
    const info = await stat(absolute);
    if (!info.isFile() || info.size === 0) failures.push(`missing or empty file: ${relative}`);
  } catch {
    failures.push(`missing file: ${relative}`);
  }
}

function fluentKeys(source) {
  return new Set(source.split(/\r?\n/).map(line => line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=/)?.[1]).filter(Boolean));
}

try {
  const [english, chinese] = await Promise.all([
    readFile(path.join(root, "locales/en-US/main.ftl"), "utf8"),
    readFile(path.join(root, "locales/zh-CN/main.ftl"), "utf8")
  ]);
  const enKeys = fluentKeys(english);
  const zhKeys = fluentKeys(chinese);
  const missingInChinese = [...enKeys].filter(key => !zhKeys.has(key));
  const missingInEnglish = [...zhKeys].filter(key => !enKeys.has(key));
  if (missingInChinese.length) failures.push(`zh-CN locale missing keys: ${missingInChinese.join(", ")}`);
  if (missingInEnglish.length) failures.push(`en-US locale missing keys: ${missingInEnglish.join(", ")}`);
  if (enKeys.size < 30) failures.push(`locale message set is unexpectedly small: ${enKeys.size}`);
} catch (error) {
  failures.push(`could not validate locale files: ${error.message}`);
}

try {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  for (const required of [
    "https://lyricbook.iocky.com/",
    "https://cky008.github.io/lyricbook/",
    "actions/workflows/ci.yml/badge.svg",
    "actions/workflows/deploy-pages.yml/badge.svg"
  ]) {
    if (!readme.includes(required)) failures.push(`README.md missing required link or badge: ${required}`);
  }
} catch (error) {
  failures.push(`could not validate README.md: ${error.message}`);
}

if (failures.length) {
  console.error("Repository validation failed:\n" + failures.map(item => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Repository validation passed: ${requiredDirectories.length} directories, ${requiredFiles.length} files, locale parity, README links and badges.`);
