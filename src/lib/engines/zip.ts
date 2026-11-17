import { zip } from "fflate";
import type { OutputFile } from "../types";

/** Bundle outputs into a ZIP for batch download, deduping name collisions. */
export async function zipOutputs(entries: OutputFile[]): Promise<Blob> {
  const tree: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const e of entries) {
    let name = e.name;
    let i = 2;
    while (used.has(name)) {
      const dot = e.name.lastIndexOf(".");
      name = dot === -1 ? `${e.name}-${i}` : `${e.name.slice(0, dot)}-${i}${e.name.slice(dot)}`;
      i++;
    }
    used.add(name);
    tree[name] = new Uint8Array(await e.blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    zip(tree, { level: 6 }, (err, data) =>
      err ? reject(err) : resolve(new Blob([data as BlobPart], { type: "application/zip" })),
    );
  });
}
