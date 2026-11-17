import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolDef } from "../lib/types";
import { CATEGORY_META } from "../lib/registry";
import { reorderPdf } from "../lib/engines/pdf";
import { pdfThumbnails } from "../lib/engines/pdfRender";
import { cx, downloadBlob, formatBytes } from "../lib/util";
import { DropZone } from "../components/DropZone";
import { Icon } from "../components/Icon";
import { toast } from "../components/toast";

interface PageCard {
  original: number; // zero-based index in the source PDF
  thumb: string;
  removed: boolean;
}

export function OrganizePdfPage({ tool, initialFiles }: { tool: ToolDef; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const cat = CATEGORY_META[tool.category];

  useEffect(() => {
    document.title = `${tool.name} — CrownzConverter`;
  }, []);

  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setPages(null);
    setBusy(true);
    try {
      const thumbs = await pdfThumbnails(f, 220);
      setPages(thumbs.map((thumb, i) => ({ original: i, thumb, removed: false })));
    } catch {
      toast("Couldn't read that PDF", "err");
      setFile(null);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (initialFiles?.length) void load(initialFiles);
  }, []);

  const move = (from: number, to: number) => {
    setPages((prev) => {
      if (!prev || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const save = async () => {
    if (!file || !pages) return;
    const order = pages.filter((p) => !p.removed).map((p) => p.original);
    if (!order.length) return toast("Every page is marked for removal", "err");
    setSaving(true);
    try {
      const [out] = await reorderPdf(file, order, () => {});
      downloadBlob(out.blob, out.name);
      toast(`Saved ${order.length} page${order.length > 1 ? "s" : ""}`, "ok");
    } catch (err) {
      toast((err as Error).message || "Couldn't save the PDF", "err");
    }
    setSaving(false);
  };

  if (!file) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-20">
        <div className="rise mb-3 flex items-center gap-2">
          <span className="glass-chip px-3 py-1">
            <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: cat.color }} />
            <span className="microlabel !text-[9.5px]">{cat.label}</span>
          </span>
        </div>
        <h1 className="rise text-[34px] font-semibold tracking-tight" style={{ animationDelay: "40ms" }}>{tool.name}</h1>
        <p className="rise mt-2 mb-8 max-w-xl text-[15px] text-ink-2" style={{ animationDelay: "80ms" }}>
          {tool.description} Drag pages into a new order, click to mark pages for removal, then save.
        </p>
        <div className="rise" style={{ animationDelay: "130ms" }}>
          <DropZone onFiles={load} accept={["pdf"]} multiple={false} />
        </div>
      </div>
    );
  }

  const kept = pages?.filter((p) => !p.removed).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-[7px] w-[7px] shrink-0 rounded-[2.5px]" style={{ background: cat.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight">{tool.name}</h1>
          <span className="microlabel ml-1 hidden truncate sm:block">
            {file.name} · {formatBytes(file.size)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="pill-dark" onClick={() => { setFile(null); setPages(null); }}>
            <Icon name="retry" size={13} />
            New PDF
          </button>
          <button className="pill" disabled={saving || busy || !pages} onClick={save}>
            {saving ? (
              <span className="spin inline-block"><Icon name="sparkle" size={12} /></span>
            ) : (
              <Icon name="check" size={13} strokeWidth={2} />
            )}
            {saving ? "Saving…" : `Save ${kept} page${kept === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      <section className="dotgrid panel min-h-[440px] !bg-canvas/60 p-5">
        {busy && (
          <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-ink-3">
            <span className="spin inline-block text-accent"><Icon name="sparkle" size={18} /></span>
            <span className="text-[13px]">Rendering pages…</span>
          </div>
        )}
        {pages && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            <AnimatePresence initial={false}>
              {pages.map((p, i) => (
                <motion.div
                  key={p.original}
                  layout
                  transition={{ type: "spring", stiffness: 480, damping: 34 }}
                  draggable
                  onDragStart={(e) => {
                    dragFrom.current = i;
                    (e as unknown as React.DragEvent).dataTransfer?.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    (e as unknown as React.DragEvent).preventDefault();
                    if (dragFrom.current !== null && dragFrom.current !== i) {
                      move(dragFrom.current, i);
                      dragFrom.current = i;
                    }
                  }}
                  onDragEnd={() => (dragFrom.current = null)}
                  className={cx(
                    "group relative cursor-grab rounded-xl border bg-panel-2 p-2 transition-colors duration-150 active:cursor-grabbing",
                    p.removed ? "border-err/40 opacity-45" : "border-line hover:border-line-2",
                  )}
                >
                  <div className="relative overflow-hidden rounded-lg border border-line bg-white">
                    <img src={p.thumb} alt={`Page ${p.original + 1}`} className="w-full" draggable={false} />
                    {p.removed && (
                      <div className="absolute inset-0 grid place-items-center bg-canvas/55">
                        <span className="microlabel rounded-md bg-err/85 px-2 py-1 !text-[9px] !text-white">removed</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between px-0.5">
                    <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
                      {i + 1}
                      <span className="text-ink-3/50"> · was {p.original + 1}</span>
                    </span>
                    <button
                      aria-label={p.removed ? "Restore page" : "Remove page"}
                      className={cx(
                        "grid h-6 w-6 place-items-center rounded-md border transition-all duration-150",
                        p.removed
                          ? "border-ok/40 text-ok hover:bg-ok/10"
                          : "border-transparent text-ink-3 opacity-0 group-hover:opacity-100 hover:border-err/40 hover:text-err",
                      )}
                      onClick={() =>
                        setPages((prev) =>
                          prev ? prev.map((q) => (q.original === p.original ? { ...q, removed: !q.removed } : q)) : prev,
                        )
                      }
                    >
                      <Icon name={p.removed ? "retry" : "trash"} size={12} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}
