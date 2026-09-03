import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflowDirectory = path.join(root, ".github/workflows");
const protectedWorkflows = [
  "ci.yml",
  "deploy-pages.yml",
  "full-quality.yml",
  "release.yml",
  "security.yml",
];
const rustWorkflows = ["ci.yml", "deploy-pages.yml", "release.yml", "security.yml"];
const cargoBuildWorkflows = ["ci.yml", "deploy-pages.yml", "release.yml"];
const rustToolchainWorkflows = ["ci.yml", "deploy-pages.yml", "release.yml", "security.yml"];

function workflow(name: string): string {
  return readFileSync(path.join(workflowDirectory, name), "utf8");
}

describe("protected workflow reproducibility", () => {
  it("requires the committed JavaScript and Rust lockfiles in every protected workflow", () => {
    expect(existsSync(path.join(root, "package-lock.json"))).toBe(true);
    expect(existsSync(path.join(root, "Cargo.lock"))).toBe(true);

    for (const name of protectedWorkflows) {
      const source = workflow(name);
      expect(source, name).toContain("test -f package-lock.json");
      expect(source, name).toContain("npm ci");
      expect(source, name).not.toContain("npm install --no-audit");
      expect(source, name).not.toContain("cargo generate-lockfile");
    }
    for (const name of rustWorkflows) {
      expect(workflow(name), name).toContain("test -f Cargo.lock");
    }
  });

  it("publishes only the current tagged commit after the complete release gate", () => {
    const source = workflow("release.yml");
    const qualityJob = source.indexOf("  quality-package:");
    const publishJob = source.indexOf("  publish:");
    const qualityGate = source.indexOf("      - name: Release quality gate", qualityJob);
    const packaging = source.indexOf("      - name: Package release assets", qualityGate);
    const artifactUpload = source.indexOf("uses: actions/upload-artifact@v7", packaging);
    const tagRevalidation = source.indexOf("      - name: Revalidate release tag", publishJob);
    const releasePublish = source.indexOf("      - name: Publish GitHub release", publishJob);

    for (const required of [
      'test "$TAG" = "v$PACKAGE_VERSION"',
      'COMMIT="$(git rev-parse "$TAG^{commit}")"',
      'test "$COMMIT" = "$(git rev-parse HEAD)"',
      'git merge-base --is-ancestor "$COMMIT" origin/main',
      "commit: $" + "{{ steps.tag.outputs.commit }}",
      "npx playwright install --with-deps chromium firefox webkit",
      "npm run test:e2e",
      "npm run check:offline",
      "npm audit --audit-level=high",
      "cargo audit",
      'git archive --format=zip --prefix="lyricbook-$TAG/"',
      '--output="lyricbook-$TAG-source.zip" "$TAG"',
    ]) {
      expect(source).toContain(required);
    }
    expect(source.slice(0, source.indexOf("jobs:"))).toContain("contents: read");
    expect(qualityJob).toBeGreaterThan(0);
    expect(publishJob).toBeGreaterThan(qualityJob);
    expect(source.slice(qualityJob, publishJob)).toContain("persist-credentials: false");
    expect(source.slice(qualityJob, publishJob)).not.toContain("contents: write");
    expect(source.slice(publishJob)).toContain("contents: write");
    expect(source.slice(publishJob)).toContain("needs: quality-package");
    expect(source.slice(publishJob)).toContain("uses: actions/download-artifact@v8");
    expect(source.slice(publishJob)).toContain(
      "VERIFIED_COMMIT: $" + "{{ needs.quality-package.outputs.commit }}",
    );
    expect(source.slice(publishJob)).toContain('gh api "repos/$GH_REPO/git/ref/tags/$TAG"');
    expect(source.slice(publishJob)).toContain('test "$REMOTE_SHA" = "$VERIFIED_COMMIT"');
    expect(qualityGate).toBeGreaterThan(qualityJob);
    expect(packaging).toBeGreaterThan(qualityGate);
    expect(artifactUpload).toBeGreaterThan(packaging);
    expect(tagRevalidation).toBeGreaterThan(artifactUpload);
    expect(releasePublish).toBeGreaterThan(publishJob);
    expect(releasePublish).toBeGreaterThan(tagRevalidation);
    expect(source).not.toContain("rsync");
  });

  it("keeps Cargo resolution locked in protected build and test jobs", () => {
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["test:rust"]).toContain("cargo test --locked");
    expect(packageJson.scripts["lint:rust"]).toContain("cargo clippy --locked");
    expect(packageJson.scripts["build:wasm"]).toContain("-- --locked");

    for (const name of cargoBuildWorkflows) {
      const source = workflow(name);
      expect(source, name).toContain("cargo clippy --locked");
      expect(source, name).toContain("cargo test --locked");
      expect(
        source.includes("npm run build:wasm") ||
          source.includes(
            "wasm-pack build crates/lyricbook-wasm --target web --out-dir ../../packages/wasm/pkg --release -- --locked",
          ),
        name,
      ).toBe(true);
    }
  });

  it("pins the Rust toolchain action to one reviewed commit", () => {
    const toolchain = JSON.parse(readFileSync(path.join(root, "toolchain.json"), "utf8")) as {
      rustToolchainAction: string;
    };

    expect(toolchain.rustToolchainAction).toMatch(/^[0-9a-f]{40}$/);
    for (const name of rustToolchainWorkflows) {
      const source = workflow(name);
      expect(source, name).toContain(
        `uses: dtolnay/rust-toolchain@${toolchain.rustToolchainAction}`,
      );
      expect(source, name).not.toContain("dtolnay/rust-toolchain@master");
    }
  });

  it("grants Pages credentials only to the deployment job", () => {
    const source = workflow("deploy-pages.yml");
    const qualityJob = source.indexOf("  quality-build:");
    const deployJob = source.indexOf("  deploy:");

    expect(source.slice(0, source.indexOf("jobs:"))).toContain("contents: read");
    expect(qualityJob).toBeGreaterThan(0);
    expect(deployJob).toBeGreaterThan(qualityJob);
    expect(source.slice(qualityJob, deployJob)).not.toContain("pages: write");
    expect(source.slice(qualityJob, deployJob)).not.toContain("id-token: write");
    expect(source.slice(deployJob)).toContain("pages: write");
    expect(source.slice(deployJob)).toContain("id-token: write");
    expect(source.slice(deployJob)).toContain("needs: quality-build");
  });
});
