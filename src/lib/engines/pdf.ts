import { baseName } from "../util";
import type { OutputFile } from "../types";

export interface PdfOps {
  pages?: number[]; // zero-based indices, already parsed
  rotate?: 90 | 180 | 270;
  scalePercent?: number;
  /** Crop margins as a percentage of each edge (0–40). */
  margins?: { top: number; right: number; bottom: number; left: number };
  order?: number[]; // for organize: new page order, zero-based
}

const pdfBlob = (bytes: Uint8Array) =>
  new Blob([bytes as BlobPart], { type: "application/pdf" });

async function load(file: File) {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
  });
  return { PDFDocument, src };
}

export async function pdfPageCount(file: File): Promise<number> {
  const { src } = await load(file);
  return src.getPageCount();
}

export async function mergePdfs(
  files: File[],
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const src = await PDFDocument.load(await files[i].arrayBuffer(), {
      ignoreEncryption: true,
    });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress((i + 1) / (files.length + 0.4));
  }
  const bytes = await out.save();
  onProgress(1);
  return [{ name: "merged.pdf", blob: pdfBlob(bytes) }];
}

export async function splitPdf(
  file: File,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument, src } = await load(file);
  const n = src.getPageCount();
  const outs: OutputFile[] = [];
  for (let i = 0; i < n; i++) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    const bytes = await doc.save();
    outs.push({
      name: `${baseName(file.name)}-p${String(i + 1).padStart(2, "0")}.pdf`,
      blob: pdfBlob(bytes),
    });
    onProgress((i + 1) / n);
  }
  return outs;
}

export async function extractPages(
  file: File,
  ops: PdfOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument, src } = await load(file);
  const wanted = ops.pages ?? src.getPageIndices();
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, wanted);
  pages.forEach((p) => doc.addPage(p));
  onProgress(0.8);
  const bytes = await doc.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-extract.pdf`, blob: pdfBlob(bytes) }];
}

export async function removePages(
  file: File,
  ops: PdfOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument, src } = await load(file);
  const drop = new Set(ops.pages ?? []);
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (keep.length === 0) throw new Error("That would remove every page");
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, keep);
  pages.forEach((p) => doc.addPage(p));
  onProgress(0.8);
  const bytes = await doc.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-edited.pdf`, blob: pdfBlob(bytes) }];
}

export async function rotatePdf(
  file: File,
  ops: PdfOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { degrees } = await import("pdf-lib");
  const { src } = await load(file);
  const targets = ops.pages ?? src.getPageIndices();
  const set = new Set(targets);
  src.getPages().forEach((page, i) => {
    if (set.has(i)) {
      page.setRotation(degrees((page.getRotation().angle + (ops.rotate ?? 90)) % 360));
    }
  });
  onProgress(0.8);
  const bytes = await src.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-rotated.pdf`, blob: pdfBlob(bytes) }];
}

export async function flattenPdf(
  file: File,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { src } = await load(file);
  try {
    src.getForm().flatten();
  } catch {
    // No form fields — saving still normalizes annotations.
  }
  onProgress(0.8);
  const bytes = await src.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-flat.pdf`, blob: pdfBlob(bytes) }];
}

export async function resizePdf(
  file: File,
  ops: PdfOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const scale = (ops.scalePercent ?? 100) / 100;
  const { PDFDocument, src } = await load(file);
  const doc = await PDFDocument.create();
  const embedded = await doc.embedPages(src.getPages());
  embedded.forEach((ep, i) => {
    const page = doc.addPage([ep.width * scale, ep.height * scale]);
    page.drawPage(ep, { x: 0, y: 0, xScale: scale, yScale: scale });
    onProgress(((i + 1) / embedded.length) * 0.85);
  });
  const bytes = await doc.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-${ops.scalePercent}pct.pdf`, blob: pdfBlob(bytes) }];
}

export async function cropPdf(
  file: File,
  ops: PdfOps,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const m = ops.margins ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const { src } = await load(file);
  src.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const left = (m.left / 100) * width;
    const right = (m.right / 100) * width;
    const top = (m.top / 100) * height;
    const bottom = (m.bottom / 100) * height;
    const w = Math.max(24, width - left - right);
    const h = Math.max(24, height - top - bottom);
    page.setCropBox(left, bottom, w, h);
    page.setMediaBox(left, bottom, w, h);
  });
  onProgress(0.8);
  const bytes = await src.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-cropped.pdf`, blob: pdfBlob(bytes) }];
}

export async function reorderPdf(
  file: File,
  order: number[],
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { PDFDocument, src } = await load(file);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, order);
  pages.forEach((p) => doc.addPage(p));
  onProgress(0.85);
  const bytes = await doc.save();
  onProgress(1);
  return [{ name: `${baseName(file.name)}-organized.pdf`, blob: pdfBlob(bytes) }];
}
