import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";
import type { PdfBlock } from "./pdfText";

/** An inline styled run of text. */
export interface TextRunSpec {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** A paragraph-level block extracted from any document source. */
export interface TextBlock {
  kind: "h1" | "h2" | "p" | "li" | "image";
  text: string;
  /** Inline styling; when absent the whole block is plain. */
  runs?: TextRunSpec[];
  /** For kind === "image": raw bytes + mime. */
  image?: { data: Uint8Array; mime: string };
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── shared text → PDF layout ── */

const ASCIIFY: Array<[RegExp, string]> = [
  [/[‘’ʼ]/g, "'"],
  [/[“”„]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/[  -​]/g, " "],
  [/[•●▪◦‣]/g, "•"],
];

function sanitize(text: string): string {
  let out = text;
  for (const [re, rep] of ASCIIFY) out = out.replace(re, rep);
  // Helvetica is WinAnsi — drop anything it can't encode.
  return out.replace(/[^\x20-\x7E¡-ÿ•]/g, "").replace(/\s+/g, " ");
}

export async function blocksToPdf(blocks: TextBlock[], outName: string): Promise<OutputFile> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const pick = (bold?: boolean, italic?: boolean) =>
    bold && italic ? fonts.boldItalic : bold ? fonts.bold : italic ? fonts.italic : fonts.regular;

  const PW = 595.28; // A4
  const PH = 841.89;
  const M = 60;
  const width = PW - M * 2;
  const ink = rgb(0.1, 0.1, 0.12);

  let page = doc.addPage([PW, PH]);
  let y = PH - M;

  const ensure = (need: number) => {
    if (y - need < M) {
      page = doc.addPage([PW, PH]);
      y = PH - M;
    }
  };

  for (const block of blocks) {
    if (block.kind === "image" && block.image) {
      try {
        const img = block.image.mime.includes("png")
          ? await doc.embedPng(block.image.data)
          : await doc.embedJpg(block.image.data);
        const scale = Math.min(1, width / img.width, (PH - M * 2) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ensure(h + 8);
        y -= h + 4;
        page.drawImage(img, { x: M + (width - w) / 2, y, width: w, height: h });
        y -= 8;
      } catch {
        // Unsupported image codec (EMF, TIFF…) — skip silently.
      }
      continue;
    }

    const isHead = block.kind === "h1" || block.kind === "h2";
    const size = block.kind === "h1" ? 19 : block.kind === "h2" ? 14 : 11;
    const lead = size * 1.42;
    const indent = block.kind === "li" ? 14 : 0;

    // Tokenize into styled words so wrapping can cross run boundaries. A word
    // may span runs ("italic" + "." / "re" + "**bold**") — pieces glue together
    // when no whitespace separates them.
    const runs: TextRunSpec[] = block.runs?.length ? block.runs : [{ text: block.text }];
    type Font = typeof fonts.regular;
    interface Piece { text: string; font: Font }
    type Tok = Piece[];
    const toks: Tok[] = [];
    if (block.kind === "li") toks.push([{ text: "•", font: fonts.regular }]);
    let glue = false;
    for (const r of runs) {
      const font = pick(isHead || r.bold, r.italic);
      const clean = sanitize(r.text);
      if (!clean) continue;
      const words = clean.split(" ");
      words.forEach((w, i) => {
        if (i === 0 && glue && w && toks.length && !(block.kind === "li" && toks.length === 1)) toks[toks.length - 1].push({ text: w, font });
        else if (w) toks.push([{ text: w, font }]);
      });
      glue = !clean.endsWith(" ");
    }
    if (!toks.length) continue;

    const tokW = (t: Tok) => t.reduce((a, p) => a + p.font.widthOfTextAtSize(p.text, size), 0);
    const spaceW = fonts.regular.widthOfTextAtSize(" ", size);
    const lines: Tok[][] = [];
    let line: Tok[] = [];
    let lineW = 0;
    for (const t of toks) {
      const w = tokW(t);
      const add = line.length ? spaceW + w : w;
      if (line.length && lineW + add > width - indent) {
        lines.push(line);
        line = [t];
        lineW = w;
      } else {
        line.push(t);
        lineW += add;
      }
    }
    if (line.length) lines.push(line);

    ensure(lead * Math.min(lines.length, 2) + (isHead ? 10 : 0));
    if (isHead) y -= 8;
    lines.forEach((ln, i) => {
      ensure(lead);
      y -= lead;
      let x = M + (block.kind === "li" && i > 0 ? indent : 0);
      ln.forEach((t, j) => {
        // First token of a list item is the bullet, hanging in the indent.
        const isBullet = block.kind === "li" && i === 0 && j === 0;
        for (const p of t) {
          page.drawText(p.text, { x, y, size, font: p.font, color: ink });
          x += p.font.widthOfTextAtSize(p.text, size);
        }
        x = isBullet ? M + indent : x + spaceW;
      });
    });
    y -= isHead ? 5 : 4;
  }

  const bytes = await doc.save();
  return { name: outName, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }) };
}

/* ── source parsing ── */

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "div", "section", "article", "body", "main", "table", "tr", "blockquote", "pre", "header", "footer", "figure", "img", "br"]);

function decodeDataUrl(src: string): { data: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(src);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { data, mime: m[1].toLowerCase() };
  } catch {
    return null;
  }
}

/** Collect styled inline runs beneath an element (text nodes only). */
function inlineRuns(el: Node, bold = false, italic = false, out: TextRunSpec[] = []): TextRunSpec[] {
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent ?? "";
      if (t) out.push({ text: t, bold, italic });
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const tag = (n as Element).tagName.toLowerCase();
      if (tag === "br") out.push({ text: " " });
      else if (tag === "img") return;
      else inlineRuns(n, bold || tag === "b" || tag === "strong", italic || tag === "i" || tag === "em", out);
    }
  });
  return out;
}

function normalizeRuns(runs: TextRunSpec[]): { text: string; runs: TextRunSpec[] } {
  // Collapse whitespace across the run list and merge adjacent identical styles.
  const merged: TextRunSpec[] = [];
  for (const r of runs) {
    const text = r.text.replace(/\s+/g, " ");
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && !!last.bold === !!r.bold && !!last.italic === !!r.italic) last.text += text;
    else merged.push({ text, bold: r.bold, italic: r.italic });
  }
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  }
  return { text: merged.map((r) => r.text).join("").trim(), runs: merged.filter((r) => r.text) };
}

export function htmlToBlocks(html: string): TextBlock[] {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const blocks: TextBlock[] = [];

  const pushText = (kind: TextBlock["kind"], el: Element) => {
    const { text, runs } = normalizeRuns(inlineRuns(el));
    if (text) blocks.push({ kind, text, runs });
    // Images nested inside the paragraph come out after its text.
    el.querySelectorAll("img").forEach(pushImage);
  };
  const pushImage = (img: Element) => {
    const decoded = decodeDataUrl(img.getAttribute("src") ?? "");
    if (decoded && /png|jpe?g/.test(decoded.mime)) blocks.push({ kind: "image", text: "", image: decoded });
  };

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "img") { pushImage(child); continue; }
      if (tag === "table") {
        for (const row of Array.from(child.querySelectorAll("tr"))) {
          const cells = Array.from(row.querySelectorAll("td,th"))
            .map((c) => c.textContent?.replace(/\s+/g, " ").trim())
            .filter(Boolean);
          if (cells.length) blocks.push({ kind: "p", text: cells.join("  ·  ") });
        }
        continue;
      }
      const hasBlockChildren = Array.from(child.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) && c.tagName.toLowerCase() !== "br" && c.tagName.toLowerCase() !== "img");
      if (tag === "h1") pushText("h1", child);
      else if (/^h[2-6]$/.test(tag)) pushText("h2", child);
      else if (tag === "li" && !hasBlockChildren) pushText("li", child);
      else if (tag === "li") {
        // <li><p>…</p><ul>…</ul></li>: leading inline/paragraph content is the
        // item, nested lists follow as their own items.
        const clone = child.cloneNode(true) as Element;
        clone.querySelectorAll("ul,ol").forEach((n) => n.remove());
        pushText("li", clone);
        for (const nested of Array.from(child.children)) if (["ul", "ol"].includes(nested.tagName.toLowerCase())) walk(nested);
      }
      else if (hasBlockChildren || ["ul", "ol", "div", "section", "article", "body", "main", "header", "footer", "figure", "blockquote"].includes(tag)) walk(child);
      else pushText("p", child);
    }
  };
  walk(dom.body);
  return blocks;
}

export function txtToBlocks(text: string): TextBlock[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((p) => ({ kind: "p" as const, text: p }));
}

/** Small Markdown subset: headings, bullets, paragraphs, bold/italic. */
export function markdownToBlocks(md: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const inline = (s: string): TextRunSpec[] => {
    const runs: TextRunSpec[] = [];
    const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\([^)]*\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) runs.push({ text: s.slice(last, m.index) });
      if (m[2]) runs.push({ text: m[2], bold: true });
      else if (m[4]) runs.push({ text: m[4], italic: true });
      else runs.push({ text: m[5] ?? m[6] });
      last = m.index + m[0].length;
    }
    if (last < s.length) runs.push({ text: s.slice(last) });
    return runs;
  };
  const flushPara = (lines: string[]) => {
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const runs = inline(text);
      blocks.push({ kind: "p", text: runs.map((r) => r.text).join(""), runs });
    }
  };
  let para: string[] = [];
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(para); para = []; continue; }
    if (h) { flushPara(para); para = []; const runs = inline(h[2]); blocks.push({ kind: h[1].length === 1 ? "h1" : "h2", text: runs.map((r) => r.text).join(""), runs }); continue; }
    if (li) {
      flushPara(para); para = [];
      const runs = inline(li[2]);
      const numbered = /^\d/.test(li[1]);
      // Numbered items keep their number and read as plain paragraphs.
      if (numbered) blocks.push({ kind: "p", text: `${li[1]} ${runs.map((r) => r.text).join("")}`, runs: [{ text: `${li[1]} ` }, ...runs] });
      else blocks.push({ kind: "li", text: runs.map((r) => r.text).join(""), runs });
      continue;
    }
    para.push(line.trim());
  }
  flushPara(para);
  return blocks;
}

async function fileToBlocks(file: File): Promise<{ blocks: TextBlock[]; html: string }> {
  const ext = extOf(file.name);
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser.js" as string);
    const result = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { blocks: htmlToBlocks(result.value), html: result.value };
  }
  if (ext === "html" || ext === "htm") {
    const html = await file.text();
    return { blocks: htmlToBlocks(html), html };
  }
  const text = await file.text();
  const blocks = ext === "md" || ext === "markdown" ? markdownToBlocks(text) : txtToBlocks(text);
  return { blocks, html: blocksToHtml(blocks) };
}

export function blocksToHtml(blocks: TextBlock[]): string {
  const runsHtml = (b: TextBlock) =>
    (b.runs?.length ? b.runs : [{ text: b.text }])
      .map((r) => {
        let t = escapeHtml(r.text);
        if (r.bold) t = `<strong>${t}</strong>`;
        if (r.italic) t = `<em>${t}</em>`;
        return t;
      })
      .join("");
  const out: string[] = [];
  let inList = false;
  for (const b of blocks) {
    if (b.kind === "li" && !inList) { out.push("<ul>"); inList = true; }
    if (b.kind !== "li" && inList) { out.push("</ul>"); inList = false; }
    if (b.kind === "image") continue;
    const tag = b.kind === "li" ? "li" : b.kind;
    out.push(`<${tag}>${runsHtml(b)}</${tag}>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

/* ── public engines ── */

export async function convertDocument(
  file: File,
  target: "pdf" | "txt" | "html",
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  onProgress(0.15);
  const { blocks, html } = await fileToBlocks(file);
  if (!blocks.some((b) => b.kind !== "image")) throw new Error("No readable text found in this document");
  onProgress(0.55);
  const base = baseName(file.name);

  if (target === "pdf") {
    const out = await blocksToPdf(blocks, `${base}.pdf`);
    onProgress(1);
    return [out];
  }
  if (target === "txt") {
    const txt = blocks
      .filter((b) => b.kind !== "image")
      .map((b) => (b.kind === "li" ? `• ${b.text}` : b.kind === "h1" || b.kind === "h2" ? `${b.text.toUpperCase()}` : b.text))
      .join("\n\n");
    onProgress(1);
    return [{ name: `${base}.txt`, blob: new Blob([txt], { type: "text/plain;charset=utf-8" }) }];
  }
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(base)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:40px auto;line-height:1.6;padding:0 20px;color:#1a1a1e}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style></head><body>${html}</body></html>`;
  onProgress(1);
  return [{ name: `${base}.html`, blob: new Blob([doc], { type: "text/html;charset=utf-8" }) }];
}

/** PDF → editable DOCX with real headings, bullets and paragraph flow. */
export async function pdfToWord(file: File, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const { extractPdfBlocks } = await import("./pdfText");
  const pages = await extractPdfBlocks(file, (p) => onProgress(p * 0.7));
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];
  pages.forEach((blocks: PdfBlock[]) => {
    for (const b of blocks) {
      if (b.kind === "h1" || b.kind === "h2") {
        children.push(new Paragraph({
          heading: b.kind === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          children: [new TextRun({ text: b.text })],
          spacing: { before: b.kind === "h1" ? 360 : 240, after: 120 },
        }));
      } else if (b.kind === "li") {
        children.push(new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: b.text, bold: b.bold })],
          spacing: { after: 80 },
        }));
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: b.text, bold: b.bold })],
          spacing: { after: 160, line: 276 },
        }));
      }
    }
  });
  if (!children.length) throw new Error("No selectable text in this PDF (it may be scanned)");

  const doc = new Document({
    creator: "CrownzConverter",
    title: baseName(file.name),
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, color: "1F1F23" }, paragraph: { spacing: { before: 360, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, color: "1F1F23" }, paragraph: { spacing: { before: 240, after: 100 } } },
      ],
    },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  const blob = await Packer.toBlob(doc);
  onProgress(1);
  return [{
    name: `${baseName(file.name)}.docx`,
    blob: new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
  }];
}
