import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  createExportFilename,
  parseProject,
  validateProject,
  type ArchiveManifest,
  type LyricBookProject,
} from "@domain/index";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 150;

function validateArchivePath(path: string): void {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized === ".." ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(normalized)) {
    throw new Error("Nested archives are not accepted");
  }
}

export function createProjectArchive(
  project: LyricBookProject,
  appVersion: string,
): {
  blob: Blob;
  filename: string;
} {
  const exportedAt = new Date().toISOString();
  const manifest: ArchiveManifest = {
    format: "lyricbook-project",
    formatVersion: 1,
    appVersion,
    schemaVersion: project.schemaVersion,
    projectId: project.id,
    createdAt: project.createdAt ?? exportedAt,
    exportedAt,
    revisionId: project.revisionId ?? crypto.randomUUID(),
    entrypoint: "project.json",
  };
  const zip = zipSync(
    {
      "manifest.json": strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
      "project.json": strToU8(`${JSON.stringify(project, null, 2)}\n`),
    },
    { level: 6 },
  );
  return {
    blob: new Blob([zip], { type: "application/vnd.iocky.lyricbook+zip" }),
    filename: createExportFilename(project.id, "lyricbook"),
  };
}

export function readProjectArchive(bytes: Uint8Array): LyricBookProject {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Archive is too large");
  const files = unzipSync(bytes, {
    filter(file) {
      validateArchivePath(file.name);
      return true;
    },
  });
  const names = Object.keys(files);
  if (names.length > MAX_FILES) throw new Error("Archive contains too many files");
  const total = Object.values(files).reduce<number>((sum, value) => sum + value.byteLength, 0);
  if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("Expanded archive is too large");
  const manifestData = files["manifest.json"];
  const projectData = files["project.json"];
  if (!manifestData || !projectData)
    throw new Error("Archive is missing manifest.json or project.json");
  const manifest = JSON.parse(strFromU8(manifestData)) as ArchiveManifest;
  if (manifest.format !== "lyricbook-project" || manifest.formatVersion !== 1) {
    throw new Error("Unsupported LyricBook archive format");
  }
  return parseProject(JSON.parse(strFromU8(projectData)));
}

export async function importProjectFile(file: File): Promise<unknown> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("File is too large");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".lyricbook"))
    return readProjectArchive(new Uint8Array(await file.arrayBuffer()));
  if (lower.endsWith(".json")) return JSON.parse(await file.text());
  return await file.text();
}

export async function importHttpsUrl(urlString: string): Promise<unknown> {
  const url = new URL(urlString);
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are accepted");
  const response = await fetch(url, { method: "GET", credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`Remote import failed with HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ARCHIVE_BYTES) throw new Error("Remote file is too large");
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("zip") || url.pathname.endsWith(".lyricbook")) {
    return readProjectArchive(new Uint8Array(await response.arrayBuffer()));
  }
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    const result = validateProject(parsed);
    return result.ok ? parseProject(parsed) : parsed;
  } catch {
    return text;
  }
}
