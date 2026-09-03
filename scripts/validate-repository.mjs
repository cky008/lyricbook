import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const required = [
  ".npmrc",
  ".nvmrc",
  "package.json",
  "package-lock.json",
  "toolchain.json",
  "vitest.config.ts",
  ".github/dependabot.yml",
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
const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
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
if (packageJson.engines?.node !== ">=26.8.1 <27")
  throw new Error("Node engine must pin the current 26.x line");
if (packageJson.packageManager !== "npm@12.0.2")
  throw new Error("packageManager must be npm@12.0.2");
if (
  packageLock.version !== packageJson.version ||
  packageLock.packages?.[""]?.version !== packageJson.version
) {
  throw new Error("package-lock.json application versions are out of sync");
}
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
if (toolchain.cargoAudit !== "0.22.2") {
  throw new Error("toolchain.json must pin cargo-audit 0.22.2");
}
if (!/^[0-9a-f]{40}$/.test(toolchain.rustToolchainAction ?? "")) {
  throw new Error("toolchain.json must pin the Rust toolchain action to a full commit SHA");
}

for (const [script, requiredText] of [
  ["test:rust", "cargo test --locked"],
  ["lint:rust", "cargo clippy --locked"],
  ["build:wasm", "-- --locked"],
]) {
  if (!packageJson.scripts?.[script]?.includes(requiredText)) {
    throw new Error(`package.json ${script} must keep Cargo resolution locked`);
  }
}

const cargoToml = await readFile(path.join(root, "Cargo.toml"), "utf8");
const workspacePackageSection = cargoToml.match(
  /\[workspace\.package\]([\s\S]*?)(?=\n\[[^\]]+\]|$)/,
)?.[1];
const cargoWorkspaceVersion = workspacePackageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (cargoWorkspaceVersion !== packageJson.version) {
  throw new Error("Cargo.toml workspace package version is out of sync");
}

const cargoLock = await readFile(path.join(root, "Cargo.lock"), "utf8");
const lockedWorkspaceVersions = new Map();
for (const section of cargoLock.split("[[package]]").slice(1)) {
  const name = section.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  const version = section.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
  if (name && version) lockedWorkspaceVersions.set(name, version);
}
for (const crate of ["lyricbook-cli", "lyricbook-core", "lyricbook-wasm"]) {
  if (lockedWorkspaceVersions.get(crate) !== packageJson.version) {
    throw new Error(`Cargo.lock ${crate} version is out of sync`);
  }
}

const currentVersionDocuments = new Map([
  ["AGENTS.md", `Version ${packageJson.version} uses the pinned toolchain`],
  ["README.md", `Version ${packageJson.version}`],
  ["README.zh-CN.md", `**${packageJson.version} `],
  [".env.example", `LyricBook v${packageJson.version}`],
  ["docs/TOOLCHAIN.md", `LyricBook ${packageJson.version} uses`],
  ["docs/PRODUCT_REQUIREMENTS.md", `Version ${packageJson.version} is static`],
]);
for (const [relative, expectedText] of currentVersionDocuments) {
  const content = await readFile(path.join(root, relative), "utf8");
  if (!content.includes(expectedText)) {
    throw new Error(`${relative} does not describe application version ${packageJson.version}`);
  }
}
const productRequirements = await readFile(path.join(root, "docs/PRODUCT_REQUIREMENTS.md"), "utf8");
if (!productRequirements.includes(`Version ${packageJson.version} does not provide`)) {
  throw new Error("docs/PRODUCT_REQUIREMENTS.md exclusions version is out of sync");
}
const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
const currentChangelogVersion = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - /m)?.[1];
if (currentChangelogVersion !== packageJson.version) {
  throw new Error("CHANGELOG.md latest released version is out of sync");
}

const workflowVersionRequirements = new Map([
  ["actions/checkout", "v7"],
  ["actions/setup-node", "v7"],
  ["actions/configure-pages", "v6"],
  ["actions/upload-pages-artifact", "v5"],
  ["actions/deploy-pages", "v5"],
  ["actions/upload-artifact", "v7"],
  ["actions/download-artifact", "v8"],
  ["actions/dependency-review-action", "v5"],
  ["dtolnay/rust-toolchain", toolchain.rustToolchainAction],
]);
const workflowDirectory = path.join(root, ".github/workflows");
const workflowContents = new Map();
for (const entry of await readdir(workflowDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
  const workflow = await readFile(path.join(workflowDirectory, entry.name), "utf8");
  workflowContents.set(entry.name, workflow);
  for (const [action, version] of workflowVersionRequirements) {
    const pattern = new RegExp(`${action.replace("/", "\\/")}@([^\\s]+)`, "g");
    for (const match of workflow.matchAll(pattern)) {
      if (match[1] !== version) {
        throw new Error(`${entry.name} must use ${action}@${version}; found ${match[0]}`);
      }
    }
  }
}

for (const workflowName of ["ci.yml", "full-quality.yml"]) {
  const workflow = workflowContents.get(workflowName) ?? "";
  for (const branchPattern of ["develop", "feature/**", "fix/**", "release/**"]) {
    if (!workflow.includes(branchPattern)) {
      throw new Error(`${workflowName} must run for pushed ${branchPattern} branches`);
    }
  }
}
if (!(workflowContents.get("full-quality.yml") ?? "").includes("npm run check:offline")) {
  throw new Error("full-quality.yml must exercise the production build over HTTP");
}
const releaseWorkflow = workflowContents.get("release.yml") ?? "";
for (const requiredText of [
  'test "$TAG" = "v$PACKAGE_VERSION"',
  'COMMIT="$(git rev-parse "$TAG^{commit}")"',
  'test "$COMMIT" = "$(git rev-parse HEAD)"',
  'git merge-base --is-ancestor "$COMMIT" origin/main',
  "commit: $" + "{{ steps.tag.outputs.commit }}",
  "npm run test:e2e",
  "npm run check:offline",
  "npm audit --audit-level=high",
  "cargo audit",
  'git archive --format=zip --prefix="lyricbook-$TAG/"',
  '--output="lyricbook-$TAG-source.zip" "$TAG"',
]) {
  if (!releaseWorkflow.includes(requiredText)) {
    throw new Error(`release.yml is missing release invariant: ${requiredText}`);
  }
}
if (releaseWorkflow.includes("rsync")) {
  throw new Error("release.yml source archives must come from the tagged Git object");
}
const releaseJobsIndex = releaseWorkflow.indexOf("jobs:");
const releaseQualityJob = releaseWorkflow.indexOf("  quality-package:", releaseJobsIndex);
const releasePublishJob = releaseWorkflow.indexOf("  publish:", releaseQualityJob);
const releaseQualityGate = releaseWorkflow.indexOf(
  "      - name: Release quality gate",
  releaseQualityJob,
);
const releasePackageStep = releaseWorkflow.indexOf(
  "      - name: Package release assets",
  releaseQualityGate,
);
const releaseArtifactUpload = releaseWorkflow.indexOf(
  "uses: actions/upload-artifact@v7",
  releasePackageStep,
);
const releaseChecksumStep = releaseWorkflow.indexOf(
  "      - name: Verify release asset checksums",
  releasePublishJob,
);
const releaseTagRevalidation = releaseWorkflow.indexOf(
  "      - name: Revalidate release tag",
  releaseChecksumStep,
);
const releasePublishStep = releaseWorkflow.indexOf(
  "      - name: Publish GitHub release",
  releaseTagRevalidation,
);
if (
  releaseJobsIndex < 0 ||
  releaseQualityJob <= releaseJobsIndex ||
  releasePublishJob <= releaseQualityJob ||
  releaseQualityGate <= releaseQualityJob ||
  releasePackageStep <= releaseQualityGate ||
  releaseArtifactUpload <= releasePackageStep ||
  releaseChecksumStep <= releasePublishJob ||
  releaseTagRevalidation <= releaseChecksumStep ||
  releasePublishStep <= releaseTagRevalidation
) {
  throw new Error("release.yml must verify, package, transfer, and publish in that order");
}
const releaseHeader = releaseWorkflow.slice(0, releaseJobsIndex);
const releaseQualitySection = releaseWorkflow.slice(releaseQualityJob, releasePublishJob);
const releasePublishSection = releaseWorkflow.slice(releasePublishJob);
if (!releaseHeader.includes("permissions:\n  contents: read")) {
  throw new Error("release.yml must default to read-only contents permission");
}
if (
  !releaseQualitySection.includes("persist-credentials: false") ||
  releaseQualitySection.includes("contents: write")
) {
  throw new Error("release.yml verification must not retain a write-capable checkout token");
}
if (
  !releasePublishSection.includes("contents: write") ||
  !releasePublishSection.includes("needs: quality-package") ||
  !releasePublishSection.includes("uses: actions/download-artifact@v8") ||
  releasePublishSection.includes("uses: actions/checkout@")
) {
  throw new Error("release.yml must isolate contents write permission in the publishing job");
}
for (const requiredText of [
  "VERIFIED_COMMIT: $" + "{{ needs.quality-package.outputs.commit }}",
  'gh api "repos/$GH_REPO/git/ref/tags/$TAG"',
  'gh api "repos/$GH_REPO/git/tags/$REMOTE_SHA"',
  'test "$REMOTE_TYPE" = "commit"',
  'test "$REMOTE_SHA" = "$VERIFIED_COMMIT"',
]) {
  if (!releasePublishSection.includes(requiredText)) {
    throw new Error(`release.yml must revalidate the tag before publishing: ${requiredText}`);
  }
}
if ((releaseWorkflow.match(/contents:\s*write/g) ?? []).length !== 1) {
  throw new Error("release.yml must have exactly one contents write grant");
}
if (
  !/git archive --format=zip --prefix="lyricbook-\$TAG\/" \\\n\s+--output="lyricbook-\$TAG-source\.zip" "\$TAG"/.test(
    releaseQualitySection,
  )
) {
  throw new Error("release.yml must archive exactly the verified tag object");
}

const deployWorkflow = workflowContents.get("deploy-pages.yml") ?? "";
const deployJobsIndex = deployWorkflow.indexOf("jobs:");
const deployQualityJob = deployWorkflow.indexOf("  quality-build:", deployJobsIndex);
const deployPublishJob = deployWorkflow.indexOf("  deploy:", deployQualityJob);
const deployHeader = deployWorkflow.slice(0, deployJobsIndex);
const deployQualitySection = deployWorkflow.slice(deployQualityJob, deployPublishJob);
const deployPublishSection = deployWorkflow.slice(deployPublishJob);
if (
  deployJobsIndex < 0 ||
  deployQualityJob <= deployJobsIndex ||
  deployPublishJob <= deployQualityJob ||
  !deployHeader.includes("permissions:\n  contents: read") ||
  deployQualitySection.includes("pages: write") ||
  deployQualitySection.includes("id-token: write") ||
  !deployPublishSection.includes("needs: quality-build") ||
  !deployPublishSection.includes("pages: write") ||
  !deployPublishSection.includes("id-token: write")
) {
  throw new Error("deploy-pages.yml must grant Pages credentials only to the deploy job");
}

for (const workflowName of ["ci.yml", "deploy-pages.yml", "release.yml"]) {
  const workflow = workflowContents.get(workflowName) ?? "";
  if (
    !workflow.includes("cargo clippy --locked") ||
    !workflow.includes("cargo test --locked") ||
    !(
      workflow.includes("npm run build:wasm") ||
      workflow.includes(
        "wasm-pack build crates/lyricbook-wasm --target web --out-dir ../../packages/wasm/pkg --release -- --locked",
      )
    )
  ) {
    throw new Error(`${workflowName} must keep Cargo resolution locked during build and test`);
  }
}
for (const workflowName of ["ci.yml", "deploy-pages.yml", "release.yml", "security.yml"]) {
  const workflow = workflowContents.get(workflowName) ?? "";
  if (!workflow.includes(`dtolnay/rust-toolchain@${toolchain.rustToolchainAction}`)) {
    throw new Error(`${workflowName} must pin the reviewed Rust toolchain action commit`);
  }
}

const requiredWorkflowActions = new Map([
  ["ci.yml", ["actions/checkout@v7", "actions/setup-node@v7"]],
  [
    "deploy-pages.yml",
    [
      "actions/checkout@v7",
      "actions/setup-node@v7",
      "actions/configure-pages@v6",
      "actions/upload-pages-artifact@v5",
      "actions/deploy-pages@v5",
    ],
  ],
  [
    "full-quality.yml",
    ["actions/checkout@v7", "actions/setup-node@v7", "actions/upload-artifact@v7"],
  ],
  [
    "security.yml",
    ["actions/checkout@v7", "actions/setup-node@v7", "actions/dependency-review-action@v5"],
  ],
  [
    "release.yml",
    [
      "actions/checkout@v7",
      "actions/setup-node@v7",
      "actions/upload-artifact@v7",
      "actions/download-artifact@v8",
    ],
  ],
]);
for (const [workflowName, requiredActions] of requiredWorkflowActions) {
  const workflow = await readFile(path.join(workflowDirectory, workflowName), "utf8");
  for (const action of requiredActions) {
    if (!workflow.includes(action)) throw new Error(`${workflowName} is missing ${action}`);
  }
}

const dependabot = await readFile(path.join(root, ".github/dependabot.yml"), "utf8");
for (const ecosystem of ["npm", "cargo", "github-actions"]) {
  if (!dependabot.includes(`package-ecosystem: ${ecosystem}`)) {
    throw new Error(`Dependabot is missing the ${ecosystem} ecosystem`);
  }
}
if ((dependabot.match(/target-branch:\s*develop/g) ?? []).length !== 3) {
  throw new Error("All Dependabot ecosystems must target develop");
}
if (!dependabot.includes('groups:\n      github-actions:\n        patterns: ["*"]')) {
  throw new Error("GitHub Actions Dependabot updates must be grouped");
}

const vitestConfig = await readFile(path.join(root, "vitest.config.ts"), "utf8");
const minimumCoverageThresholds = new Map([
  ["statements", 70],
  ["branches", 60],
  ["functions", 65],
  ["lines", 70],
]);
for (const [metric, minimum] of minimumCoverageThresholds) {
  const match = new RegExp(`${metric}:\\s*(\\d+)`).exec(vitestConfig);
  const actual = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(actual) || actual < minimum) {
    throw new Error(
      `Coverage threshold ${metric} must remain at least ${minimum}; found ${match?.[1] ?? "missing"}`,
    );
  }
}
for (const coveredPath of [
  "packages/domain/src/**/*.ts",
  "packages/print-engine/src/**/*.ts",
  "apps/web/src/lib/archive.ts",
  "apps/web/src/lib/projectHelpers.ts",
]) {
  if (!vitestConfig.includes(coveredPath))
    throw new Error(`Coverage must continue to include ${coveredPath}`);
}
if (!vitestConfig.includes('exclude: ["**/*.d.ts", "**/index.ts"]')) {
  throw new Error("Coverage exclusions must remain limited to declarations and barrel files");
}
if (!packageJson.scripts?.lint?.includes("--error-on-warnings")) {
  throw new Error("The lint command must fail on warnings");
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

const coverageSourcePrefixes = [
  path.join(root, "packages/domain/src"),
  path.join(root, "packages/print-engine/src"),
];
const explicitCoverageSources = new Set([
  path.join(root, "apps/web/src/lib/archive.ts"),
  path.join(root, "apps/web/src/lib/projectHelpers.ts"),
]);
for (const file of codeFiles) {
  const covered =
    coverageSourcePrefixes.some((prefix) => file.startsWith(`${prefix}${path.sep}`)) ||
    explicitCoverageSources.has(file);
  if (!covered) continue;
  const content = await readFile(file, "utf8");
  if (/istanbul ignore|c8 ignore|v8 ignore/i.test(content)) {
    throw new Error(`Coverage ignore directives are not allowed in ${path.relative(root, file)}`);
  }
}
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
if (!/<div\s+id=["']print-portal["']\s+data-print-portal=["']true["']><\/div>/.test(html)) {
  throw new Error("apps/web/index.html must provide one static direct-body #print-portal");
}
const mainSource = await readFile(path.join(root, "apps/web/src/main.tsx"), "utf8");
if (/document\.createElement\(["']div["']\)[\s\S]*print-portal/.test(mainSource)) {
  throw new Error("main.tsx must not create the print portal at runtime");
}

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
  if (!workflow.includes("test -f package-lock.json") || !workflow.includes("npm ci")) {
    throw new Error(`${relative} must require the committed JavaScript lockfile and use npm ci`);
  }
  if (workflow.includes("npm install --no-audit") || workflow.includes("cargo generate-lockfile")) {
    throw new Error(`${relative} must not regenerate application lockfiles in protected runs`);
  }
}

const readme = await readFile(path.join(root, "README.md"), "utf8");
for (const requiredText of [
  "https://lyricbook.iocky.com/",
  "https://github.com/cky008/lyricbook",
  "Deploy GitHub Pages",
]) {
  if (!readme.includes(requiredText)) throw new Error(`README is missing ${requiredText}`);
}

console.log(
  `Repository validation passed: ${codeFiles.length} source files, ${usedKeys.size} UI keys, pinned toolchain, icons and local imports verified.`,
);
