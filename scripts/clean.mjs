import { rm } from "node:fs/promises";

for (const path of [
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  "target",
  "packages/wasm/pkg",
]) {
  await rm(path, { recursive: true, force: true });
}
console.log("Cleaned generated files.");
