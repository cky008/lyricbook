import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(rootDir, "apps/web");
const outDir = path.join(rootDir, "dist");

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

function staticAssetsPlugin(): Plugin {
  return {
    name: "lyricbook-static-assets",
    apply: "build",
    async writeBundle() {
      await mkdir(outDir, { recursive: true });
      for (const directory of ["content", "themes", "locales"]) {
        await cp(path.join(rootDir, directory), path.join(outDir, directory), {
          recursive: true,
        });
      }

      const packageJson = JSON.parse(
        await readFile(path.join(rootDir, "package.json"), "utf8"),
      ) as {
        version: string;
      };
      const buildTime = new Date().toISOString();
      await writeFile(
        path.join(outDir, "version.json"),
        `${JSON.stringify(
          {
            version: packageJson.version,
            schemaVersion: 1,
            buildTime,
          },
          null,
          2,
        )}\n`,
      );

      const files = (await listFiles(outDir))
        .filter((file) => !["sw.js", "version.json"].includes(file))
        .map((file) => `./${file}`)
        .sort();
      const cacheName = `lyricbook-v${packageJson.version}`;
      const sw = `const CACHE_NAME = ${JSON.stringify(cacheName)};\nconst PRECACHE = ${JSON.stringify(files, null, 2)};\nself.addEventListener("install", (event) => {\n  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));\n});\nself.addEventListener("activate", (event) => {\n  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("lyricbook-v") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));\n});\nself.addEventListener("fetch", (event) => {\n  if (event.request.method !== "GET") return;\n  const url = new URL(event.request.url);\n  if (url.origin !== self.location.origin) return;\n  if (url.pathname.endsWith("version.json")) {\n    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));\n    return;\n  }\n  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {\n    if (response.ok && response.type === "basic") {\n      const copy = response.clone();\n      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));\n    }\n    return response;\n  }).catch(() => caches.match("./index.html"))));\n});\n`;
      await writeFile(path.join(outDir, "sw.js"), sw);

      await mkdir(path.join(outDir, ".well-known"), { recursive: true });
      await writeFile(
        path.join(outDir, "404.html"),
        await readFile(path.join(outDir, "index.html")),
      );
    },
  };
}

export default defineConfig({
  root: appRoot,
  base: process.env.LYRICBOOK_BASE || "./",
  publicDir: path.join(rootDir, "public"),
  resolve: {
    alias: {
      "@app": path.join(rootDir, "apps/web/src"),
      "@domain": path.join(rootDir, "packages/domain/src"),
      "@print": path.join(rootDir, "packages/print-engine/src"),
    },
  },
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
    staticAssetsPlugin(),
  ],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    target: "es2024",
    cssCodeSplit: true,
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});
