import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
if (spawnSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" }).status !== 0) process.exit(1);
const root = path.resolve("dist");
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json" };
http.createServer(async (request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root)) throw new Error("bad path");
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file,"index.html");
    const body = await readFile(file);
    response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    response.end(body);
  } catch { response.statusCode=404; response.end("Not found"); }
}).listen(4173, "127.0.0.1", () => console.log("LyricBook: http://127.0.0.1:4173"));
