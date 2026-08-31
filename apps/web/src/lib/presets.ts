import { parseProject, type LyricBookProject, type PresetIndexEntry } from "@domain/index";

function resourceUrl(path: string): URL {
  return new URL(path.replace(/^\.\//, ""), document.baseURI);
}

export async function loadPresetIndex(): Promise<PresetIndexEntry[]> {
  const response = await fetch(resourceUrl("content/presets/index.json"), { cache: "no-cache" });
  if (!response.ok) throw new Error("Unable to load preset index");
  return (await response.json()) as PresetIndexEntry[];
}

export async function loadPreset(entry: PresetIndexEntry): Promise<LyricBookProject> {
  const response = await fetch(resourceUrl(entry.path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load preset ${entry.id}`);
  return parseProject(await response.json());
}
