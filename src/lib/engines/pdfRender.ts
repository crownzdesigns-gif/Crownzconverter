import { baseName } from "../util";
import type { OutputFile } from "../types";

/** Lazy pdf.js bootstrap — the worker is only fetched when a PDF tool runs. */
async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

export interface RenderOps {
  dpi?: number; // 72 = native size
  renderFormat?: "jpg" | "png";
  renderQuality?: number; // 0..100
  pages?: number[]; // zero-based
}

export async function renderPdfPages(
  file: File,
  ops: RenderOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const wanted = ops.pages ?? Array.from({ length: doc.numPages }, (_, i) => i);
  const scale = (ops.dpi ?? 150) / 72;
  const format = ops.renderFormat ?? "jpg";
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const quality = (ops.renderQuality ?? 90) / 100;

  const outs: OutputFile[] = [];
  for (let k = 0; k < wanted.length; k++) {
    const page = await doc.getPage(wanted[k] + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), mime, quality),
    );
    outs.push({
      name: `${baseName(file.name)}-p${String(wanted[k] + 1).padStart(2, "0")}.${format}`,
      blob,
    });
    onProgress((k + 1) / wanted.length);
  }
  await doc.destroy();
  return outs;
}

/** Small page thumbnails as data URLs (previews + Organize PDF). */
export async function pdfThumbnails(
  file: File,
  maxDim = 260,
  limit?: number,
): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = limit ? Math.min(limit, doc.numPages) : doc.numPages;
  const urls: string[] = [];
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = maxDim / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport } as any).promise;
    urls.push(canvas.toDataURL("image/jpeg", 0.8));
  }
  await doc.destroy();
  return urls;
}
