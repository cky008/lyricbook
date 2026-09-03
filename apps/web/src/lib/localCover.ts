import {
  inspectRasterImage,
  LOCAL_COVER_MAX_BYTES,
  LOCAL_COVER_MAX_PIXELS,
  type LocalCoverImage,
  sniffRasterImageType,
} from "@domain/index";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 2480;
const MAX_OUTPUT_BYTES = LOCAL_COVER_MAX_BYTES;

type CoverMediaType = LocalCoverImage["mediaType"];

export function sniffCoverImageType(bytes: Uint8Array): CoverMediaType | undefined {
  return sniffRasterImageType(bytes);
}

function loadLocalImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    const cleanup = () => URL.revokeObjectURL(url);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("The selected cover image could not be decoded"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The cover image could not be encoded"))),
      "image/jpeg",
      quality,
    );
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The cover image could not be read"));
    reader.onerror = () => reject(reader.error ?? new Error("The cover image could not be read"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decode and re-encode a local raster image before persistence. Re-encoding
 * strips metadata and bounds storage size; no original file name is retained.
 */
export async function processLocalCoverImage(file: File): Promise<LocalCoverImage> {
  if (file.size <= 0 || file.size > MAX_INPUT_BYTES) {
    throw new Error("Cover images must be between 1 byte and 10 MiB");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = sniffCoverImageType(bytes);
  if (!detectedType) throw new Error("Choose a JPEG, PNG, or WebP cover image");
  const imageInfo = inspectRasterImage(bytes);
  if (!imageInfo) throw new Error("The selected cover image has an invalid raster header");
  if (file.type && file.type !== detectedType) {
    throw new Error("The cover image contents do not match its file type");
  }
  if (imageInfo.width > Math.floor(LOCAL_COVER_MAX_PIXELS / imageInfo.height)) {
    throw new Error("The selected cover image has too many pixels");
  }

  const image = await loadLocalImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("The selected cover image has invalid dimensions");
  }
  if (image.naturalWidth > Math.floor(LOCAL_COVER_MAX_PIXELS / image.naturalHeight)) {
    throw new Error("The selected cover image has too many pixels");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser could not prepare the cover image");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let encoded = await canvasBlob(canvas, 0.9);
  if (encoded.size > MAX_OUTPUT_BYTES) encoded = await canvasBlob(canvas, 0.78);
  if (encoded.size > MAX_OUTPUT_BYTES) {
    throw new Error("The processed cover image is too large to store safely");
  }
  return {
    dataUrl: await blobDataUrl(encoded),
    mediaType: "image/jpeg",
    width,
    height,
    byteLength: encoded.size,
  };
}
