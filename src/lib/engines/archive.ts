import { unzipSync, zipSync, gzipSync, gunzipSync } from "fflate";
import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";

interface Entry {
  name: string;
  data: Uint8Array;
}

/* ── minimal POSIX ustar reader/writer ── */

function readTar(data: Uint8Array): Entry[] {
  const entries: Entry[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 512 <= data.length) {
    const block = data.subarray(offset, offset + 512);
    if (block.every((b) => b === 0)) break;
    const name = decoder.decode(block.subarray(0, 100)).replace(/\0.*$/, "");
    const prefix = decoder.decode(block.subarray(345, 500)).replace(/\0.*$/, "");
    const size = parseInt(decoder.decode(block.subarray(124, 136)).replace(/\0.*$/, "").trim() || "0", 8);
    const type = block[156];
    offset += 512;
    if ((type === 48 || type === 0) && name) {
      entries.push({
        name: prefix ? `${prefix}/${name}` : name,
        data: data.slice(offset, offset + size),
      });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

function writeTar(entries: Entry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const e of entries) {
    const header = new Uint8Array(512);
    const name = e.name.slice(-100);
    header.set(encoder.encode(name), 0);
    header.set(encoder.encode("0000644\0"), 100); // mode
    header.set(encoder.encode("0000000\0"), 108); // uid
    header.set(encoder.encode("0000000\0"), 116); // gid
    header.set(encoder.encode(e.data.length.toString(8).padStart(11, "0") + "\0"), 124);
    header.set(encoder.encode("00000000000\0"), 136); // mtime
    header.set(encoder.encode("        "), 148); // checksum placeholder
    header[156] = 48; // '0' regular file
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);
    let sum = 0;
    for (const b of header) sum += b;
    header.set(encoder.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
    chunks.push(header, e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad) chunks.push(new Uint8Array(pad));
  }
  chunks.push(new Uint8Array(1024));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/* ── engine ── */

function looksLikeTar(data: Uint8Array): boolean {
  return data.length > 262 && data[257] === 0x75 && data[258] === 0x73 && data[259] === 0x74;
}

async function readArchive(file: File): Promise<Entry[] | null> {
  const ext = extOf(file.name);
  const data = new Uint8Array(await file.arrayBuffer());
  if (ext === "zip") {
    const tree = unzipSync(data);
    return Object.entries(tree)
      .filter(([name, d]) => !name.endsWith("/") && d.length >= 0)
      .map(([name, d]) => ({ name, data: d }));
  }
  if (ext === "tar") return readTar(data);
  if (ext === "gz" || ext === "tgz") {
    const inner = gunzipSync(data);
    if (ext === "tgz" || file.name.endsWith(".tar.gz") || looksLikeTar(inner)) return readTar(inner);
    return [{ name: baseName(file.name), data: inner }];
  }
  return null; // not an archive — caller wraps the raw file instead
}

export async function convertArchive(
  file: File,
  target: "zip" | "tar" | "tgz",
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  onProgress(0.15);
  const entries =
    (await readArchive(file)) ??
    [{ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }];
  if (!entries.length) throw new Error("This archive is empty");
  onProgress(0.55);

  const base = baseName(file.name).replace(/\.tar$/, "");
  let blob: Blob;
  let name: string;
  if (target === "zip") {
    const tree: Record<string, Uint8Array> = {};
    for (const e of entries) tree[e.name] = e.data;
    blob = new Blob([zipSync(tree, { level: 6 }) as BlobPart], { type: "application/zip" });
    name = `${base}.zip`;
  } else {
    const tar = writeTar(entries);
    if (target === "tgz") {
      blob = new Blob([gzipSync(tar, { level: 6 }) as BlobPart], { type: "application/gzip" });
      name = `${base}.tar.gz`;
    } else {
      blob = new Blob([tar as BlobPart], { type: "application/x-tar" });
      name = `${base}.tar`;
    }
  }
  onProgress(1);
  return [{ name, blob }];
}
