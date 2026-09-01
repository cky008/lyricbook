import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createBlankProject, type ArchiveManifest } from "@domain/index";
import {
  createProjectArchive,
  importHttpsUrl,
  importProjectFile,
  readProjectArchive,
} from "@app/lib/archive";
import { requireValue } from "./test-utils";

function archiveBytes(
  project = createBlankProject("en-US"),
  manifestOverrides: Partial<ArchiveManifest> = {},
): Uint8Array {
  const now = "2026-09-01T00:00:00.000Z";
  const manifest: ArchiveManifest = {
    format: "lyricbook-project",
    formatVersion: 1,
    appVersion: "0.0.4",
    schemaVersion: project.schemaVersion,
    projectId: project.id,
    createdAt: now,
    exportedAt: now,
    revisionId: "revision-test",
    entrypoint: "project.json",
    ...manifestOverrides,
  };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "project.json": strToU8(JSON.stringify(project)),
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(".lyricbook archive", () => {
  it("round-trips a project and writes a complete manifest", async () => {
    const project = createBlankProject("en-US");
    project.createdAt = undefined;
    project.revisionId = undefined;
    const archive = createProjectArchive(project, "0.0.4");
    const files = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
    const manifestBytes = requireValue(files["manifest.json"]);
    const manifest = JSON.parse(strFromU8(manifestBytes)) as ArchiveManifest;
    expect(manifest.createdAt).toBe(manifest.exportedAt);
    expect(manifest.revisionId).toBeTruthy();
    expect(archive.filename).toMatch(/^lyricbook_/);
    expect(readProjectArchive(archiveBytes(project)).id).toBe(project.id);
  });

  it.each(["../project.json", "..\\project.json", "/absolute.json", "C:/windows.json"])(
    "rejects unsafe archive path %s",
    (name) => {
      const malicious = zipSync({ [name]: strToU8("{}") });
      expect(() => readProjectArchive(malicious)).toThrow(/Unsafe archive path/);
    },
  );

  it("rejects nested archives, oversized input, too many files, and missing entries", () => {
    expect(() => readProjectArchive(zipSync({ "nested.zip": strToU8("x") }))).toThrow(
      /Nested archives/,
    );
    expect(() => readProjectArchive(new Uint8Array(25 * 1024 * 1024 + 1))).toThrow(
      /Archive is too large/,
    );

    const many = Object.fromEntries(
      Array.from({ length: 151 }, (_, index) => [`file-${index}.txt`, strToU8("x")]),
    );
    expect(() => readProjectArchive(zipSync(many))).toThrow(/too many files/);
    expect(() => readProjectArchive(zipSync({ "manifest.json": strToU8("{}") }))).toThrow(
      /missing manifest\.json or project\.json/,
    );
  });

  it("rejects unsupported manifests", () => {
    const project = createBlankProject("en-US");
    const bytes = archiveBytes(project, { formatVersion: 2 as 1 });
    expect(() => readProjectArchive(bytes)).toThrow(/Unsupported LyricBook archive format/);
  });

  it("imports archive, JSON, and text files while enforcing the size limit", async () => {
    const project = createBlankProject("en-US");
    const archiveFile = new File([toArrayBuffer(archiveBytes(project))], "project.lyricbook");
    await expect(importProjectFile(archiveFile)).resolves.toMatchObject({ id: project.id });

    const jsonFile = new File([JSON.stringify({ hello: "world" })], "data.json");
    await expect(importProjectFile(jsonFile)).resolves.toEqual({ hello: "world" });

    const textFile = new File(["Song A\nSong B"], "setlist.md");
    await expect(importProjectFile(textFile)).resolves.toBe("Song A\nSong B");

    const oversized = { size: 25 * 1024 * 1024 + 1, name: "large.json" } as File;
    await expect(importProjectFile(oversized)).rejects.toThrow(/File is too large/);
  });

  it("imports explicit HTTPS responses across archive, project, JSON, and text branches", async () => {
    const project = createBlankProject("en-US");
    await expect(importHttpsUrl("http://example.test/file.json")).rejects.toThrow(/Only HTTPS/);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    await expect(importHttpsUrl("https://example.test/missing")).rejects.toThrow(/HTTP 404/);

    fetchMock.mockResolvedValueOnce(
      new Response("large", { headers: { "content-length": String(25 * 1024 * 1024 + 1) } }),
    );
    await expect(importHttpsUrl("https://example.test/large")).rejects.toThrow(/too large/);

    fetchMock.mockResolvedValueOnce(
      new Response(toArrayBuffer(archiveBytes(project)), {
        headers: { "content-type": "application/zip" },
      }),
    );
    await expect(importHttpsUrl("https://example.test/project.bin")).resolves.toMatchObject({
      id: project.id,
    });

    fetchMock.mockResolvedValueOnce(new Response(toArrayBuffer(archiveBytes(project))));
    await expect(importHttpsUrl("https://example.test/project.lyricbook")).resolves.toMatchObject({
      id: project.id,
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(project)));
    await expect(importHttpsUrl("https://example.test/project.json")).resolves.toMatchObject({
      id: project.id,
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ arbitrary: true })));
    await expect(importHttpsUrl("https://example.test/arbitrary.json")).resolves.toEqual({
      arbitrary: true,
    });

    fetchMock.mockResolvedValueOnce(new Response("plain text"));
    await expect(importHttpsUrl("https://example.test/setlist.txt")).resolves.toBe("plain text");
  });
});
