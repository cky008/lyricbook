import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const report = { status: "PASS", checks: [], warnings: [], runtime: { node: process.version } };
const add = (name, ok, detail = "") => {
  report.checks.push({ name, ok, detail });
  if (!ok) report.status = "FAIL";
};

function walk(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", "dist", "target", ".git", "coverage"].includes(entry.name)
    ) {
      result.push(...walk(full));
    } else if (entry.isFile()) result.push(full);
  }
  return result;
}

for (const [name, script] of [
  ["content-validation", "scripts/validate-content.mjs"],
  ["repository-validation", "scripts/validate-repository.mjs"],
]) {
  try {
    execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" });
    add(name, true);
  } catch (error) {
    add(name, false, error instanceof Error ? error.message : String(error));
  }
}

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const toolchain = JSON.parse(readFileSync(path.join(root, "toolchain.json"), "utf8"));
add("application-version", packageJson.version === toolchain.application);
add(
  "react-19",
  packageJson.dependencies.react === "19.2.8" && packageJson.dependencies["react-dom"] === "19.2.8",
);
add(
  "react-compiler-stable",
  packageJson.devDependencies["babel-plugin-react-compiler"] === "1.0.0",
);
add("babel-8", packageJson.devDependencies["@babel/core"] === "8.0.1");
add("vite-8", packageJson.devDependencies.vite === "8.2.2");
add("typescript-7", packageJson.devDependencies.typescript === "7.0.2");
add("tailwind-4", packageJson.devDependencies.tailwindcss === "4.3.3");
add("rust-1.98", toolchain.rust === "1.98.0");
add("playwright-1.62", packageJson.devDependencies["@playwright/test"] === "1.62.1");

const viteConfig = readFileSync(path.join(root, "vite.config.ts"), "utf8");
add(
  "official-react-compiler-vite-setup",
  viteConfig.includes("reactCompilerPreset") &&
    viteConfig.includes("@rolldown/plugin-babel") &&
    viteConfig.includes("presets: [reactCompilerPreset()]"),
);

const expectedNode = toolchain.node;
if (!process.version.startsWith(`v${expectedNode}`)) {
  report.warnings.push(
    `Offline checker is running on ${process.version}; protected CI is pinned to Node ${expectedNode}.`,
  );
}

let ts;
try {
  const require = createRequire(import.meta.url);
  ts = require("typescript");
} catch {
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const require = createRequire(import.meta.url);
    ts = require(path.join(globalRoot, "typescript"));
    report.warnings.push(
      `Used globally installed TypeScript ${ts.version} for syntax-only checking; protected CI installs 7.0.2.`,
    );
  } catch (error) {
    report.warnings.push(`TypeScript syntax check skipped: ${String(error)}`);
  }
}
if (ts) {
  const files = ["apps", "packages", "tests"]
    .flatMap((directory) => walk(path.join(root, directory)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  const diagnostics = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const output = ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    for (const diagnostic of output.diagnostics ?? []) {
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        diagnostics.push(
          `${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
        );
      }
    }
  }
  add("typescript-syntax", diagnostics.length === 0, diagnostics.slice(0, 30).join("\n"));
}

const forbiddenPrivate = walk(root).filter((file) =>
  /GEM歌词本备份|含歌词|private.*lyrics|\.lyricbook$/i.test(path.basename(file)),
);
add("no-private-lyrics", forbiddenPrivate.length === 0, forbiddenPrivate.join("\n"));
const suspiciousLarge = walk(root).filter((file) => statSync(file).size > 20 * 1024 * 1024);
add("no-unexpected-large-files", suspiciousLarge.length === 0, suspiciousLarge.join("\n"));
add(
  "no-vendored-react",
  !walk(root).some((file) => /react(?:-dom)?\.production\.min\.js$/i.test(file)),
);
const appHtml = readFileSync(path.join(root, "apps/web/index.html"), "utf8");
const mainSource = readFileSync(path.join(root, "apps/web/src/main.tsx"), "utf8");
add(
  "static-print-portal",
  /<div\s+id=["']print-portal["']\s+data-print-portal=["']true["']><\/div>/.test(appHtml) &&
    !/document\.createElement\(["']div["']\)[\s\S]{0,200}print-portal/.test(mainSource),
);
add(
  "print-portal-outside-react-root",
  !readFileSync(path.join(root, "apps/web/src/App.tsx"), "utf8").includes('id="print-portal"'),
);

const reportPath = path.join(root, "offline-check-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
