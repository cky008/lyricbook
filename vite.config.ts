import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { buildServiceWorkerSource } from "./scripts/service-worker.ts";

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
      const files = (await listFiles(outDir))
        .filter((file) => !["sw.js", "version.json"].includes(file))
        .map((file) => `./${file}`)
        .sort();
      const hash = createHash("sha256");
      for (const file of files) {
        hash.update(file);
        hash.update("\0");
        hash.update(await readFile(path.join(outDir, file.slice(2))));
        hash.update("\0");
      }
      hash.update("scripts/service-worker.ts\0");
      hash.update(await readFile(path.join(rootDir, "scripts/service-worker.ts")));
      const buildId = hash.digest("hex").slice(0, 12);
      const cachePrefix = "lyricbook-build-";
      const cacheId = `${packageJson.version}-${buildId}`;
      await writeFile(
        path.join(outDir, "version.json"),
        `${JSON.stringify(
          {
            version: packageJson.version,
            schemaVersion: 1,
            buildId,
            buildTime,
          },
          null,
          2,
        )}\n`,
      );
      const sw = buildServiceWorkerSource({ cacheId, cachePrefix, precache: files });
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
