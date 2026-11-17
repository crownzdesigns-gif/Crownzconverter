import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import type { DragControls } from "motion/react";
import type { OutputFile, StackFile, ToolDef } from "../lib/types";
import { Icon, type IconName } from "./Icon";
import { cx, extOf, formatBytes, middleTruncate } from "../lib/util";

const KIND_ICON: Record<string, IconName> = {
  pdf: "fileText",
  svg: "image",
  gif: "gif",
  zip: "archive",
  mp3: "audio",
  wav: "audio",
  mp4: "video",
  mov: "video",
  webm: "video",
};

function fileIcon(name: string): IconName {
  return KIND_ICON[extOf(name)] ?? "image";
}

function StatusLine({ sf, note }: { sf: StackFile; note?: string }) {
  if (sf.status === "error") {
    return <span className="truncate text-[11px] text-err">{sf.error ?? "Something went wrong"}</span>;
  }
  if (sf.status === "done" && sf.outputs.length) {
    const outBytes = sf.outputs.reduce((a, o) => a + o.blob.size, 0);
    const delta = Math.round((1 - outBytes / sf.file.size) * 100);
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-3 tabular-nums">
        {formatBytes(sf.file.size)}
        <Icon name="arrowRight" size={9} className="text-ink-3/60" />
        <span className="text-ink-2">{formatBytes(outBytes)}</span>
        {delta > 0 && <span className="text-ok">−{delta}%</span>}
        {sf.outputs.length > 1 && <span>· {sf.outputs.length} files</span>}
      </span>
    );
  }
  return (
    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
      {formatBytes(sf.file.size)}
      {note ? ` · ${note}` : ""}
    </span>
  );
}

function RowBody({
  sf,
  selected,
  note,
  reorderable,
  controls,
  onSelect,
  onRemove,
  onDownload,
  onRetry,
}: {
  sf: StackFile;
  selected: boolean;
  note?: string;
  reorderable: boolean;
  controls?: DragControls;
  onSelect: () => void;
  onRemove: () => void;
  onDownload: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cx(
        "group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl border bg-panel-2/70 py-2.5 pr-2.5 pl-2 transition-colors duration-150",
        selected
          ? "border-accent/60 shadow-[0_0_0_1px_var(--color-accent)]"
          : "border-line hover:border-line-2",
      )}
    >
      {reorderable && (
        <button
          aria-label="Drag to reorder"
          className="shrink-0 cursor-grab touch-none px-0.5 text-ink-3/60 transition-colors hover:text-ink-2 active:cursor-grabbing"
          onPointerDown={(e) => controls?.start(e)}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="drag" size={14} />
        </button>
      )}

      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-panel-3 text-ink-3">
        {sf.previewUrl ? (
          <img src={sf.previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Icon name={fileIcon(sf.file.name)} size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">
          {middleTruncate(sf.file.name, 30)}
        </span>
        <StatusLine sf={sf} note={note} />
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {sf.status === "processing" && (
          <span className="font-mono text-[10.5px] text-accent tabular-nums">
            {sf.progress >= 0 ? `${Math.round(sf.progress * 100)}%` : ""}
          </span>
        )}
        {sf.status === "done" && sf.outputs.length > 0 && (
          <>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-ok">
              <path d="m3 8.5 3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
            </svg>
            <button
              aria-label={`Download ${sf.file.name}`}
              className="icon-btn !h-7 !w-7 !rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <Icon name="download" size={13} />
            </button>
          </>
        )}
        {sf.status === "error" && (
          <button
            aria-label="Retry"
            className="icon-btn !h-7 !w-7 !rounded-lg !text-err"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            <Icon name="retry" size={13} />
          </button>
        )}
        {(sf.status === "idle" || sf.status === "done" || sf.status === "error") && (
          <button
            aria-label={`Remove ${sf.file.name}`}
            className="icon-btn !h-7 !w-7 !rounded-lg !border-transparent !bg-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </span>

      {/* progress rail */}
      <span
        className={cx(
          "absolute inset-x-2 bottom-0 h-[2px] overflow-hidden rounded-full transition-opacity duration-300",
          sf.status === "processing" ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="absolute inset-0 rounded-full bg-track" />
        {sf.progress >= 0 ? (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(4, sf.progress * 100)}%` }}
          />
        ) : (
          <span className="shimmer absolute inset-0 overflow-hidden rounded-full" />
        )}
      </span>
    </div>
  );
}

function ReorderableRow(props: Parameters<typeof RowBody>[0] & { sf: StackFile }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={props.sf}
      dragListener={false}
      dragControls={controls}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 500, damping: 36 }}
      whileDrag={{ scale: 1.02, zIndex: 10, boxShadow: "0 14px 34px rgb(0 0 0 / 0.5)" }}
      className="relative rounded-xl"
    >
      <RowBody {...props} controls={controls} />
    </Reorder.Item>
  );
}

export interface FileStackProps {
  tool: ToolDef;
  stack: StackFile[];
  onReorder: (next: StackFile[]) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onDownloadFile: (sf: StackFile) => void;
  notes: Record<string, string>;
  reorderable: boolean;
  running: boolean;
  allDone: boolean;
  ctaLabel: string;
  onRun: () => void;
  onDownloadAll: () => void;
  onClear: () => void;
  combined: OutputFile[] | null;
  onDownloadCombined: () => void;
  children?: React.ReactNode; // compact drop zone
}

export function FileStack(p: FileStackProps) {
  const rowProps = (sf: StackFile) => ({
    sf,
    selected: p.selectedId === sf.id,
    note: p.notes[sf.id],
    reorderable: p.reorderable,
    onSelect: () => p.onSelect(sf.id),
    onRemove: () => p.onRemove(sf.id),
    onDownload: () => p.onDownloadFile(sf),
    onRetry: () => p.onRetry(sf.id),
  });

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="File stack">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="layers" size={13} className="text-ink-3" />
          <span className="microlabel">File Stack</span>
          <span className="microlabel rounded-full border border-line-2 bg-panel-2 px-1.5 py-px !text-[9px]">
            {p.stack.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {p.stack.length > 0 && !p.running && (
            <button className="icon-btn !h-8 !w-8" aria-label="Clear all" onClick={p.onClear}>
              <Icon name="trash" size={13} />
            </button>
          )}
          {p.allDone && !p.running ? (
            <button className="pill !py-1.5 !text-[12.5px]" onClick={p.onDownloadAll}>
              <Icon name="download" size={13} strokeWidth={2} />
              Download all
            </button>
          ) : (
            <button
              className="pill !py-1.5 !text-[12.5px]"
              disabled={p.stack.length === 0 || p.running}
              onClick={p.onRun}
            >
              {p.running ? (
                <>
                  <span className="spin inline-block">
                    <Icon name="sparkle" size={12} />
                  </span>
                  Processing…
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={12} />
                  {p.ctaLabel}
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {p.reorderable ? (
          <Reorder.Group axis="y" values={p.stack} onReorder={p.onReorder} className="space-y-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {p.stack.map((sf) => (
                <ReorderableRow key={sf.id} {...rowProps(sf)} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {p.stack.map((sf) => (
              <motion.div
                key={sf.id}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              >
                <RowBody {...rowProps(sf)} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {p.combined && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            >
              <div className="microlabel mt-4 mb-2 px-1">Output</div>
              {p.combined.map((o) => (
                <div
                  key={o.name}
                  className="flex items-center gap-2.5 rounded-xl border border-ok/30 bg-ok/[0.06] py-2.5 pr-2.5 pl-3"
                >
                  <Icon name="fileText" size={16} className="text-ok" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{o.name}</span>
                    <span className="font-mono text-[11px] text-ink-3">{formatBytes(o.blob.size)}</span>
                  </span>
                  <button className="pill !py-1.5 !text-[12px]" onClick={p.onDownloadCombined}>
                    <Icon name="download" size={12} strokeWidth={2} />
                    Save
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-1">{p.children}</div>
      </div>
    </section>
  );
}
