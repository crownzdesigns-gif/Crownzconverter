import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolDef } from "../lib/types";
import { CATEGORY_META } from "../lib/registry";
import { decodeImage } from "../lib/engines/image";
import { uid } from "../lib/util";
import { DropZone } from "../components/DropZone";
import { Icon } from "../components/Icon";
import { toast } from "../components/toast";

interface Swatch {
  id: string;
  hex: string;
  rgb: string;
  hsl: string;
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function toHsl(r: number, g: number, b: number) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

const LOUPE = 11; // sampled pixels per side
const ZOOM = 10;

export function ColorPickerPage({ tool, initialFiles }: { tool: ToolDef; initialFiles?: File[] }) {
  const [loaded, setLoaded] = useState(false);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; hex: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cat = CATEGORY_META[tool.category];

  useEffect(() => {
    document.title = `${tool.name} — CrownzConverter`;
  }, []);

  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const { source, width, height } = await decodeImage(f);
      const canvas = canvasRef.current!;
      const cap = 2048;
      const scale = Math.min(1, cap / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      ctxRef.current = ctx;
      setLoaded(true);
      setSwatches([]);
    } catch {
      toast("Couldn't read that image", "err");
    }
  };

  useEffect(() => {
    if (initialFiles?.length) void load(initialFiles);
  }, []);

  const sampleAt = (e: React.PointerEvent): { x: number; y: number; r: number; g: number; b: number } | null => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    return { x, y, r, g, b };
  };

  const onMove = (e: React.PointerEvent) => {
    const s = sampleAt(e);
    if (!s) return setHover(null);
    const stage = e.currentTarget.getBoundingClientRect();
    setHover({ x: e.clientX - stage.left, y: e.clientY - stage.top, hex: toHex(s.r, s.g, s.b) });

    // Paint the pixel loupe.
    const loupe = loupeRef.current;
    const ctx = ctxRef.current;
    const src = canvasRef.current;
    if (loupe && ctx && src) {
      const lctx = loupe.getContext("2d")!;
      lctx.imageSmoothingEnabled = false;
      lctx.clearRect(0, 0, loupe.width, loupe.height);
      const half = Math.floor(LOUPE / 2);
      lctx.drawImage(src, s.x - half, s.y - half, LOUPE, LOUPE, 0, 0, LOUPE * ZOOM, LOUPE * ZOOM);
      // Center pixel outline
      lctx.strokeStyle = "#fff";
      lctx.lineWidth = 2;
      lctx.strokeRect(half * ZOOM, half * ZOOM, ZOOM, ZOOM);
    }
  };

  const pick = async (e: React.PointerEvent) => {
    const s = sampleAt(e);
    if (!s) return;
    const hex = toHex(s.r, s.g, s.b);
    const sw: Swatch = {
      id: uid(),
      hex,
      rgb: `rgb(${s.r}, ${s.g}, ${s.b})`,
      hsl: toHsl(s.r, s.g, s.b),
    };
    setSwatches((prev) => [sw, ...prev.slice(0, 11)]);
    try {
      await navigator.clipboard.writeText(hex);
      toast(`${hex} copied`, "ok");
    } catch {
      toast(hex, "info");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${text} copied`, "ok");
    } catch {
      toast("Couldn't access the clipboard", "err");
    }
  };

  const eyedrop = async () => {
    const EyeDropper = (window as any).EyeDropper;
    if (!EyeDropper) return toast("Your browser doesn't support the screen eyedropper", "err");
    try {
      const result = await new EyeDropper().open();
      const hex = (result.sRGBHex as string).toUpperCase();
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      setSwatches((prev) => [{ id: uid(), hex, rgb: `rgb(${r}, ${g}, ${b})`, hsl: toHsl(r, g, b) }, ...prev.slice(0, 11)]);
      await copy(hex);
    } catch {
      /* user cancelled */
    }
  };

  if (!loaded) {
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
          {tool.description} Hover for a pixel-level loupe, click to copy the hex.
        </p>
        <div className="rise" style={{ animationDelay: "130ms" }}>
          <DropZone onFiles={load} accept={tool.accept} multiple={false} />
        </div>
        {/* Hidden canvas must exist before load draws into it */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: cat.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight">{tool.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="pill-dark" onClick={eyedrop}>
            <Icon name="eyedropper" size={13} />
            Pick from screen
          </button>
          <button className="pill-dark" onClick={() => { setLoaded(false); setSwatches([]); setHover(null); }}>
            <Icon name="retry" size={13} />
            New image
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        <section
          className="dotgrid panel relative flex min-h-[440px] items-center justify-center overflow-hidden !bg-canvas/60 p-6"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={pick}
        >
          <canvas ref={canvasRef} className="max-h-[540px] max-w-full rounded-lg shadow-[0_16px_48px_rgb(0_0_0/0.5)]" style={{ cursor: "crosshair" }} />
          <AnimatePresence>
            {hover && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                transition={{ duration: 0.12 }}
                className="pointer-events-none absolute z-10"
                style={{ left: hover.x + 18, top: hover.y - 130 }}
              >
                <div className="overflow-hidden rounded-xl border border-line-2 bg-panel shadow-[0_16px_40px_rgb(0_0_0/0.55)]">
                  <canvas ref={loupeRef} width={LOUPE * ZOOM} height={LOUPE * ZOOM} className="block" />
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="h-3.5 w-3.5 rounded-[4px] border border-line-2" style={{ background: hover.hex }} />
                    <span className="font-mono text-[11px] text-ink">{hover.hex}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="panel p-4">
          <div className="microlabel mb-3">Palette · {swatches.length}</div>
          {swatches.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-ink-3">Click anywhere on the image to collect colors</p>
          )}
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {swatches.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: 12, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2 p-2"
                >
                  <span className="h-9 w-9 shrink-0 rounded-lg border border-line-2" style={{ background: s.hex }} />
                  <span className="min-w-0 flex-1">
                    <button onClick={() => copy(s.hex)} className="block font-mono text-[12px] text-ink transition-colors hover:text-accent">{s.hex}</button>
                    <button onClick={() => copy(s.rgb)} className="block truncate font-mono text-[10.5px] text-ink-3 transition-colors hover:text-accent">{s.rgb}</button>
                  </span>
                  <button aria-label={`Copy ${s.hex}`} className="icon-btn !h-7 !w-7 !rounded-lg" onClick={() => copy(s.hex)}>
                    <Icon name="copy" size={12} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  );
}
