import type { JobStatus, OutputFile } from "./types";

/**
 * Per-tool session persistence in IndexedDB so a refresh doesn't wipe the file
 * stack. Input files are written once when added, outputs when a job finishes,
 * and the lightweight ordering/options record on every change.
 */

const DB = "crownz-session";
const VERSION = 1;

interface MetaRecord {
  slug: string;
  ids: string[];
  status: Record<string, JobStatus>;
  selectedId: string | null;
  opts: unknown;
  savedAt: number;
}
interface FileRecord { id: string; slug: string; file: File }
interface OutputRecord { id: string; slug: string; outputs: OutputFile[] }

export interface RestoredFile {
  id: string;
  file: File;
  status: JobStatus;
  outputs: OutputFile[];
}
export interface RestoredSession {
  files: RestoredFile[];
  selectedId: string | null;
  opts: unknown;
}

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no indexedDB"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("meta", { keyPath: "slug" });
      db.createObjectStore("files", { keyPath: "id" }).createIndex("slug", "slug");
      db.createObjectStore("outputs", { keyPath: "id" }).createIndex("slug", "slug");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((res, rej) => {
        const t = db.transaction(stores, mode);
        let out: IDBRequest<T> | void;
        try { out = fn(t); } catch (e) { rej(e); return; }
        t.oncomplete = () => res(out ? out.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

const swallow = (p: Promise<unknown>) => p.catch((e) => console.warn("[session]", (e as Error).message));

export function saveFile(slug: string, id: string, file: File): void {
  swallow(tx(["files"], "readwrite", (t) => { t.objectStore("files").put({ id, slug, file } satisfies FileRecord); }));
}

export function saveOutputs(slug: string, id: string, outputs: OutputFile[]): void {
  swallow(tx(["outputs"], "readwrite", (t) => {
    const s = t.objectStore("outputs");
    if (outputs.length) s.put({ id, slug, outputs } satisfies OutputRecord);
    else s.delete(id);
  }));
}

export function saveMeta(slug: string, meta: Omit<MetaRecord, "slug" | "savedAt">): void {
  swallow(tx(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ slug, savedAt: Date.now(), ...meta } satisfies MetaRecord); }));
}

export function removeEntry(id: string): void {
  swallow(tx(["files", "outputs"], "readwrite", (t) => {
    t.objectStore("files").delete(id);
    t.objectStore("outputs").delete(id);
  }));
}

export function clearSession(slug: string): void {
  swallow(tx(["meta", "files", "outputs"], "readwrite", (t) => {
    t.objectStore("meta").delete(slug);
    for (const name of ["files", "outputs"] as const) {
      const idx = t.objectStore(name).index("slug");
      idx.openKeyCursor(IDBKeyRange.only(slug)).onsuccess = (ev) => {
        const c = (ev.target as IDBRequest<IDBCursor | null>).result;
        if (c) { t.objectStore(name).delete(c.primaryKey); c.continue(); }
      };
    }
  }));
}

export async function loadSession(slug: string): Promise<RestoredSession | null> {
  try {
    const meta = await tx<MetaRecord | undefined>(["meta"], "readonly", (t) => t.objectStore("meta").get(slug) as IDBRequest<MetaRecord | undefined>);
    if (!meta?.ids.length) return null;
    const files = await tx<FileRecord[]>(["files"], "readonly", (t) => t.objectStore("files").index("slug").getAll(slug) as IDBRequest<FileRecord[]>);
    const outputs = await tx<OutputRecord[]>(["outputs"], "readonly", (t) => t.objectStore("outputs").index("slug").getAll(slug) as IDBRequest<OutputRecord[]>);
    const byId = new Map((files ?? []).map((f) => [f.id, f.file]));
    const outById = new Map((outputs ?? []).map((o) => [o.id, o.outputs]));
    const restored: RestoredFile[] = [];
    for (const id of meta.ids) {
      const file = byId.get(id);
      if (!file) continue;
      const outs = outById.get(id) ?? [];
      // A job that was mid-flight when the page went away has to be re-run.
      const status: JobStatus = meta.status[id] === "done" && outs.length ? "done" : "idle";
      restored.push({ id, file, status, outputs: status === "done" ? outs : [] });
    }
    if (!restored.length) return null;
    return { files: restored, selectedId: meta.selectedId, opts: meta.opts };
  } catch (e) {
    console.warn("[session] restore failed:", (e as Error).message);
    return null;
  }
}
