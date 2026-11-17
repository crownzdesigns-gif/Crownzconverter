/**
 * Shared PDF text extraction.
 *
 * pdf.js hands back raw positioned glyph runs — often several per word, in
 * content-stream order, with no notion of lines, paragraphs, headings or
 * columns. This module rebuilds that structure so PDF → DOCX / EPUB / TXT
 * produce something that reads like the original document.
 */

export type BlockKind = "h1" | "h2" | "p" | "li";

export interface PdfBlock {
  kind: BlockKind;
  text: string;
  bold?: boolean;
}

/** Minimal shape of a pdf.js text item we rely on. */
export interface RawItem {
  str: string;
  transform: number[];
  width: number;
  height?: number;
  fontName?: string;
}

export interface FontInfo {
  bold?: boolean;
  italic?: boolean;
}

interface Part {
  x: number;
  x1: number;
  str: string;
  size: number;
  bold: boolean;
}

interface Segment {
  x0: number;
  x1: number;
  y: number;
  size: number;
  bold: boolean;
  text: string;
}

const BULLET_RE = /^[•·▪◦‣●○■□➢➤►▶✓✔\-–—*]\s+/;
const NUMBERED_RE = /^(\(?\d{1,3}[.)]|[a-zA-Z][.)]|[ivxIVX]{1,5}[.)])\s+/;
const NOISE_RE = /^(\d{1,4}|page\s+\d+(\s+of\s+\d+)?|[ivxlc]+)$/i;

/* ── 1. items → lines → segments ── */

function buildSegments(items: RawItem[], fonts: Record<string, FontInfo>): Segment[] {
  const parts: Array<Part & { y: number }> = [];
  for (const item of items) {
    if (!item.str) continue;
    const [a, b, , , x, y] = item.transform;
    const size = Math.hypot(a, b) || item.height || 10;
    if (size < 3) continue; // invisible / decorative
    const width = item.width > 0 ? item.width : item.str.length * size * 0.5;
    parts.push({ x, x1: x + width, y, str: item.str, size, bold: !!fonts[item.fontName ?? ""]?.bold });
  }
  if (!parts.length) return [];

  // Group parts into baselines. Sort by y (top of page first) then x.
  parts.sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: Array<Array<Part & { y: number }>> = [];
  for (const part of parts) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - part.y) <= Math.max(last[0].size, part.size) * 0.45) last.push(part);
    else lines.push([part]);
  }

  // Within each line, join parts into words and split on column-sized gaps.
  const segments: Segment[] = [];
  for (const line of lines) {
    line.sort((p, q) => p.x - q.x);
    let cur: Segment | null = null;
    let prev: Part | null = null;
    for (const part of line) {
      const isSpace = !part.str.trim();
      if (!cur) {
        if (isSpace) continue;
        cur = { x0: part.x, x1: part.x1, y: part.y, size: part.size, bold: part.bold, text: part.str };
        prev = part;
        continue;
      }
      const gap = part.x - prev!.x1;
      const em = Math.max(part.size, prev!.size);
      if (gap > em * 2.5 && cur.text.trim()) {
        // A gap this wide is a column boundary or a table cell — start a new segment.
        segments.push(cur);
        if (isSpace) { cur = null; prev = null; continue; }
        cur = { x0: part.x, x1: part.x1, y: part.y, size: part.size, bold: part.bold, text: part.str };
        prev = part;
        continue;
      }
      if (isSpace) {
        if (!cur.text.endsWith(" ")) cur.text += " ";
        prev = { ...part, x1: Math.max(prev!.x1, part.x1) };
        continue;
      }
      const needsSpace = !cur.text.endsWith(" ") && !part.str.startsWith(" ") && gap > em * 0.12;
      cur.text += (needsSpace ? " " : "") + part.str;
      cur.x1 = Math.max(cur.x1, part.x1);
      cur.size = Math.max(cur.size, part.size);
      // A line is "bold" only if most of it is bold.
      if (!part.bold) cur.bold = cur.bold && part.str.trim().length < 3;
      prev = part;
    }
    if (cur) segments.push(cur);
  }

  return segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text && !NOISE_RE.test(s.text));
}

/* ── 2. reading order (single or two-column) ── */

function readingOrder(segs: Segment[]): Segment[] {
  if (segs.length < 4) return segs;
  const minX = Math.min(...segs.map((s) => s.x0));
  const maxX = Math.max(...segs.map((s) => s.x1));
  const mid = (minX + maxX) / 2;
  const eps = (maxX - minX) * 0.06;
  const spans = (s: Segment) => s.x0 < mid - eps && s.x1 > mid + eps;

  // Full-width segments (titles, abstracts, body paragraphs) split the page
  // into bands. A band whose lines sit clearly left or clearly right of the
  // middle is a two-column region and reads left column first, then right.
  const out: Segment[] = [];
  let band: Segment[] = [];
  const flush = () => {
    const l = band.filter((s) => s.x1 <= mid + eps);
    const r = band.filter((s) => s.x0 >= mid - eps);
    const rightStarts = r.map((s) => s.x0);
    const rightAligned = r.length >= 2 && Math.max(...rightStarts) - Math.min(...rightStarts) < r[0].size * 2;
    if (l.length >= 2 && rightAligned && l.length + r.length === band.length) out.push(...l, ...r);
    else out.push(...band);
    band = [];
  };
  for (const s of segs) {
    if (spans(s)) { flush(); out.push(s); }
    else band.push(s);
  }
  flush();
  return out;
}

/* ── 3. segments → blocks ── */

function bodySize(segs: Segment[]): number {
  const tally = new Map<number, number>();
  for (const s of segs) {
    const k = Math.round(s.size * 2) / 2;
    tally.set(k, (tally.get(k) ?? 0) + s.text.length);
  }
  let best = 10;
  let bestN = -1;
  for (const [k, n] of tally) if (n > bestN) { best = k; bestN = n; }
  return best;
}

export function layoutPage(items: RawItem[], fonts: Record<string, FontInfo> = {}): PdfBlock[] {
  const segs = readingOrder(buildSegments(items, fonts));
  if (!segs.length) return [];
  const body = bodySize(segs);
  // Right edge of the column each segment lives in (segments sharing a left edge).
  const rightEdge = new Map<Segment, number>();
  for (const s of segs) {
    let edge = s.x1;
    for (const o of segs) if (Math.abs(o.x0 - s.x0) <= s.size * 1.5 && o.x1 > edge) edge = o.x1;
    rightEdge.set(s, edge);
  }

  interface Open { block: PdfBlock; last: Segment; }
  const blocks: PdfBlock[] = [];
  let open: Open | null = null;

  const kindOf = (s: Segment): BlockKind => {
    if (s.size >= body * 1.45) return "h1";
    if (s.size >= body * 1.15 || (s.bold && s.text.length < 90 && !/[.,;:]$/.test(s.text))) return "h2";
    if (BULLET_RE.test(s.text)) return "li";
    return "p";
  };

  for (const s of segs) {
    let kind = kindOf(s);
    let text = s.text;
    if (kind === "li") text = text.replace(BULLET_RE, "");

    if (open) {
      const p = open.last;
      const gap = p.y - s.y;
      const sameSize = Math.abs(p.size - s.size) <= Math.max(p.size, s.size) * 0.12;
      const sameStyle = sameSize && p.bold === s.bold;
      const tight = gap >= 0 && gap <= Math.max(p.size, s.size) * 1.75;
      const columnJump = gap < -p.size; // moved up the page: next column / band
      const indented = s.x0 > p.x0 + p.size * 1.2;
      const prevShort = p.x1 < (rightEdge.get(p) ?? p.x1) - p.size * 3 && /[.!?:;"”)]$/.test(p.text);
      const prevKind = open.block.kind;
      const continuesList = prevKind === "li" && kind === "p" && s.x0 >= p.x0 - p.size * 0.5;
      const continuesHead = (prevKind === "h1" || prevKind === "h2") && kind === prevKind;
      const continuesPara = prevKind === "p" && kind === "p";

      const merge =
        sameStyle && (tight || columnJump) && !indented && !prevShort &&
        !NUMBERED_RE.test(s.text) &&
        (continuesPara || continuesList || continuesHead);

      if (merge) {
        const prevText = open.block.text;
        if (/[A-Za-z]-$/.test(prevText) && /^[a-z]/.test(text)) open.block.text = prevText.slice(0, -1) + text;
        else open.block.text = `${prevText} ${text}`;
        open.last = s;
        continue;
      }
    }

    // Numbered items read better as their own paragraph, keeping the number.
    if (kind === "p" && NUMBERED_RE.test(text)) kind = "p";
    const block: PdfBlock = { kind, text, bold: s.bold || undefined };
    blocks.push(block);
    open = { block, last: s };
  }
  return blocks;
}

/* ── 4. public API ── */

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

/** Structured blocks per page, in reading order. */
export async function extractPdfBlocks(
  file: File,
  onProgress: (p: number) => void = () => {},
): Promise<PdfBlock[][]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: PdfBlock[][] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    // Fonts are only shipped to the main thread once the operator list has been
    // built — we need them to tell bold runs (headings) from body text.
    try { await page.getOperatorList(); } catch { /* text still extractable */ }
    const content = await page.getTextContent();
    const items = content.items as RawItem[];

    const fonts: Record<string, FontInfo> = {};
    for (const item of items) {
      const name = item.fontName;
      if (!name || fonts[name]) continue;
      let info: FontInfo = {};
      try {
        const f = page.commonObjs.has(name) ? (page.commonObjs.get(name) as { name?: string; bold?: boolean; italic?: boolean; black?: boolean }) : null;
        const fname = f?.name ?? "";
        info = {
          bold: !!f?.bold || !!f?.black || /bold|black|heavy|semibold|demibold/i.test(fname),
          italic: !!f?.italic || /italic|oblique/i.test(fname),
        };
      } catch { /* font not available */ }
      fonts[name] = info;
    }

    pages.push(layoutPage(items, fonts));
    onProgress(n / doc.numPages);
  }
  await doc.destroy();
  return pages;
}

/** Back-compat: plain paragraphs per page. */
export async function extractPdfParagraphs(
  file: File,
  onProgress: (p: number) => void = () => {},
): Promise<string[][]> {
  const pages = await extractPdfBlocks(file, onProgress);
  return pages.map((blocks) => blocks.map((b) => (b.kind === "li" ? `• ${b.text}` : b.text)));
}
