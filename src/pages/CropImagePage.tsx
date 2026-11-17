import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { ToolDef } from "../lib/types";
import { decodeImage, processImage } from "../lib/engines/image";
import { downloadBlob, extOf, formatBytes } from "../lib/util";
import { DropZone } from "../components/DropZone";
import { Icon } from "../components/Icon";
import { Segment } from "../components/controls";
import { toast } from "../components/toast";
import { CATEGORY_META } from "../lib/registry";

type Crop = { x: number; y: number; w: number; h: number };
type Mode = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const ASPECTS: Array<{ key: string; label: string; ratio: number | null }> = [
  { key: "free", label: "Free", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "3:2", label: "3:2", ratio: 3 / 2 },
];

const HANDLES: Array<{ mode: Mode; x: number; y: number; cursor: string }> = [
  { mode: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { mode: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { mode: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { mode: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { mode: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { mode: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { mode: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { mode: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

export function CropImagePage({ tool, initialFiles }: { tool: ToolDef; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [aspect, setAspect] = useState<string>("free");
  const [busy, setBusy] = useState(false);
  const [display, setDisplay] = useState<{ left: number; top: number; scale: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const gesture = useRef<{ mode: Mode; startX: number; startY: number; start: Crop } | null>(null);

  useEffect(() => {
    document.title = `${tool.name} — CrownzConverter`;
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, []);

  const load = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    try {
      const ext = extOf(f.name);
      let url: string;
      if (["heic", "heif"].includes(ext)) {
        // HEIC can't render in <img>; decode to a canvas-backed URL first.
        const { source, width, height } = await decodeImage(f);
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d")!.drawImage(source as CanvasImageSource, 0, 0);
        url = c.toDataURL("image/png");
      } else {
        url = URL.createObjectURL(f);
      }
      setFile(f);
      setImgUrl(url);
      setNatural(null);
      setCrop(null);
    } catch {
      toast("Couldn't read that image", "err");
    }
  }, [imgUrl]);

  useEffect(() => {
    if (initialFiles?.length) void load(initialFiles);
  }, []);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || !img.naturalWidth) return;
    const s = stage.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    setDisplay({ left: r.left - s.left, top: r.top - s.top, scale: r.width / img.naturalWidth });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const onImgLoad = () => {
    const img = imgRef.current!;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    setCrop({ x: Math.round(w * 0.1), y: Math.round(h * 0.1), w: Math.round(w * 0.8), h: Math.round(h * 0.8) });
    requestAnimationFrame(measure);
  };

  const applyAspect = (key: string) => {
    setAspect(key);
    const ratio = ASPECTS.find((a) => a.key === key)?.ratio;
    if (!ratio || !natural) return;
    let w = natural.w * 0.8;
    let h = w / ratio;
    if (h > natural.h * 0.9) {
      h = natural.h * 0.8;
      w = h * ratio;
    }
    setCrop({
      x: Math.round((natural.w - w) / 2),
      y: Math.round((natural.h - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
    });
  };

  const startGesture = (mode: Mode) => (e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { mode, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !natural || !display) return;
    const dx = (e.clientX - g.startX) / display.scale;
    const dy = (e.clientY - g.startY) / display.scale;
    const ratio = ASPECTS.find((a) => a.key === aspect)?.ratio ?? null;
    const min = 24;
    let { x, y, w, h } = g.start;

    if (g.mode === "move") {
      x = Math.min(Math.max(0, g.start.x + dx), natural.w - w);
      y = Math.min(Math.max(0, g.start.y + dy), natural.h - h);
    } else {
      let x2 = g.start.x + g.start.w;
      let y2 = g.start.y + g.start.h;
      if (g.mode.includes("w")) x = Math.min(Math.max(0, g.start.x + dx), x2 - min);
      if (g.mode.includes("e")) x2 = Math.max(Math.min(natural.w, x2 + dx), x + min);
      if (g.mode.includes("n")) y = Math.min(Math.max(0, g.start.y + dy), y2 - min);
      if (g.mode.includes("s")) y2 = Math.max(Math.min(natural.h, y2 + dy), y + min);
      w = x2 - x;
      h = y2 - y;
      if (ratio) {
        // Constrain to the aspect, anchored to the opposite corner/edge.
        if (g.mode === "n" || g.mode === "s") w = h * ratio;
        else h = w / ratio;
        if (g.mode.includes("n")) y = y2 - h;
        if (g.mode.includes("w")) x = x2 - w;
        // Clamp overflow while preserving ratio.
        if (x < 0) { w += x; h = w / ratio; if (g.mode.includes("n")) y = y2 - h; x = 0; }
        if (y < 0) { h += y; w = h * ratio; if (g.mode.includes("w")) x = x2 - w; y = 0; }
        if (x + w > natural.w) { w = natural.w - x; h = w / ratio; if (g.mode.includes("n")) y = y2 - h; }
        if (y + h > natural.h) { h = natural.h - y; w = h * ratio; if (g.mode.includes("w")) x = x2 - w; }
      }
    }
    setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  };

  const endGesture = () => {
    gesture.current = null;
  };

  const apply = async () => {
    if (!file || !crop) return;
    setBusy(true);
    try {
      const ext = extOf(file.name);
      const format = ["jpg", "jpeg", "jfif"].includes(ext) ? "jpg" : ext === "webp" ? "webp" : "png";
      const [out] = await processImage(file, { crop, format, quality: 92 }, () => {});
      downloadBlob(out.blob, out.name.replace(/(\.[^.]+)$/, "-cropped$1"));
      toast(`Cropped to ${crop.w}×${crop.h}`, "ok");
    } catch (err) {
      toast((err as Error).message || "Crop failed", "err");
    }
    setBusy(false);
  };

  const cat = CATEGORY_META[tool.category];

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
          {tool.description} Drag the selection exactly where you want it — nothing is uploaded.
        </p>
        <div className="rise" style={{ animationDelay: "130ms" }}>
          <DropZone onFiles={load} accept={tool.accept} multiple={false} />
        </div>
      </div>
    );
  }

  const view = crop && display
    ? { left: display.left + crop.x * display.scale, top: display.top + crop.y * display.scale, w: crop.w * display.scale, h: crop.h * display.scale }
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-[7px] w-[7px] shrink-0 rounded-[2.5px]" style={{ background: cat.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight">{tool.name}</h1>
          <span className="microlabel ml-1 hidden truncate sm:block">{file.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="pill-dark" onClick={() => { setFile(null); setImgUrl(null); setCrop(null); }}>
            <Icon name="retry" size={13} />
            New image
          </button>
          <button className="pill" disabled={busy || !crop} onClick={apply}>
            {busy ? <span className="spin inline-block"><Icon name="sparkle" size={12} /></span> : <Icon name="crop" size={13} />}
            {busy ? "Cropping…" : "Crop & download"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]">
        <section className="panel space-y-5 p-4">
          <div>
            <div className="microlabel mb-2.5">Aspect ratio</div>
            <Segment
              value={aspect}
              onChange={applyAspect}
              options={ASPECTS.map((a) => ({ value: a.key, label: a.label }))}
            />
          </div>
          {crop && natural && (
            <div>
              <div className="microlabel mb-2.5">Selection</div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11.5px] text-ink-2 tabular-nums">
                <div className="field !py-2">W <span className="float-right text-ink">{crop.w}px</span></div>
                <div className="field !py-2">H <span className="float-right text-ink">{crop.h}px</span></div>
                <div className="field !py-2">X <span className="float-right text-ink">{crop.x}</span></div>
                <div className="field !py-2">Y <span className="float-right text-ink">{crop.y}</span></div>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                Source is {natural.w}×{natural.h} · {formatBytes(file.size)}. Drag the marquee to move it,
                pull any handle to resize.
              </p>
            </div>
          )}
        </section>

        <section
          ref={stageRef}
          className="dotgrid panel relative flex min-h-[440px] items-center justify-center overflow-hidden !bg-canvas/60 p-8 select-none"
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <img
            ref={imgRef}
            src={imgUrl ?? undefined}
            alt={file.name}
            onLoad={onImgLoad}
            draggable={false}
            className="max-h-[520px] max-w-full rounded-md object-contain"
          />

          {view && (
            <>
              {/* Dim everything outside the selection */}
              <div
                className="pointer-events-none absolute rounded-[3px]"
                style={{
                  left: view.left,
                  top: view.top,
                  width: view.w,
                  height: view.h,
                  boxShadow: "0 0 0 9999px rgb(5 5 6 / 0.62)",
                }}
              />
              {/* Marquee */}
              <div
                className="absolute cursor-move touch-none"
                style={{ left: view.left, top: view.top, width: view.w, height: view.h }}
                onPointerDown={startGesture("move")}
              >
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                  <rect x="0.5" y="0.5" style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }} fill="none" stroke="rgb(0 0 0 / 0.55)" strokeWidth="1" />
                  <rect x="0.5" y="0.5" style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }} fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="6 6" className="ants" />
                </svg>
                {/* Rule of thirds */}
                <div className="pointer-events-none absolute inset-0">
                  {[1, 2].map((i) => (
                    <div key={`v${i}`} className="absolute inset-y-0 w-px bg-white/20" style={{ left: `${(i / 3) * 100}%` }} />
                  ))}
                  {[1, 2].map((i) => (
                    <div key={`h${i}`} className="absolute inset-x-0 h-px bg-white/20" style={{ top: `${(i / 3) * 100}%` }} />
                  ))}
                </div>
                {/* Handles */}
                {HANDLES.map((h) => (
                  <div
                    key={h.mode}
                    onPointerDown={startGesture(h.mode)}
                    className="absolute z-10 h-[11px] w-[11px] touch-none rounded-[3px] border border-black/40 bg-white shadow-[0_1px_4px_rgb(0_0_0/0.5)] transition-transform duration-100 hover:scale-125"
                    style={{
                      left: `${h.x * 100}%`,
                      top: `${h.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      cursor: h.cursor,
                    }}
                  />
                ))}
                {/* Size readout, like the sample's selection chip */}
                {crop && (
                  <motion.span
                    layout
                    className="microlabel absolute -bottom-7 right-0 rounded-md border border-line-2 bg-canvas/90 px-2 py-1 !text-[9.5px] !text-ink backdrop-blur"
                  >
                    {crop.w} × {crop.h}
                  </motion.span>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
