import { slugify } from "./ids";

function randomSuffix(): string {
  const values = crypto.getRandomValues(new Uint8Array(4));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function exportTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(".", "_").replace("Z", "Z");
}

export function createExportFilename(
  projectId: string,
  extension: "lyricbook" | "json" | "md" | "txt" | "theme.json" = "lyricbook",
  date = new Date(),
): string {
  return `lyricbook_${slugify(projectId, "project")}_${exportTimestamp(date)}_${randomSuffix()}.${extension}`;
}
