export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

let counter = 0;
export function uid() {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? name : name.slice(0, i);
}

/** Truncate the middle of long filenames: "very-long-file…name.png" */
export function middleTruncate(name: string, max = 34): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  return `${name.slice(0, head)}…${name.slice(name.length - (keep - head))}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Parse a page-range expression like "1, 3-5, 9" into zero-based indices.
 * Returns null when the expression is invalid. `total` clamps the range.
 */
export function parsePageRanges(expr: string, total: number): number[] | null {
  const out = new Set<number>();
  const trimmed = expr.trim();
  if (!trimmed) return null;
  for (const part of trimmed.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < a) return null;
    for (let i = a; i <= Math.min(b, total); i++) out.add(i - 1);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** Parse "mm:ss", "h:mm:ss" or plain seconds into seconds. Null when invalid. */
export function parseTimecode(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + parseFloat(p);
  return seconds;
}

const MAX_FREE_BYTES = 1024 ** 3; // 1 GB free-tier cap
export function overFreeLimit(file: File) {
  return file.size > MAX_FREE_BYTES;
}
