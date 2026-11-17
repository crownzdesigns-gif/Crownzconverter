import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";

export type TargetFormat = "png" | "jpg" | "webp";

const MIME: Record<TargetFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export interface ImageOps {
  format?: TargetFormat | "original";
  quality?: number; // 0..100
  targetMode?: "quality" | "size";
  targetSizeKB?: number;
  /** Compressors set this: fall back to the untouched source if re-encoding grows it. */
  neverLarger?: boolean;
  resizeMode?: "percent" | "pixels";
  percent?: number;
  width?: number;
  height?: number;
  rotate?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  crop?: { x: number; y: number; w: number; h: number }; // source pixels
}

const isHeic = (f: File) => ["heic", "heif"].includes(extOf(f.name));

/** Sniff the real container so a JPEG/PNG mis-named ".heic" still decodes. */
async function sniff(file: File): Promise<"jpeg" | "png" | "heif" | "unknown"> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head[0] === 0xff && head[1] === 0xd8) return "jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e) return "png";
  const brand = String.fromCharCode(...head.slice(4, 8));
  if (brand === "ftyp") return "heif";
  return "unknown";
}

/**
 * HEIC → PNG blob. Tries, in order: the browser's own decoder (Safari and
 * recent Chrome can read HEIC natively), a current libheif build (heic-to,
 * which handles 10-bit / HDR / newer iPhone files), then the older heic2any.
 */
async function decodeHeic(file: File): Promise<Blob> {
  const kind = await sniff(file);
  if (kind === "jpeg" || kind === "png") return file;

  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width > 0) return file;
  } catch { /* no native HEIC support */ }

  const errors: string[] = [];
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "image/png" });
  } catch (e) {
    errors.push(String((e as Error)?.message ?? e));
  }
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/png" });
    return Array.isArray(out) ? out[0] : out;
  } catch (e) {
    errors.push(String((e as Error)?.message ?? e));
  }
  const hint = kind === "unknown" ? " (the file doesn't look like a HEIC container)" : "";
  throw new Error(`Couldn't decode this HEIC${hint}. It may use an unsupported codec or be a Live Photo/burst — try exporting it from Photos as JPG first.`);
}

/** Decode any supported image (incl. HEIC and SVG) into a drawable source. */
export async function decodeImage(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  let blob: Blob = file;

  if (isHeic(file)) blob = await decodeHeic(file);

  if (extOf(file.name) === "svg" || blob.type === "image/svg+xml") {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    try {
      img.src = url;
      await img.decode();
      const width = img.naturalWidth || 1024;
      const height = img.naturalHeight || 1024;
      return { source: img, width, height };
    } finally {
      // Image keeps the object URL alive until drawn; revoke a beat later.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  const bmp = await createImageBitmap(blob);
  return { source: bmp, width: bmp.width, height: bmp.height };
}

function drawToCanvas(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  ops: ImageOps,
  matte?: string,
): HTMLCanvasElement {
  const crop = ops.crop ?? { x: 0, y: 0, w: sw, h: sh };

  let outW = crop.w;
  let outH = crop.h;
  if (ops.resizeMode === "percent" && ops.percent && ops.percent !== 100) {
    outW = Math.max(1, Math.round(crop.w * (ops.percent / 100)));
    outH = Math.max(1, Math.round(crop.h * (ops.percent / 100)));
  } else if (ops.resizeMode === "pixels" && (ops.width || ops.height)) {
    if (ops.width && ops.height) {
      outW = ops.width;
      outH = ops.height;
    } else if (ops.width) {
      outW = ops.width;
      outH = Math.max(1, Math.round((crop.h / crop.w) * ops.width));
    } else if (ops.height) {
      outH = ops.height;
      outW = Math.max(1, Math.round((crop.w / crop.h) * ops.height));
    }
  }

  const rot = ops.rotate ?? 0;
  const swap = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? outH : outW;
  canvas.height = swap ? outW : outH;

  const ctx = canvas.getContext("2d")!;
  if (matte) {
    // JPEG has no alpha — transparent areas would otherwise turn black.
    ctx.fillStyle = matte;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1);
  ctx.drawImage(src as any, crop.x, crop.y, crop.w, crop.h, -outW / 2, -outH / 2, outW, outH);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, format: TargetFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      MIME[format],
      format === "png" ? undefined : quality,
    );
  });
}

function resolveFormat(file: File, ops: ImageOps): TargetFormat {
  if (ops.format && ops.format !== "original") return ops.format;
  const ext = extOf(file.name);
  if (["jpg", "jpeg", "jfif"].includes(ext)) return "jpg";
  if (ext === "webp") return "webp";
  return "png";
}

export async function processImage(
  file: File,
  ops: ImageOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  onProgress(0.1);
  const { source, width, height } = await decodeImage(file);
  onProgress(0.45);

  const format = resolveFormat(file, ops);
  const canvas = drawToCanvas(source, width, height, ops, format === "jpg" ? "#fff" : undefined);
  onProgress(0.65);

  const q = (ops.quality ?? 90) / 100;

  let blob: Blob;
  if (ops.targetMode === "size" && ops.targetSizeKB && format !== "png") {
    blob = await encodeToTargetSize(canvas, format, ops.targetSizeKB * 1024, onProgress);
  } else {
    blob = await encode(canvas, format, q);
  }

  // A compressor must never hand back a bigger file than it was given — if the
  // re-encode grew it (common for optimized PNGs) and nothing else changed
  // (same format family, no downscale), return the untouched source.
  const untouched =
    ops.neverLarger &&
    blob.size >= file.size &&
    format === resolveFormat(file, {}) &&
    (!ops.percent || ops.percent === 100);
  if (untouched) blob = file;

  onProgress(1);
  return [{ name: `${baseName(file.name)}.${format}`, blob }];
}

/**
 * Binary-search encoder quality to land just under a target byte size.
 * Falls back to downscaling when even the lowest quality is too large.
 */
async function encodeToTargetSize(
  canvas: HTMLCanvasElement,
  format: TargetFormat,
  targetBytes: number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  let work = canvas;
  for (let attempt = 0; attempt < 3; attempt++) {
    let lo = 0.02;
    let hi = 1;
    let best: Blob | null = null;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const b = await encode(work, format, mid);
      if (b.size <= targetBytes) {
        best = b;
        lo = mid;
      } else {
        hi = mid;
      }
      onProgress(0.65 + 0.3 * ((attempt * 7 + i + 1) / 21));
    }
    if (best) return best;
    // Even q=2% is too big — shrink dimensions toward the target and retry.
    const floor = await encode(work, format, 0.02);
    const scale = Math.sqrt(targetBytes / floor.size) * 0.95;
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(work.width * scale));
    next.height = Math.max(1, Math.round(work.height * scale));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(work, 0, 0, next.width, next.height);
    work = next;
  }
  return encode(work, format, 0.02);
}

/** Compose several images into one PDF (used by jpg-to-pdf / heic-to-pdf). */
export async function imagesToPdf(
  files: File[],
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const { source, width, height } = await decodeImage(file);
    // Normalize through canvas → JPEG so every input format embeds cleanly.
    const canvas = drawToCanvas(source, width, height, {}, "#fff");
    const jpg = await encode(canvas, "jpg", 0.92);
    const bytes = new Uint8Array(await jpg.arrayBuffer());
    const embedded = await doc.embedJpg(bytes);
    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    onProgress((i + 1) / (files.length + 0.3));
  }

  const bytes = await doc.save();
  onProgress(1);
  const name = files.length === 1 ? `${baseName(files[0].name)}.pdf` : "images.pdf";
  return [{ name, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }) }];
}
