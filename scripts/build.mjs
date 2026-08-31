import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const requiredBuildInputs = [
  "apps/web/public",
  "apps/web/src/app.css",
  "apps/web/src/app.ts",
  "apps/web/src/pack.ts",
  "apps/web/src/storage.ts",
  "apps/web/src/i18n.ts",
  "content",
  "themes",
  "locales"
];
for (const relative of requiredBuildInputs) {
  try {
    await access(path.join(root, relative));
  } catch {
    throw new Error(`Required build input is missing: ${relative}. Run npm run validate:repo and restore the complete source package.`);
  }
}
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
await cp(path.join(root, "apps/web/public"), dist, { recursive: true });
await cp(path.join(root, "content"), path.join(dist, "content"), { recursive: true });
await cp(path.join(root, "themes"), path.join(dist, "themes"), { recursive: true });
await cp(path.join(root, "locales"), path.join(dist, "locales"), { recursive: true });

for (const name of ["app", "pack", "storage", "i18n"]) {
  const source = await readFile(path.join(root, `apps/web/src/${name}.ts`), "utf8");
  await writeFile(path.join(dist, `assets/${name}.js`), source, "utf8");
}
await cp(path.join(root, "apps/web/src/app.css"), path.join(dist, "assets/app.css"));
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
await writeFile(path.join(dist, "version.json"), JSON.stringify({ version, schemaVersion: 1, builtAt: new Date().toISOString() }, null, 2) + "\n");

async function filesBelow(dir, prefix = "") {
  const results = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "sw.js") continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) results.push(...await filesBelow(absolute, relative));
    else results.push(`./${relative}`);
  }
  return results;
}
const precache = await filesBelow(dist);
const sw = `const CACHE = "lyricbook-v${version}";\nconst ASSETS = ${JSON.stringify(precache, null, 2)};\nself.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));\nself.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));\nself.addEventListener("fetch", event => { if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match("./index.html")))); });\n`;
await writeFile(path.join(dist, "sw.js"), sw);
console.log(`Built ${dist} (v${version}, ${precache.length} precached files)`);
