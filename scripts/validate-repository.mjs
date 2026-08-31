import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const required = [
  ".npmrc",
  ".nvmrc",
  "package.json",
  "toolchain.json",
  "Cargo.toml",
  "rust-toolchain.toml",
  "AGENTS.md",
  "README.md",
  "README.zh-CN.md",
  "ROADMAP.md",
  "SECURITY.md",
  "apps/web/index.html",
  "apps/web/src/main.tsx",
  "apps/web/src/App.tsx",
  "packages/domain/src/schema.ts",
  "packages/print-engine/src/layout.ts",
  "content/presets/index.json",
  "themes/default/theme.json",
  "locales/en-US/main.ftl",
  "locales/zh-CN/main.ftl",
  "public/CNAME",
  "public/manifest.webmanifest",
  "public/favicon-32.png",
  "public/apple-touch-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/full-quality.yml",
  ".github/workflows/security.yml",
  ".github/workflows/release.yml",
  "docs/AI_SETLIST_RESEARCH.md",
  "docs/ARCHITECTURE.md",
  "docs/PRODUCT_REQUIREMENTS.md",
  "docs/SECURITY.md",
  "docs/TESTING.md",
  "docs/TOOLCHAIN.md",
];
for (const relative of required) await access(path.join(root, relative));

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const toolchain = JSON.parse(await readFile(path.join(root, "toolchain.json"), "utf8"));
const exactVersions = {
  react: "19.2.8",
  "react-dom": "19.2.8",
  vite: "8.2.2",
  typescript: "7.0.2",
  tailwindcss: "4.3.3",
  "@tailwindcss/vite": "4.3.3",
  "@vitejs/plugin-react": "6.1.1",
  "@rolldown/plugin-babel": "0.2.3",
  "@babel/core": "8.0.1",
  "babel-plugin-react-compiler": "1.0.0",
  "radix-ui": "1.6.7",
  "@biomejs/biome": "2.5.11",
  vitest: "4.1.11",
  "@playwright/test": "1.62.1",
};
for (const [name, expected] of Object.entries(exactVersions)) {
  const actual = packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
  if (actual !== expected)
    throw new Error(`${name} must be pinned to ${expected}; found ${actual}`);
}
for (const section of ["dependencies", "devDependencies", "overrides"]) {
  for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
    if (typeof version !== "string" || /^[~^*]|\s|\|\||workspace:|latest$/.test(version)) {
      throw new Error(`${section}.${name} must be an exact reproducible version; found ${version}`);
    }
  }
}
if (packageJson.version !== "0.0.3") throw new Error("Application version must be 0.0.3");
if (packageJson.engines?.node !== ">=26.8.1 <27")
  throw new Error("Node engine must pin the current 26.x line");
if (packageJson.packageManager !== "npm@12.0.2")
  throw new Error("packageManager must be npm@12.0.2");
if (toolchain.application !== packageJson.version)
  throw new Error("toolchain.json application version is out of sync");
if (
  toolchain.react !== packageJson.dependencies.react ||
  toolchain.reactDom !== packageJson.dependencies["react-dom"]
) {
  throw new Error("toolchain.json React versions are out of sync");
}
if (toolchain.babelCore !== packageJson.devDependencies["@babel/core"]) {
  throw new Error("toolchain.json Babel version is out of sync");
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        !["node_modules", "dist", "target", "coverage", "packages/wasm/pkg"].includes(entry.name)
      ) {
        files.push(...(await walk(full)));
      }
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const sourceRoots = ["apps/web/src", "packages/domain/src", "packages/print-engine/src"];
const files = (await Promise.all(sourceRoots.map((item) => walk(path.join(root, item))))).flat();
const codeFiles = files.filter((item) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(item));
const forbidden = [
  /react\.production\.min\.js/i,
  /react-dom\.production\.min\.js/i,
  /window\.React\b/,
  /ReactDOM\.render\b/,
  /React\.createRef\b/,
  /vendor\/react/i,
  /<script[^>]+src=["'][^"']*react[^"']*["']/i,
];
for (const file of codeFiles) {
  const content = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(
        `Forbidden legacy runtime pattern ${pattern} in ${path.relative(root, file)}`,
      );
    }
  }
}

const aliasRoots = {
  "@app/": path.join(root, "apps/web/src"),
  "@domain/": path.join(root, "packages/domain/src"),
  "@print/": path.join(root, "packages/print-engine/src"),
};
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];
async function pathExists(candidate) {
  try {
    const info = await stat(candidate);
    return info.isFile();
  } catch {
    return false;
  }
}
async function resolveLocalImport(importer, specifier) {
  let base;
  if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(importer), specifier);
  } else {
    const alias = Object.keys(aliasRoots).find((prefix) => specifier.startsWith(prefix));
    if (!alias) return true;
    base = path.join(aliasRoots[alias], specifier.slice(alias.length));
  }
  for (const suffix of extensionCandidates) {
    if (await pathExists(`${base}${suffix}`)) return true;
  }
  for (const suffix of extensionCandidates.slice(1)) {
    if (await pathExists(path.join(base, `index${suffix}`))) return true;
  }
  return false;
}
for (const file of codeFiles) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    if (!(await resolveLocalImport(file, specifier))) {
      throw new Error(`Unresolved local import ${specifier} from ${path.relative(root, file)}`);
    }
  }
}

const en = await readFile(path.join(root, "locales/en-US/main.ftl"), "utf8");
const zh = await readFile(path.join(root, "locales/zh-CN/main.ftl"), "utf8");
const localeKeys = (value) =>
  new Set(
    value
      .split("\n")
      .map((line) => /^([a-z0-9-]+)\s*=/.exec(line)?.[1])
      .filter(Boolean),
  );
const enKeys = localeKeys(en);
const zhKeys = localeKeys(zh);
const missingZh = [...enKeys].filter((key) => !zhKeys.has(key));
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key));
if (missingZh.length || missingEn.length) {
  throw new Error(
    `Locale key mismatch. zh missing: ${missingZh.join(", ")}; en missing: ${missingEn.join(", ")}`,
  );
}
const usedKeys = new Set();
const translationPattern = /\bt\(\s*["']([a-z0-9-]+)["']/g;
for (const file of codeFiles.filter((item) =>
  item.includes(`${path.sep}apps${path.sep}web${path.sep}`),
)) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(translationPattern)) if (match[1]) usedKeys.add(match[1]);
}
const missingCatalogKeys = [...usedKeys].filter((key) => !enKeys.has(key) || !zhKeys.has(key));
if (missingCatalogKeys.length)
  throw new Error(`UI translation keys missing from catalogs: ${missingCatalogKeys.join(", ")}`);

const html = await readFile(path.join(root, "apps/web/index.html"), "utf8");
if (!/<script\s+type=["']module["']\s+src=["']\/src\/main\.tsx["']/.test(html)) {
  throw new Error("apps/web/index.html must load /src/main.tsx as an ES module");
}
if (/frame-ancestors/i.test(html))
  throw new Error("frame-ancestors must be delivered as an HTTP header, not meta CSP");
if (/react\.production\.min|window\.React|vendor\/react/i.test(html))
  throw new Error("index.html must not load a vendored React runtime");

const viteConfig = await readFile(path.join(root, "vite.config.ts"), "utf8");
for (const requiredText of [
  'import react, { reactCompilerPreset } from "@vitejs/plugin-react"',
  'import babel from "@rolldown/plugin-babel"',
  "presets: [reactCompilerPreset()]",
]) {
  if (!viteConfig.includes(requiredText))
    throw new Error(`vite.config.ts is missing modern React Compiler setup: ${requiredText}`);
}
if (/react\(\s*\{[\s\S]*?babel\s*:/.test(viteConfig)) {
  throw new Error("plugin-react 6 removed the legacy inline babel option");
}

const manifest = JSON.parse(await readFile(path.join(root, "public/manifest.webmanifest"), "utf8"));
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2)
  throw new Error("PWA manifest must define install icons");
for (const icon of manifest.icons) {
  const src = String(icon.src ?? "").replace(/^\.\//, "");
  if (!src || src.includes("..")) throw new Error(`Unsafe manifest icon path: ${icon.src}`);
  await access(path.join(root, "public", src));
}

const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-pages.yml",
  ".github/workflows/full-quality.yml",
  ".github/workflows/security.yml",
  ".github/workflows/release.yml",
];
for (const relative of workflowFiles) {
  const workflow = await readFile(path.join(root, relative), "utf8");
  if (!workflow.includes("actions/checkout@v7"))
    throw new Error(`${relative} must use actions/checkout@v7`);
  if (relative !== ".github/workflows/security.yml" && !workflow.includes("npm@12.0.2")) {
    throw new Error(`${relative} must pin npm 12.0.2`);
  }
  if (
    !workflow.includes("package-lock.json") ||
    !workflow.includes("npm ci") ||
    !workflow.includes("npm install")
  ) {
    throw new Error(`${relative} must support both locked installs and the first bootstrap commit`);
  }
}

const readme = await readFile(path.join(root, "README.md"), "utf8");
for (const requiredText of [
  "https://lyricbook.iocky.com/",
  "https://github.com/cky008/lyricbook",
  "Deploy GitHub Pages",
  "React 19.2.8",
  "Rust 1.98.0",
]) {
  if (!readme.includes(requiredText)) throw new Error(`README is missing ${requiredText}`);
}

console.log(
  `Repository validation passed: ${codeFiles.length} source files, ${usedKeys.size} UI keys, modern React 19 toolchain, icons and local imports verified.`,
);
