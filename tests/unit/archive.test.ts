import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createBlankProject } from "@domain/index";
import { createProjectArchive, readProjectArchive } from "@app/lib/archive";

describe(".lyricbook archive", () => {
  it("round-trips a project", async () => {
    const project = createBlankProject("en-US");
    const archive = createProjectArchive(project, "0.0.3");
    const imported = readProjectArchive(new Uint8Array(await archive.blob.arrayBuffer()));
    expect(imported.id).toBe(project.id);
  });

  it("rejects path traversal", () => {
    const malicious = zipSync({ "../project.json": strToU8("{}") });
    expect(() => readProjectArchive(malicious)).toThrow(/Unsafe archive path/);
  });
});
