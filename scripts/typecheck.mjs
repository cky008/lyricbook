import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const temp = path.resolve(".tmp/typecheck");
await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
for (const name of ["app", "pack", "storage", "i18n"]) {
  let source = await readFile(path.resolve(`apps/web/src/${name}.ts`), "utf8");
  source = source.replaceAll(/from "\.\/(.+?)\.js"/g, 'from "./$1.js"');
  await writeFile(path.join(temp, `${name}.js`), source);
}
for (const name of ["app", "pack", "storage", "i18n"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(temp, `${name}.js`)], { encoding: "utf8" });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
}
await rm(path.resolve(".tmp"), { recursive: true, force: true });
console.log("Browser TypeScript sources are syntax-valid JavaScript modules.");
