import { baseName } from "../util";
import type { OutputFile } from "../types";

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: "application/pdf" });

/**
 * Compress a PDF by re-rasterizing each page to JPEG at a chosen DPI —
 * the same approach Ghostscript's ebook/screen presets take, done locally.
 */
export async function compressPdf(
  file: File,
  opts: { dpi?: number; quality?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const { PDFDocument } = await import("pdf-lib");

  const dpi = opts.dpi ?? 110;
  const quality = (opts.quality ?? 70) / 100;
  const scale = dpi / 72;

  const src = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = await PDFDocument.create();

  for (let n = 1; n <= src.numPages; n++) {
    const page = await src.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport } as never).promise;

    const jpg = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Page encode failed"))), "image/jpeg", quality),
    );
    const embedded = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const base = page.getViewport({ scale: 1 });
    const p = out.addPage([base.width, base.height]);
    p.drawImage(embedded, { x: 0, y: 0, width: base.width, height: base.height });
    onProgress(n / src.numPages);
  }
  await src.destroy();

  const bytes = await out.save();
  const blob = pdfBlob(bytes);
  // Never hand back a bigger file than the source.
  if (blob.size >= file.size) {
    return [{ name: `${baseName(file.name)}-compressed.pdf`, blob: file }];
  }
  return [{ name: `${baseName(file.name)}-compressed.pdf`, blob }];
}

/** Strip encryption/permissions from a PDF the user owns. */
export async function unlockPdf(file: File, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const { PDFDocument } = await import("pdf-lib");
  let src;
  try {
    src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error("This PDF's content is fully encrypted and can't be unlocked in-browser");
  }
  onProgress(0.7);
  const bytes = await src.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-unlocked.pdf`, blob: pdfBlob(bytes) }];
}

/** Password-protect a PDF (AES encryption via the pdf-lib encrypt fork). */
export async function protectPdf(
  file: File,
  password: string,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  if (!password.trim()) throw new Error("Enter a password first");
  const { PDFDocument } = await import("pdf-lib-plus-encrypt");
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  onProgress(0.4);
  await (doc as unknown as {
    encrypt(o: { userPassword: string; ownerPassword: string }): Promise<void>;
  }).encrypt({ userPassword: password, ownerPassword: password });
  onProgress(0.75);
  const bytes = await doc.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-protected.pdf`, blob: pdfBlob(bytes) }];
}
