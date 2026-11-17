import { unzipSync, zipSync, strToU8 } from "fflate";
import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";
import { blocksToPdf, txtToBlocks, htmlToBlocks, markdownToBlocks, escapeHtml, type TextBlock } from "./docs";
import type { PdfBlock } from "./pdfText";

interface Chapter {
  title: string;
  blocks: TextBlock[];
}

/** Parse XHTML strictly, falling back to the lenient HTML parser on errors. */
function parseMarkup(src: string): Document {
  const strict = new DOMParser().parseFromString(src, "application/xhtml+xml");
  if (!strict.querySelector("parsererror") && strict.querySelector("body")) return strict;
  return new DOMParser().parseFromString(src, "text/html");
}

/** Group flat blocks into chapters at h1 (or h2 when there are no h1s). */
function chaptersFromBlocks(blocks: TextBlock[], fallbackTitle: string): Chapter[] {
  const splitAt: TextBlock["kind"] = blocks.some((b) => b.kind === "h1") ? "h1" : "h2";
  const headings = blocks.filter((b) => b.kind === splitAt).length;
  if (headings < 2 || headings > blocks.length / 2) {
    // Single chapter: a leading heading becomes the title rather than repeating.
    const lead = blocks[0]?.kind === "h1" || blocks[0]?.kind === "h2" ? blocks[0] : null;
    return [{ title: lead?.text ?? fallbackTitle, blocks: lead ? blocks.slice(1) : blocks }];
  }
  const chapters: Chapter[] = [];
  let cur: Chapter | null = null;
  for (const b of blocks) {
    if (b.kind === splitAt || !cur) {
      cur = { title: b.kind === splitAt ? b.text : fallbackTitle, blocks: [] };
      chapters.push(cur);
      if (b.kind === splitAt) continue;
    }
    cur.blocks.push(b);
  }
  return chapters.filter((c) => c.blocks.length || chapters.length === 1);
}

/* ── EPUB reading ── */

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

async function parseEpub(file: File): Promise<{ title: string; chapters: Chapter[] }> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const container = files["META-INF/container.xml"];
  if (!container) throw new Error("Not a valid EPUB (missing container.xml)");
  const containerDoc = new DOMParser().parseFromString(decode(container), "text/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath || !files[opfPath]) throw new Error("Not a valid EPUB (missing package file)");

  const opf = new DOMParser().parseFromString(decode(files[opfPath]), "text/xml");
  const title = opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() || baseName(file.name);
  const root = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, string>();
  for (const item of Array.from(opf.querySelectorAll("manifest > item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }

  const chapters: Chapter[] = [];
  for (const ref of Array.from(opf.querySelectorAll("spine > itemref"))) {
    const href = manifest.get(ref.getAttribute("idref") ?? "");
    if (!href) continue;
    const data = files[root + href] ?? files[href];
    if (!data) continue;
    const doc = parseMarkup(decode(data));
    const body = doc.querySelector("body");
    if (!body) continue;
    const blocks = htmlToBlocks(body.innerHTML).filter((b) => b.kind !== "image");
    if (!blocks.length) continue;
    // The first heading names the chapter; it is not repeated in the body.
    let title = `Chapter ${chapters.length + 1}`;
    if ((blocks[0].kind === "h1" || blocks[0].kind === "h2") && blocks[0].text.length < 120) {
      title = blocks.shift()!.text;
    }
    if (blocks.length) chapters.push({ title, blocks });
  }
  if (!chapters.length) throw new Error("No readable chapters found in this EPUB");
  return { title, chapters };
}

/* ── EPUB writing ── */

const xmlEscape = escapeHtml;

function chapterBody(c: Chapter): string {
  const out: string[] = [];
  let inList = false;
  for (const b of c.blocks) {
    if (b.kind === "li" && !inList) { out.push("<ul>"); inList = true; }
    if (b.kind !== "li" && inList) { out.push("</ul>"); inList = false; }
    if (b.kind === "image") continue;
    const runs = (b.runs?.length ? b.runs : [{ text: b.text }])
      .map((r) => {
        let t = xmlEscape(r.text);
        if (r.bold) t = `<strong>${t}</strong>`;
        if (r.italic) t = `<em>${t}</em>`;
        return t;
      })
      .join("");
    const tag = b.kind === "h1" ? "h2" : b.kind === "h2" ? "h3" : b.kind;
    out.push(`<${tag}>${runs}</${tag}>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function buildEpub(title: string, chapters: Chapter[]): Blob {
  const esc = xmlEscape;
  const css = "body{font-family:serif;line-height:1.5;margin:1em}h2{font-size:1.5em;margin:1.2em 0 .6em}h3{font-size:1.2em;margin:1em 0 .4em}p{margin:0 0 .8em;text-align:justify}ul{margin:0 0 .8em 1.2em}";
  const chapterFile = (c: Chapter, _i: number) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(c.title)}</title><style>${css}</style></head><body><h2>${esc(c.title)}</h2>\n${chapterBody(c)}</body></html>`;

  const manifest = chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join("\n");
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join("\n");
  const navList = chapters.map((c, i) => `<li><a href="c${i}.xhtml">${esc(c.title)}</a></li>`).join("\n");

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:crownz-${Date.now()}</dc:identifier>
<dc:title>${esc(title)}</dc:title><dc:language>en</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n${manifest}</manifest>
<spine>${spine}</spine></package>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navList}</ol></nav></body></html>`;

  const tree: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    // The mimetype entry must be first and uncompressed, per the EPUB spec.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(nav),
  };
  chapters.forEach((c, i) => {
    tree[`OEBPS/c${i}.xhtml`] = strToU8(chapterFile(c, i));
  });

  const zipped = zipSync(tree as Parameters<typeof zipSync>[0], { level: 6 });
  return new Blob([zipped as BlobPart], { type: "application/epub+zip" });
}

/* ── public engine ── */

export async function convertEbook(
  file: File,
  target: "epub" | "pdf" | "txt",
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const ext = extOf(file.name);
  const base = baseName(file.name);
  onProgress(0.1);

  // Load the source into chapters.
  let title = base;
  let chapters: Chapter[];
  if (ext === "epub") {
    const parsed = await parseEpub(file);
    title = parsed.title;
    chapters = parsed.chapters;
  } else if (ext === "pdf") {
    const { extractPdfBlocks } = await import("./pdfText");
    const pages = await extractPdfBlocks(file, (p) => onProgress(0.1 + p * 0.4));
    const blocks: TextBlock[] = pages.flat().map((b: PdfBlock) => ({
      kind: b.kind,
      text: b.text,
      // Headings are already styled; only body text needs an explicit bold run.
      runs: b.bold && b.kind !== "h1" && b.kind !== "h2" ? [{ text: b.text, bold: true }] : undefined,
    }));
    if (!blocks.length) throw new Error("No selectable text in this PDF (it may be scanned)");
    chapters = chaptersFromBlocks(blocks, base);
    if (chapters.length === 1 && chapters[0].title !== base) title = chapters[0].title;
  } else {
    const text = await file.text();
    const blocks = ext === "md" || ext === "markdown" ? markdownToBlocks(text) : txtToBlocks(text);
    if (!blocks.length) throw new Error("This file has no text");
    chapters = chaptersFromBlocks(blocks, base);
  }
  onProgress(0.6);

  if (target === "epub") {
    const blob = buildEpub(title, chapters);
    onProgress(1);
    return [{ name: `${base}.epub`, blob }];
  }
  if (target === "txt") {
    const txt = chapters
      .map((c) => `${c.title.toUpperCase()}\n\n${c.blocks.filter((b) => b.kind !== "image").map((b) => (b.kind === "li" ? `• ${b.text}` : b.text)).join("\n\n")}`)
      .join("\n\n\n");
    onProgress(1);
    return [{ name: `${base}.txt`, blob: new Blob([txt], { type: "text/plain;charset=utf-8" }) }];
  }
  const blocks: TextBlock[] = chapters.flatMap((c) => [
    { kind: "h1" as const, text: c.title },
    ...c.blocks.map((b) => (b.kind === "h1" ? { ...b, kind: "h2" as const } : b)),
  ]);
  const out = await blocksToPdf(blocks, `${base}.pdf`);
  onProgress(1);
  return [out];
}

// Re-exported so the doc engine's helpers stay tree-shaken together.
export { txtToBlocks, htmlToBlocks };
