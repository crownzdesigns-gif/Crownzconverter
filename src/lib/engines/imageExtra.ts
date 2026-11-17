import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";
import { decodeImage } from "./image";

/** PNG/raster → SVG via color tracing (imagetracerjs, fully client-side). */
export async function traceToSvg(
  file: File,
  opts: { svgColors?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  onProgress(0.15);
  const { source, width, height } = await decodeImage(file);
  // Tracing cost grows fast — cap the working resolution.
  const cap = 1200;
  const s = Math.min(1, cap / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * s));
  canvas.height = Math.max(1, Math.round(height * s));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  onProgress(0.4);

  const { default: ImageTracer } = await import("imagetracerjs");
  const svg = ImageTracer.imagedataToSVG(ctx.getImageData(0, 0, canvas.width, canvas.height), {
    numberofcolors: opts.svgColors ?? 16,
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    blurradius: 0,
    scale: 1 / s,
    roundcoords: 1,
  });
  onProgress(1);
  return [{ name: `${baseName(file.name)}.svg`, blob: new Blob([svg], { type: "image/svg+xml" }) }];
}

/** 2×/4× upscale: stepped high-quality resampling plus a mild unsharp pass. */
export async function upscaleImage(
  file: File,
  opts: { upFactor?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const factor = opts.upFactor === 4 ? 4 : 2;
  onProgress(0.1);
  const { source, width, height } = await decodeImage(file);
  if (Math.max(width, height) * factor > 10_000) {
    throw new Error(`${factor}× would exceed 10,000px — try a smaller image or 2×`);
  }

  // Doubling in steps keeps edges cleaner than one big jump.
  let current: CanvasImageSource = source;
  let w = width;
  let h = height;
  const steps = factor === 4 ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    const c = document.createElement("canvas");
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, c.width, c.height);
    current = c;
    w *= 2;
    h *= 2;
    onProgress(0.2 + 0.3 * (i + 1));
  }

  // Mild unsharp mask to recover perceived detail.
  const canvas = current as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, w, h);
  const sharp = sharpen(img, w, h, 0.35);
  ctx.putImageData(sharp, 0, 0);
  onProgress(0.9);

  const ext = extOf(file.name);
  const isJpg = ["jpg", "jpeg", "jfif"].includes(ext);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), isJpg ? "image/jpeg" : "image/png", 0.92),
  );
  onProgress(1);
  return [{ name: `${baseName(file.name)}-${factor}x.${isJpg ? "jpg" : "png"}`, blob }];
}

function sharpen(img: ImageData, w: number, h: number, amount: number): ImageData {
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const k = amount;
  const center = 1 + 4 * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
        continue;
      }
      const up = i - w * 4;
      const down = i + w * 4;
      const left = i - 4;
      const right = i + 4;
      for (let c = 0; c < 3; c++) {
        out[i + c] = center * src[i + c] - k * (src[up + c] + src[down + c] + src[left + c] + src[right + c]);
      }
      out[i + 3] = src[i + 3];
    }
  }
  return new ImageData(out, w, h);
}
