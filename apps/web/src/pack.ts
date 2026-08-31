const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}
function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}
function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function createLyricBookArchive(project) {
  const files = {
    "manifest.json": JSON.stringify({ format: "lyricbook", schemaVersion: 1, exportedAt: new Date().toISOString(), projectId: project.id }, null, 2),
    "project.json": JSON.stringify(project, null, 2)
  };
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data
    ]);
    localParts.push(local);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]));
    offset += local.length;
  }
  const central = concat(centralParts);
  const local = concat(localParts);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(centralParts.length), u16(centralParts.length), u32(central.length), u32(local.length), u16(0)]);
  return new Blob([local, central, end], { type: "application/vnd.iocky.lyricbook+zip" });
}

function readU16(view, offset) { return view.getUint16(offset, true); }
function readU32(view, offset) { return view.getUint32(offset, true); }

export async function readLyricBookArchive(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let offset = 0;
  while (offset + 30 <= bytes.length && readU32(view, offset) === 0x04034b50) {
    const method = readU16(view, offset + 8);
    if (method !== 0) throw new Error("Only safe stored ZIP entries are supported in v0.0.1.");
    const compressedSize = readU32(view, offset + 18);
    const nameLength = readU16(view, offset + 26);
    const extraLength = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\")) throw new Error("Unsafe archive path.");
    if (compressedSize > 10 * 1024 * 1024) throw new Error("Archive entry is too large.");
    const dataStart = nameStart + nameLength + extraLength;
    files[name] = decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  if (!files["project.json"]) throw new Error("project.json is missing.");
  return JSON.parse(files["project.json"]);
}

export function uniqueExportName(slug = "project") {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(".", "-");
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0").slice(0, 6);
  const clean = String(slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  return `lyricbook_${clean}_${stamp}_${suffix}.lyricbook`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
