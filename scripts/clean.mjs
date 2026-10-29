import { rm } from "node:fs/promises";

for (const path of [
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  "target",
  "packages/wasm/pkg",
  "offline-check-report.json",
]) {
  await rm(path, { recursive: true, force: true });
}
console.log("Cleaned generated files.");
