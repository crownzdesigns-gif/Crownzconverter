import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { OutputFile, StackFile, ToolDef } from "../lib/types";
import { CATEGORY_META, SURFACE_META, TOOLS } from "../lib/registry";
import { cx, downloadBlob, extOf, formatBytes, overFreeLimit, parsePageRanges, parseTimecode, uid } from "../lib/util";
import { processImage, imagesToPdf, type ImageOps, type TargetFormat } from "../lib/engines/image";
import * as pdf from "../lib/engines/pdf";
import * as ffm from "../lib/engines/ffmpeg";
import { renderPdfPages, pdfThumbnails } from "../lib/engines/pdfRender";
import { zipOutputs } from "../lib/engines/zip";
import * as session from "../lib/session";
import { compressPdf, protectPdf, unlockPdf } from "../lib/engines/pdfExtra";
import { convertDocument, pdfToWord } from "../lib/engines/docs";
import { convertEbook } from "../lib/engines/ebook";
import { traceToSvg, upscaleImage } from "../lib/engines/imageExtra";
import { convertArchive } from "../lib/engines/archive";
import { DropZone } from "../components/DropZone";
import { FileStack } from "../components/FileStack";
import { Field, LabeledSlider, NumberField, SelectField, Segment } from "../components/controls";
import { Icon } from "../components/Icon";
import { toast } from "../components/toast";
import { ComingSoon } from "./ComingSoon";

/* ─────────────────────────── options model ─────────────────────────── */

interface ToolOpts {
  format: "original" | TargetFormat;
  quality: number;
  targetMode: "quality" | "size";
  targetSizeKB: number | "";
  resizeMode: "percent" | "pixels";
  percent: number;
  width: number | "";
  height: number | "";
  rotate: 90 | 180 | 270;
  flipMode: "h" | "v" | "both";
  pages: string;
  scalePercent: number;
  margins: { top: number; right: number; bottom: number; left: number };
  dpi: number;
  renderFormat: "jpg" | "png";
  /* media (ffmpeg) */
  mediaFormat: string;
  bitrate: number;
  fps: number;
  gifWidth: number;
  colors: number;
  frameDelay: number;
  trimStart: string;
  trimEnd: string;
  wavRate: number;
  /* misc engines */
  upFactor: 2 | 4;
  svgColors: number;
  password: string;
  arcTarget: "zip" | "tar" | "tgz";
  docTarget: "pdf" | "txt" | "html";
  ebookTarget: "epub" | "pdf" | "txt";
}

function defaultOpts(tool: ToolDef): ToolOpts {
  const e = tool.engine;
  return {
    format: (tool.fixedTarget as TargetFormat) ?? (e === "image-convert" ? "png" : "original"),
    quality: e === "compress-video" ? 60 : e === "pdf-compress" ? 70 : 85,
    targetMode: "quality",
    targetSizeKB: 500,
    resizeMode: "percent",
    percent: 100,
    width: "",
    height: "",
    rotate: 90,
    flipMode: "h",
    pages: "",
    scalePercent: 100,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
    dpi: e === "pdf-compress" ? 110 : 150,
    renderFormat: "jpg",
    mediaFormat:
      tool.fixedTarget ??
      (e === "ffmpeg-video" ? "mp4" : e === "ffmpeg-audio" || e === "ffmpeg-extract" ? "mp3" : ""),
    bitrate: e === "compress-audio" ? 128 : 192,
    fps: e === "compress-gif" ? 12 : 15,
    gifWidth: 480,
    colors: e === "compress-gif" ? 96 : 128,
    frameDelay: 0.7,
    trimStart: "0:00",
    trimEnd: "0:05",
    wavRate: 22050,
    upFactor: 2,
    svgColors: 16,
    password: "",
    arcTarget: "zip",
    docTarget: (tool.fixedTarget as "pdf") ?? "pdf",
    ebookTarget: (tool.fixedTarget as "epub") ?? "epub",
  };
}

const COMBINE_ENGINES = new Set(["pdf-merge", "images-to-pdf", "frames-to-gif"]);
const PAGES_REQUIRED = new Set(["pdf-extract", "pdf-remove"]);
const PREVIEWABLE = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "jfif"]);

/** Map a friendly 1–100 quality to an x264 CRF (lower = better). */
const crfFrom = (quality: number, worst: number, span: number) =>
  Math.round(worst - (quality / 100) * span);

function ctaLabel(tool: ToolDef, n: number): string {
  switch (tool.engine) {
    case "pdf-merge":
      return n > 1 ? `Merge ${n} PDFs` : "Merge PDFs";
    case "images-to-pdf":
      return "Create PDF";
    case "frames-to-gif":
      return "Create GIF";
    case "pdf-split":
      return "Split into pages";
    case "pdf-render":
      return "Export images";
    case "ffmpeg-trim":
      return `Trim${n > 1 ? ` ${n} videos` : ""}`;
    case "pdf-protect":
      return `Protect${n > 1 ? ` ${n} PDFs` : ""}`;
    case "pdf-unlock":
      return `Unlock${n > 1 ? ` ${n} PDFs` : ""}`;
    case "upscale":
      return `Upscale${n > 1 ? ` ${n} images` : ""}`;
    default:
      return `${SURFACE_META[tool.surface].verb}${n > 1 ? ` ${n} files` : ""}`;
  }
}

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp", "ogv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"]);

/**
 * Grab a poster frame from a video file: load it muted, seek a little past the
 * start (the very first frame is often black), and paint it to a canvas.
 */
function videoPoster(file: File): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const grab = () => {
      if (settled) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return fail("no dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
        settled = true;
        cleanup();
        resolve({ url: canvas.toDataURL("image/jpeg", 0.82), w, h });
      } catch {
        fail("frame paint failed");
      }
    };

    video.onloadeddata = () => {
      // Seek a hair into the clip so we skip a leading black frame.
      const target = Math.min(0.1, (video.duration || 1) * 0.02);
      if (video.currentTime < target) {
        try {
          video.currentTime = target;
        } catch {
          grab();
        }
      } else {
        grab();
      }
    };
    video.onseeked = grab;
    video.onerror = () => fail("video decode failed");
    setTimeout(() => fail("timed out"), 8000);

    video.src = objectUrl;
  });
}

/* ─────────────────────────── options panel ─────────────────────────── */

function OptionsPanel({
  tool,
  opts,
  set,
  pageNote,
}: {
  tool: ToolDef;
  opts: ToolOpts;
  set: <K extends keyof ToolOpts>(k: K, v: ToolOpts[K]) => void;
  pageNote: string | null;
}) {
  const e = tool.engine;
  const lockedFormat = Boolean(tool.fixedTarget);
  const qualityOff = opts.format === "png" || (opts.format === "original" && tool.fixedSource === "png");

  const formatSelect = (label = "Output format", includeOriginal = false) => (
    <SelectField
      label={label}
      value={opts.format}
      onChange={(v) => set("format", v as ToolOpts["format"])}
      options={[
        ...(includeOriginal ? [{ value: "original", label: "Keep original" }] : []),
        { value: "png", label: "PNG" },
        { value: "jpg", label: "JPG" },
        { value: "webp", label: "WEBP" },
      ]}
    />
  );

  const pagesField = (required: boolean) => (
    <Field label={required ? "Pages" : "Pages (optional)"} right={pageNote ? <span className="font-mono text-[10.5px] text-ink-3">{pageNote}</span> : undefined}>
      <input
        className="field font-mono !text-[13px]"
        placeholder={required ? "e.g. 1, 3-5" : "All pages — or e.g. 2-4"}
        value={opts.pages}
        onChange={(ev) => set("pages", ev.target.value)}
        spellCheck={false}
      />
    </Field>
  );

  const note = (text: string) => (
    <p className="rounded-lg border border-line bg-panel-2/60 px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
      {text}
    </p>
  );

  const ffNote = () =>
    note("Processed locally in your browser using its hardware video encoder when available (Chrome and Edge), so 4K runs at roughly real time. Other browsers fall back to FFmpeg in WebAssembly, which is much slower — lower the Resolution there.");

  const lockedChip = (target: string) => (
    <Field label="Output format">
      <div className="field flex items-center justify-between !py-2">
        <span className="font-mono text-[12px] tracking-wide text-ink uppercase">{target}</span>
        <Icon name="lock" size={12} className="text-ink-3" />
      </div>
    </Field>
  );

  const gifWidthSelect = (allowOriginal = false) => (
    <SelectField
      label="Width"
      value={String(opts.gifWidth)}
      onChange={(v) => set("gifWidth", Number(v))}
      options={[
        ...(allowOriginal ? [{ value: "0", label: "Keep original" }] : []),
        { value: "320", label: "320 px" },
        { value: "480", label: "480 px" },
        { value: "640", label: "640 px" },
      ]}
    />
  );

  switch (e) {
    case "image-convert":
      return (
        <>
          {lockedFormat ? (
            <Field label="Output format">
              <div className="field flex items-center justify-between !py-2">
                <span className="font-mono text-[12px] tracking-wide text-ink uppercase">{tool.fixedTarget}</span>
                <Icon name="lock" size={12} className="text-ink-3" />
              </div>
            </Field>
          ) : (
            formatSelect()
          )}
          <LabeledSlider label="Quality" value={opts.quality} min={1} max={100} onChange={(v) => set("quality", v)} disabled={qualityOff} />
          {qualityOff && note("PNG is lossless — the quality slider doesn't apply.")}
        </>
      );

    case "image-compress":
      return (
        <>
          {tool.fixedSource !== "png" && (
            <Segment
              label="Compression target"
              value={opts.targetMode}
              onChange={(v) => set("targetMode", v)}
              options={[
                { value: "quality", label: "Quality" },
                { value: "size", label: "Target size" },
              ]}
            />
          )}
          {opts.targetMode === "quality" || tool.fixedSource === "png" ? (
            <LabeledSlider label="Quality" value={opts.quality} min={1} max={100} onChange={(v) => set("quality", v)} disabled={tool.fixedSource === "png"} />
          ) : (
            <Field label="Target size">
              <div className="flex items-center gap-2">
                <NumberField value={opts.targetSizeKB} onChange={(v) => set("targetSizeKB", v)} suffix="KB" min={1} width="110px" />
                <div className="flex gap-1.5">
                  {[100, 500, 1024].map((kb) => (
                    <button
                      key={kb}
                      onClick={() => set("targetSizeKB", kb)}
                      className={cx(
                        "rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors duration-120",
                        opts.targetSizeKB === kb
                          ? "border-accent/60 bg-accent-dim text-accent"
                          : "border-line-2 text-ink-3 hover:border-line-3 hover:text-ink-2",
                      )}
                    >
                      {kb === 1024 ? "1 MB" : `${kb} KB`}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          )}
          <LabeledSlider label="Resolution" value={opts.percent} min={10} max={100} onChange={(v) => set("percent", v)} />
          {!tool.fixedSource && formatSelect("Output format", true)}
          {tool.fixedSource === "png" && note("PNG re-encodes losslessly — lower the resolution to shrink it, or use the Image Compressor to convert to WEBP.")}
        </>
      );

    case "image-resize":
      return (
        <>
          <Segment
            label="Resize mode"
            value={opts.resizeMode}
            onChange={(v) => set("resizeMode", v)}
            options={[
              { value: "percent", label: "Percent" },
              { value: "pixels", label: "Exact pixels" },
            ]}
          />
          {opts.resizeMode === "percent" ? (
            <LabeledSlider label="Scale" value={opts.percent} min={1} max={200} onChange={(v) => set("percent", v)} />
          ) : (
            <Field label="Dimensions">
              <div className="flex items-center gap-2">
                <NumberField value={opts.width} onChange={(v) => set("width", v)} placeholder="Width" suffix="PX" min={1} />
                <Icon name="x" size={10} className="shrink-0 text-ink-3" />
                <NumberField value={opts.height} onChange={(v) => set("height", v)} placeholder="Height" suffix="PX" min={1} />
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">Leave one side blank to keep the aspect ratio.</p>
            </Field>
          )}
        </>
      );

    case "image-rotate":
      return (
        <Field label="Rotation">
          <Segment
            value={opts.rotate}
            onChange={(v) => set("rotate", v)}
            options={[
              { value: 90 as const, label: "90° CW" },
              { value: 180 as const, label: "180°" },
              { value: 270 as const, label: "90° CCW" },
            ]}
          />
        </Field>
      );

    case "image-flip":
      return (
        <Field label="Mirror direction">
          <Segment
            value={opts.flipMode}
            onChange={(v) => set("flipMode", v)}
            options={[
              { value: "h" as const, label: "Horizontal" },
              { value: "v" as const, label: "Vertical" },
              { value: "both" as const, label: "Both" },
            ]}
          />
        </Field>
      );

    case "pdf-merge":
      return note("Drag the files by their handle to set the page order, then merge.");

    case "images-to-pdf":
      return note("Each image becomes one page, sized to the image. Drag files to reorder pages.");

    case "pdf-split":
      return note("Every page becomes its own PDF. Batches download as a ZIP.");

    case "pdf-flatten":
      return note("Form fields and annotations are baked into the page content so they can't be edited.");

    case "pdf-extract":
    case "pdf-remove":
      return pagesField(true);

    case "pdf-rotate":
      return (
        <>
          <Field label="Rotation">
            <Segment
              value={opts.rotate}
              onChange={(v) => set("rotate", v)}
              options={[
                { value: 90 as const, label: "90° CW" },
                { value: 180 as const, label: "180°" },
                { value: 270 as const, label: "90° CCW" },
              ]}
            />
          </Field>
          {pagesField(false)}
        </>
      );

    case "pdf-resize":
      return <LabeledSlider label="Page scale" value={opts.scalePercent} min={25} max={400} onChange={(v) => set("scalePercent", v)} />;

    case "pdf-crop":
      return (
        <Field label="Trim margins (% of each edge)">
          <div className="grid grid-cols-2 gap-2">
            {(["top", "bottom", "left", "right"] as const).map((side) => (
              <div key={side} className="flex items-center gap-2">
                <span className="microlabel w-12 shrink-0 !text-[9px]">{side}</span>
                <NumberField
                  value={opts.margins[side]}
                  min={0}
                  max={40}
                  onChange={(v) => set("margins", { ...opts.margins, [side]: v === "" ? 0 : Math.min(40, v) })}
                />
              </div>
            ))}
          </div>
        </Field>
      );

    case "pdf-render":
      return (
        <>
          <Field label="Image format">
            <Segment
              value={opts.renderFormat}
              onChange={(v) => set("renderFormat", v)}
              options={[
                { value: "jpg" as const, label: "JPG" },
                { value: "png" as const, label: "PNG" },
              ]}
            />
          </Field>
          <SelectField
            label="Resolution"
            value={String(opts.dpi)}
            onChange={(v) => set("dpi", Number(v))}
            options={[
              { value: "72", label: "72 DPI — screen" },
              { value: "150", label: "150 DPI — sharp" },
              { value: "300", label: "300 DPI — print" },
            ]}
          />
          {opts.renderFormat === "jpg" && (
            <LabeledSlider label="Quality" value={opts.quality} min={1} max={100} onChange={(v) => set("quality", v)} />
          )}
          {pagesField(false)}
        </>
      );

    /* ── media (ffmpeg.wasm) ── */

    case "ffmpeg-video":
      return (
        <>
          {lockedFormat ? lockedChip(tool.fixedTarget!) : (
            <SelectField
              label="Output format"
              value={opts.mediaFormat}
              onChange={(v) => set("mediaFormat", v)}
              options={["mp4", "mov", "mkv", "webm", "avi", "gif"].map((f) => ({ value: f, label: f.toUpperCase() }))}
            />
          )}
          {opts.mediaFormat === "gif" ? (
            <>
              <LabeledSlider label="Frame rate" value={opts.fps} min={5} max={30} unit=" fps" onChange={(v) => set("fps", v)} />
              {gifWidthSelect()}
            </>
          ) : (
            <LabeledSlider label="Quality" value={opts.quality} min={1} max={100} onChange={(v) => set("quality", v)} />
          )}
          {ffNote()}
        </>
      );

    case "ffmpeg-audio":
    case "ffmpeg-extract":
      return (
        <>
          {lockedFormat ? lockedChip(tool.fixedTarget!) : (
            <SelectField
              label="Output format"
              value={opts.mediaFormat}
              onChange={(v) => set("mediaFormat", v)}
              options={["mp3", "wav", "ogg", "m4a", "flac"].map((f) => ({ value: f, label: f.toUpperCase() }))}
            />
          )}
          {(opts.mediaFormat === "mp3" || opts.mediaFormat === "m4a") && (
            <SelectField
              label="Bitrate"
              value={String(opts.bitrate)}
              onChange={(v) => set("bitrate", Number(v))}
              options={[128, 192, 256, 320].map((b) => ({ value: String(b), label: `${b} kbps` }))}
            />
          )}
          {ffNote()}
        </>
      );

    case "ffmpeg-gif":
      return (
        <>
          <LabeledSlider label="Frame rate" value={opts.fps} min={5} max={30} unit=" fps" onChange={(v) => set("fps", v)} />
          {gifWidthSelect()}
          <SelectField
            label="Colors"
            value={String(opts.colors)}
            onChange={(v) => set("colors", Number(v))}
            options={[64, 128, 256].map((c) => ({ value: String(c), label: `${c} colors` }))}
          />
          {ffNote()}
        </>
      );

    case "gif-to-video":
      return note("Re-encodes the GIF as a compact, silent MP4 — usually 5–10× smaller.");

    case "gif-to-apng":
      return note("Converts each GIF into a looping animated PNG with full 24-bit color.");

    case "frames-to-gif":
      return (
        <>
          <SelectField
            label="Time per frame"
            value={String(opts.frameDelay)}
            onChange={(v) => set("frameDelay", Number(v))}
            options={[0.2, 0.5, 0.7, 1, 2].map((s) => ({ value: String(s), label: `${s}s` }))}
          />
          {gifWidthSelect()}
          {note("Drag files by their handle to set the frame order. All frames are fit to the first image's size.")}
        </>
      );

    case "ffmpeg-trim":
      return (
        <>
          <Field label="Keep from → to">
            <div className="flex items-center gap-2">
              <input className="field font-mono !text-[13px]" value={opts.trimStart} onChange={(ev) => set("trimStart", ev.target.value)} placeholder="0:00" spellCheck={false} aria-label="Start time" />
              <Icon name="arrowRight" size={12} className="shrink-0 text-ink-3" />
              <input className="field font-mono !text-[13px]" value={opts.trimEnd} onChange={(ev) => set("trimEnd", ev.target.value)} placeholder="0:10" spellCheck={false} aria-label="End time" />
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">Times as mm:ss or h:mm:ss. Cuts snap to the nearest keyframe for an instant, lossless trim.</p>
          </Field>
          {ffNote()}
        </>
      );

    case "ffmpeg-crop":
      return (
        <>
          <Field label="Crop margins (% of each edge)">
            <div className="grid grid-cols-2 gap-2">
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <div key={side} className="flex items-center gap-2">
                  <span className="microlabel w-12 shrink-0 !text-[9px]">{side}</span>
                  <NumberField
                    value={opts.margins[side]}
                    min={0}
                    max={45}
                    onChange={(v) => set("margins", { ...opts.margins, [side]: v === "" ? 0 : Math.min(45, v) })}
                  />
                </div>
              ))}
            </div>
          </Field>
          {ffNote()}
        </>
      );

    case "compress-video":
      return (
        <>
          <LabeledSlider label="Quality" value={opts.quality} min={10} max={100} onChange={(v) => set("quality", v)} />
          <LabeledSlider label="Resolution" value={opts.percent} min={25} max={100} onChange={(v) => set("percent", v)} />
          {ffNote()}
        </>
      );

    case "compress-audio":
      return (
        <>
          <SelectField
            label="Bitrate"
            value={String(opts.bitrate)}
            onChange={(v) => set("bitrate", Number(v))}
            options={[64, 96, 128, 160].map((b) => ({ value: String(b), label: `${b} kbps` }))}
          />
          {ffNote()}
        </>
      );

    case "compress-wav":
      return (
        <>
          <SelectField
            label="Sample rate"
            value={String(opts.wavRate)}
            onChange={(v) => set("wavRate", Number(v))}
            options={[
              { value: "44100", label: "44.1 kHz — CD quality" },
              { value: "22050", label: "22 kHz — voice" },
              { value: "11025", label: "11 kHz — smallest" },
            ]}
          />
          {ffNote()}
        </>
      );

    case "compress-gif":
      return (
        <>
          <LabeledSlider label="Frame rate" value={opts.fps} min={5} max={24} unit=" fps" onChange={(v) => set("fps", v)} />
          {gifWidthSelect(true)}
          <SelectField
            label="Colors"
            value={String(opts.colors)}
            onChange={(v) => set("colors", Number(v))}
            options={[32, 64, 96, 128].map((c) => ({ value: String(c), label: `${c} colors` }))}
          />
          {ffNote()}
        </>
      );

    /* ── documents, ebooks, misc ── */

    case "pdf-compress":
      return (
        <>
          <SelectField
            label="Detail"
            value={String(opts.dpi)}
            onChange={(v) => set("dpi", Number(v))}
            options={[
              { value: "72", label: "72 DPI — smallest" },
              { value: "110", label: "110 DPI — balanced" },
              { value: "150", label: "150 DPI — sharp" },
            ]}
          />
          <LabeledSlider label="Image quality" value={opts.quality} min={20} max={95} onChange={(v) => set("quality", v)} />
          {note("Pages are re-rendered as compressed images — text stays readable but is no longer selectable.")}
        </>
      );

    case "pdf-unlock":
      return note("Strips owner-password restrictions (printing, copying, editing) from PDFs you own.");

    case "pdf-protect":
      return (
        <Field label="Password">
          <input
            type="password"
            className="field font-mono !text-[13px]"
            value={opts.password}
            onChange={(ev) => set("password", ev.target.value)}
            placeholder="Choose a password"
            autoComplete="new-password"
          />
        </Field>
      );

    case "pdf-word":
      return note("Rebuilds headings, paragraphs and bullet lists as an editable DOCX. Images and exact page layout are not carried over; scanned PDFs need OCR.");

    case "doc-convert":
      return (
        <>
          {lockedFormat ? lockedChip(tool.fixedTarget!) : (
            <SelectField
              label="Convert to"
              value={opts.docTarget}
              onChange={(v) => set("docTarget", v as ToolOpts["docTarget"])}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "txt", label: "Plain text" },
                { value: "html", label: "HTML" },
              ]}
            />
          )}
          {note("Text, headings, bold/italic, lists and embedded images carry over. Tables and complex layouts are simplified.")}
        </>
      );

    case "ebook":
      return (
        <>
          {lockedFormat ? lockedChip(tool.fixedTarget!) : (
            <SelectField
              label="Convert to"
              value={opts.ebookTarget}
              onChange={(v) => set("ebookTarget", v as ToolOpts["ebookTarget"])}
              options={[
                { value: "epub", label: "EPUB" },
                { value: "pdf", label: "PDF" },
                { value: "txt", label: "Plain text" },
              ]}
            />
          )}
          {note("Chapters and text carry over; images and publisher styling are simplified.")}
        </>
      );

    case "trace-svg":
      return (
        <>
          <LabeledSlider label="Color count" value={opts.svgColors} min={2} max={32} unit="" onChange={(v) => set("svgColors", v)} />
          {note("Traces the bitmap into vector paths — fewer colors gives flatter, cleaner shapes.")}
        </>
      );

    case "upscale":
      return (
        <Field label="Upscale factor">
          <Segment
            value={opts.upFactor}
            onChange={(v) => set("upFactor", v)}
            options={[
              { value: 2 as const, label: "2× larger" },
              { value: 4 as const, label: "4× larger" },
            ]}
          />
        </Field>
      );

    case "archive":
      return (
        <SelectField
          label="Convert to"
          value={opts.arcTarget}
          onChange={(v) => set("arcTarget", v as ToolOpts["arcTarget"])}
          options={[
            { value: "zip", label: "ZIP" },
            { value: "tar", label: "TAR" },
            { value: "tgz", label: "TAR.GZ" },
          ]}
        />
      );

    default:
      return null;
  }
}

/* ─────────────────────────── preview pane ─────────────────────────── */

function PreviewPane({ sf, onDownloadOutput }: { sf: StackFile | null; onDownloadOutput: (o: OutputFile) => void }) {
  const [pdfThumb, setPdfThumb] = useState<string | null>(null);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [dims, setDims] = useState<string | null>(null);
  const thumbFor = useRef<string | null>(null);

  const ext = sf ? extOf(sf.file.name) : "";
  const isVideo = VIDEO_EXT.has(ext);
  const isAudio = AUDIO_EXT.has(ext);

  useEffect(() => {
    setDims(null);
    setVideoThumb(null);
    setVideoFailed(false);
    setPdfThumb(null);
    if (!sf) {
      thumbFor.current = null;
      return;
    }
    if (thumbFor.current === sf.id) return;
    thumbFor.current = sf.id;
    let alive = true;

    if (ext === "pdf") {
      pdfThumbnails(sf.file, 480, 1)
        .then((urls) => alive && setPdfThumb(urls[0] ?? null))
        .catch(() => alive && setPdfThumb(null));
    } else if (VIDEO_EXT.has(ext)) {
      videoPoster(sf.file)
        .then((r) => {
          if (!alive) return;
          setVideoThumb(r.url);
          setDims(`${r.w}×${r.h}`);
        })
        .catch(() => alive && setVideoFailed(true));
    }
    return () => {
      alive = false;
    };
  }, [sf?.id, ext]);

  const src = sf?.previewUrl ?? pdfThumb ?? videoThumb;

  return (
    <div className="dotgrid relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas/60 p-6">
      {!sf && (
        <div className="text-center">
          <Icon name="image" size={22} className="mx-auto mb-2 text-ink-3/60" />
          <p className="text-[13px] text-ink-3">Select a file to preview it</p>
        </div>
      )}
      {sf && (
        <AnimatePresence mode="wait">
          <motion.div
            key={sf.id + (src ? "-img" : "-icon")}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-full max-w-full items-center justify-center"
          >
            {src ? (
              <>
                <img
                  src={src}
                  alt={sf.file.name}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (sf.previewUrl) setDims(`${img.naturalWidth}×${img.naturalHeight}`);
                  }}
                  className="max-h-[380px] max-w-full rounded-lg object-contain shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
                />
                {isVideo && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                      <Icon name="video" size={22} />
                    </span>
                  </span>
                )}
              </>
            ) : isVideo && !videoFailed ? (
              <div className="flex flex-col items-center gap-3 text-ink-3">
                <span className="spin inline-block text-accent">
                  <Icon name="sparkle" size={20} />
                </span>
                <span className="text-[12.5px]">Loading preview…</span>
              </div>
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-2xl border border-line-2 bg-panel-2 text-ink-3">
                <Icon name={isAudio ? "audio" : isVideo ? "video" : "fileText"} size={30} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {sf && (
        <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
          <span className="microlabel rounded-md border border-line bg-canvas/85 px-2 py-1 !text-[9.5px] backdrop-blur">
            {dims ? `${dims} · ` : ""}
            {formatBytes(sf.file.size)} · {extOf(sf.file.name) || "file"}
          </span>
          {sf.status === "done" && sf.outputs.length > 0 && (
            <div className="flex max-w-[60%] flex-wrap justify-end gap-1.5">
              {sf.outputs.slice(0, 4).map((o) => (
                <button
                  key={o.name}
                  onClick={() => onDownloadOutput(o)}
                  className="flex items-center gap-1.5 rounded-md border border-ok/35 bg-canvas/85 px-2 py-1 font-mono text-[10px] text-ok backdrop-blur transition-colors hover:bg-ok/10"
                >
                  <Icon name="download" size={10} />
                  {o.name.length > 22 ? `…${o.name.slice(-20)}` : o.name}
                </button>
              ))}
              {sf.outputs.length > 4 && (
                <span className="microlabel self-center !text-[9px]">+{sf.outputs.length - 4} more</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

export function ToolPage({ tool, initialFiles }: { tool: ToolDef; initialFiles?: File[] }) {
  if (tool.phase) return <ComingSoon tool={tool} />;
  return <LiveTool tool={tool} initialFiles={initialFiles} />;
}

function LiveTool({ tool, initialFiles }: { tool: ToolDef; initialFiles?: File[] }) {
  const [stack, setStack] = useState<StackFile[]>([]);
  const [opts, setOpts] = useState<ToolOpts>(() => defaultOpts(tool));
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [combined, setCombined] = useState<OutputFile[] | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  // Don't persist until the saved session has been read, or we'd overwrite it with an empty stack.
  const [hydrated, setHydrated] = useState(false);

  const isCombine = COMBINE_ENGINES.has(tool.engine);
  const isPdfTool = tool.accept?.length === 1 && tool.accept[0] === "pdf";

  useEffect(() => {
    document.title = `${tool.name} — CrownzConverter`;
    return () => {
      for (const sf of stackRef.current) if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
    };
  }, []);

  const setOpt = useCallback(<K extends keyof ToolOpts>(k: K, v: ToolOpts[K]) => {
    setOpts((o) => ({ ...o, [k]: v }));
    // Changing settings invalidates previous results.
    setCombined(null);
    setStack((prev) =>
      prev.map((s) => (s.status === "done" || s.status === "error" ? { ...s, status: "idle", progress: 0, outputs: [] } : s)),
    );
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted: StackFile[] = [];
      let rejected = 0;
      let oversize = 0;
      for (const file of files) {
        const ext = extOf(file.name);
        if (tool.accept?.length && !tool.accept.includes(ext)) {
          rejected++;
          continue;
        }
        if (overFreeLimit(file)) {
          oversize++;
          continue;
        }
        accepted.push({
          id: uid(),
          file,
          status: "idle",
          progress: 0,
          outputs: [],
          previewUrl: PREVIEWABLE.has(ext) ? URL.createObjectURL(file) : undefined,
        });
      }
      if (rejected) toast(`${rejected} file${rejected > 1 ? "s" : ""} skipped — this tool takes ${tool.accept?.map((a) => `.${a}`).join(", ")}`, "err");
      if (oversize) toast("Max file size is 1 GB — sign up to unlock more", "err");
      if (!accepted.length) return;

      setStack((prev) => {
        const next = tool.single ? accepted.slice(0, 1) : [...prev, ...accepted];
        return next;
      });
      for (const sf of accepted) session.saveFile(tool.slug, sf.id, sf.file);
      setSelectedId((cur) => cur ?? accepted[0].id);
      setCombined(null);

      for (const sf of accepted) {
        if (extOf(sf.file.name) === "pdf") {
          pdf
            .pdfPageCount(sf.file)
            .then((n) => setPageCounts((m) => ({ ...m, [sf.id]: n })))
            .catch(() => {});
        }
      }
    },
    [tool],
  );

  useEffect(() => {
    let cancelled = false;
    session.loadSession(tool.slug).then((saved) => {
      if (cancelled) return;
      if (saved) {
        const restored: StackFile[] = saved.files.map((f) => ({
          id: f.id,
          file: f.file,
          status: f.status,
          progress: f.status === "done" ? 1 : 0,
          outputs: f.outputs,
          previewUrl: PREVIEWABLE.has(extOf(f.file.name)) ? URL.createObjectURL(f.file) : undefined,
        }));
        setStack((prev) => (tool.single ? (prev.length ? prev : restored.slice(0, 1)) : [...restored, ...prev]));
        setSelectedId((cur) => cur ?? saved.selectedId ?? restored[0]?.id ?? null);
        if (saved.opts && typeof saved.opts === "object") setOpts((o) => ({ ...o, ...(saved.opts as Partial<ToolOpts>) }));
        for (const sf of restored) {
          if (extOf(sf.file.name) === "pdf") {
            pdf.pdfPageCount(sf.file).then((n) => setPageCounts((m) => ({ ...m, [sf.id]: n }))).catch(() => {});
          }
        }
        toast(`Restored ${restored.length} file${restored.length > 1 ? "s" : ""} from your last visit`, "ok");
      }
      setHydrated(true);
    });
    if (initialFiles?.length) addFiles(initialFiles);
    return () => { cancelled = true; };
  }, []);

  // Keep the lightweight session record (order, statuses, settings) in sync.
  const stackKey = stack.map((s) => `${s.id}:${s.status}`).join("|");
  useEffect(() => {
    if (!hydrated) return;
    const cur = stackRef.current;
    session.saveMeta(tool.slug, {
      ids: cur.map((s) => s.id),
      status: Object.fromEntries(cur.map((s) => [s.id, s.status])),
      selectedId,
      opts,
    });
  }, [hydrated, stackKey, selectedId, opts, tool.slug]);

  const patch = (id: string, p: Partial<StackFile>) =>
    setStack((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const runOne = async (sf: StackFile): Promise<OutputFile[]> => {
    const onProgress = (p: number) => patch(sf.id, { progress: p });
    const count = pageCounts[sf.id] ?? 9999;
    const parsedPages = opts.pages.trim() ? parsePageRanges(opts.pages, count) : null;
    if (PAGES_REQUIRED.has(tool.engine) && !parsedPages) throw new Error("Enter pages like 1, 3-5");
    if (opts.pages.trim() && !parsedPages) throw new Error("Invalid page range");

    const imageOps = (extra: Partial<ImageOps> = {}): ImageOps => ({ ...extra });

    switch (tool.engine) {
      case "image-convert":
        return processImage(sf.file, imageOps({ format: opts.format === "original" ? undefined : opts.format, quality: opts.quality }), onProgress);
      case "image-compress":
        return processImage(
          sf.file,
          imageOps({
            format: opts.format === "original" ? undefined : opts.format,
            quality: opts.quality,
            targetMode: opts.targetMode,
            targetSizeKB: typeof opts.targetSizeKB === "number" ? opts.targetSizeKB : undefined,
            resizeMode: "percent",
            percent: opts.percent,
            neverLarger: true,
          }),
          onProgress,
        );
      case "image-resize":
        return processImage(
          sf.file,
          imageOps({
            resizeMode: opts.resizeMode,
            percent: opts.percent,
            width: typeof opts.width === "number" ? opts.width : undefined,
            height: typeof opts.height === "number" ? opts.height : undefined,
            quality: 92,
          }),
          onProgress,
        );
      case "image-rotate":
        return processImage(sf.file, imageOps({ rotate: opts.rotate, quality: 92 }), onProgress);
      case "image-flip":
        return processImage(
          sf.file,
          imageOps({ flipH: opts.flipMode !== "v", flipV: opts.flipMode !== "h", quality: 92 }),
          onProgress,
        );
      case "pdf-split":
        return pdf.splitPdf(sf.file, onProgress);
      case "pdf-extract":
        return pdf.extractPages(sf.file, { pages: parsedPages! }, onProgress);
      case "pdf-remove":
        return pdf.removePages(sf.file, { pages: parsedPages! }, onProgress);
      case "pdf-rotate":
        return pdf.rotatePdf(sf.file, { rotate: opts.rotate, pages: parsedPages ?? undefined }, onProgress);
      case "pdf-flatten":
        return pdf.flattenPdf(sf.file, onProgress);
      case "pdf-resize":
        return pdf.resizePdf(sf.file, { scalePercent: opts.scalePercent }, onProgress);
      case "pdf-crop":
        return pdf.cropPdf(sf.file, { margins: opts.margins }, onProgress);
      case "pdf-render":
        return renderPdfPages(
          sf.file,
          { dpi: opts.dpi, renderFormat: opts.renderFormat, renderQuality: opts.quality, pages: parsedPages ?? undefined },
          onProgress,
        );

      /* ── media (ffmpeg.wasm) ── */
      case "ffmpeg-video":
        return ffm.convertVideo(
          sf.file,
          opts.mediaFormat || "mp4",
          { crf: crfFrom(opts.quality, 33, 15), fps: opts.fps, gifWidth: opts.gifWidth, colors: opts.colors },
          onProgress,
        );
      case "ffmpeg-audio":
      case "ffmpeg-extract":
        return ffm.convertAudio(sf.file, opts.mediaFormat || "mp3", { bitrate: opts.bitrate }, onProgress);
      case "ffmpeg-gif":
        return ffm.convertVideo(sf.file, "gif", { fps: opts.fps, gifWidth: opts.gifWidth, colors: opts.colors }, onProgress);
      case "gif-to-video":
        return ffm.gifToVideo(sf.file, onProgress);
      case "gif-to-apng":
        return ffm.gifToApng(sf.file, onProgress);
      case "ffmpeg-trim": {
        const start = parseTimecode(opts.trimStart);
        const end = parseTimecode(opts.trimEnd);
        if (start === null || end === null) throw new Error("Times must look like 0:05 or 1:02:30");
        return ffm.trimVideo(sf.file, start, end, onProgress);
      }
      case "ffmpeg-crop":
        return ffm.cropVideo(sf.file, opts.margins, onProgress);
      case "compress-video":
        return ffm.compressVideo(sf.file, { crf: crfFrom(opts.quality, 38, 16), quality: opts.quality, vScale: opts.percent }, onProgress);
      case "compress-audio":
        return ffm.compressMp3(sf.file, opts.bitrate, onProgress);
      case "compress-wav":
        return ffm.compressWav(sf.file, opts.wavRate, onProgress);
      case "compress-gif":
        return ffm.compressGif(sf.file, { fps: opts.fps, gifWidth: opts.gifWidth, colors: opts.colors }, onProgress);

      /* ── documents, ebooks, misc ── */
      case "pdf-compress":
        return compressPdf(sf.file, { dpi: opts.dpi, quality: opts.quality }, onProgress);
      case "pdf-unlock":
        return unlockPdf(sf.file, onProgress);
      case "pdf-protect":
        return protectPdf(sf.file, opts.password, onProgress);
      case "pdf-word":
        return pdfToWord(sf.file, onProgress);
      case "doc-convert":
        return convertDocument(sf.file, opts.docTarget, onProgress);
      case "ebook":
        return convertEbook(sf.file, opts.ebookTarget, onProgress);
      case "trace-svg":
        return traceToSvg(sf.file, { svgColors: opts.svgColors }, onProgress);
      case "upscale":
        return upscaleImage(sf.file, { upFactor: opts.upFactor }, onProgress);
      case "archive":
        return convertArchive(sf.file, opts.arcTarget, onProgress);
      default:
        throw new Error("Unsupported operation");
    }
  };

  const run = async (onlyIds?: string[]) => {
    if (running) return;
    const targets = stackRef.current.filter((s) => (onlyIds ? onlyIds.includes(s.id) : s.status !== "done"));
    if (!targets.length) return;
    setRunning(true);

    if (isCombine) {
      const all = stackRef.current;
      setCombined(null);
      for (const s of all) patch(s.id, { status: "processing", progress: 0, outputs: [], error: undefined });
      try {
        const onProgress = (p: number) => {
          for (const s of stackRef.current) patch(s.id, { progress: p });
        };
        const files = all.map((s) => s.file);
        const outs =
          tool.engine === "pdf-merge"
            ? await pdf.mergePdfs(files, onProgress)
            : tool.engine === "frames-to-gif"
              ? await ffm.framesToGif(files, { frameDelay: opts.frameDelay, gifWidth: opts.gifWidth, colors: opts.colors }, onProgress)
              : await imagesToPdf(files, onProgress);
        for (const s of stackRef.current) patch(s.id, { status: "done", progress: 1 });
        setCombined(outs);
        toast(tool.engine === "pdf-merge" ? "PDFs merged" : tool.engine === "frames-to-gif" ? "GIF created" : "PDF created", "ok");
      } catch (err) {
        for (const s of stackRef.current) patch(s.id, { status: "error", error: (err as Error).message });
        toast((err as Error).message, "err");
      }
      setRunning(false);
      return;
    }

    let ok = 0;
    let failed = 0;
    for (const sf of targets) {
      patch(sf.id, { status: "processing", progress: 0, outputs: [], error: undefined });
      try {
        const outputs = await runOne(sf);
        patch(sf.id, { status: "done", progress: 1, outputs });
        session.saveOutputs(tool.slug, sf.id, outputs);
        ok++;
      } catch (err) {
        patch(sf.id, { status: "error", error: (err as Error).message || "Processing failed" });
        failed++;
      }
    }
    if (failed === 0) toast(`${ok} file${ok > 1 ? "s" : ""} ready to download`, "ok");
    else toast(`${ok} succeeded, ${failed} failed`, failed ? "err" : "ok");
    setRunning(false);
  };

  const removeFile = (id: string) => {
    setStack((prev) => {
      const sf = prev.find((s) => s.id === id);
      if (sf?.previewUrl) URL.revokeObjectURL(sf.previewUrl);
      session.removeEntry(id);
      const next = prev.filter((s) => s.id !== id);
      setSelectedId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
    setCombined(null);
  };

  const clearAll = () => {
    for (const sf of stackRef.current) if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl);
    session.clearSession(tool.slug);
    setStack([]);
    setCombined(null);
    setSelectedId(null);
  };

  const downloadFile = async (sf: StackFile) => {
    if (!sf.outputs.length) return;
    if (sf.outputs.length === 1) return downloadBlob(sf.outputs[0].blob, sf.outputs[0].name);
    const blob = await zipOutputs(sf.outputs);
    downloadBlob(blob, `${sf.outputs[0].name.replace(/\.[^.]+$/, "")}.zip`);
  };

  const downloadAll = async () => {
    if (combined) {
      for (const o of combined) downloadBlob(o.blob, o.name);
      return;
    }
    const outs = stackRef.current.flatMap((s) => s.outputs);
    if (!outs.length) return;
    if (outs.length === 1) return downloadBlob(outs[0].blob, outs[0].name);
    const blob = await zipOutputs(outs);
    downloadBlob(blob, `crownzconverter-${tool.slug}.zip`);
    toast(`${outs.length} files zipped`, "ok");
  };

  const selected = stack.find((s) => s.id === selectedId) ?? null;
  const allDone = stack.length > 0 && stack.every((s) => s.status === "done") && (!isCombine || !!combined);
  const notes = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [id, n] of Object.entries(pageCounts)) m[id] = `${n} page${n === 1 ? "" : "s"}`;
    return m;
  }, [pageCounts]);
  const pageNote = selected && pageCounts[selected.id] ? `of ${pageCounts[selected.id]}` : null;

  const cat = CATEGORY_META[tool.category];
  const related = useMemo(
    () =>
      TOOLS.filter((t) => t.slug !== tool.slug && t.category === tool.category && !t.phase)
        .slice(0, 6),
    [tool],
  );

  /* ── empty state: SEO landing layout ── */
  if (stack.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-20">
        <div className="rise mb-3" style={{ animationDelay: "0ms" }}>
          <span className="glass-chip px-3 py-1">
            <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: cat.color }} />
            <span className="microlabel !text-[9.5px]">{cat.label}</span>
          </span>
        </div>

        <h1 className="rise text-[34px] leading-tight font-semibold tracking-tight" style={{ animationDelay: "40ms" }}>
          {tool.name}
        </h1>
        <p className="rise mt-2 mb-8 max-w-xl text-[15px] leading-relaxed text-ink-2" style={{ animationDelay: "80ms" }}>
          {tool.description} Free, private, and instant — your files never leave your device.
        </p>

        <div className="rise" style={{ animationDelay: "130ms" }}>
          <DropZone
            onFiles={addFiles}
            accept={tool.accept}
            multiple={!tool.single}
            hint={tool.accept?.length ? `Drop ${tool.accept.slice(0, 4).map((a) => `.${a}`).join(" ")} files · Max 1 GB —` : undefined}
          />
        </div>

        <div className="rise mt-14 grid gap-3 sm:grid-cols-3" style={{ animationDelay: "200ms" }}>
          {[
            { n: "01", t: "Add your files", d: "Drag & drop, or browse from your device." },
            { n: "02", t: "Pick your settings", d: "Formats, quality, sizes — tuned per file." },
            { n: "03", t: "Download instantly", d: "Processed locally. Nothing is uploaded." },
          ].map((s) => (
            <div key={s.n} className="panel p-4">
              <div className="microlabel mb-2 !text-accent">{s.n}</div>
              <div className="text-[13.5px] font-medium text-ink">{s.t}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{s.d}</div>
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <div className="rise mt-12" style={{ animationDelay: "260ms" }}>
            <div className="microlabel mb-3">Related tools</div>
            <div className="flex flex-wrap gap-2">
              {related.map((t) => (
                <Link
                  key={t.slug}
                  to={`/${t.slug}`}
                  className="rounded-full border border-line-2 bg-panel px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-all duration-150 hover:border-line-3 hover:text-ink"
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rise mt-12 space-y-2" style={{ animationDelay: "300ms" }}>
          <div className="microlabel mb-3">FAQ</div>
          {[
            { q: "Are my files uploaded anywhere?", a: "No. This tool runs entirely in your browser using WebAssembly — files are processed on your device and never touch a server." },
            { q: "Is it free?", a: "Yes, up to 1 GB per file. Signing up unlocks larger files, batch priority and API access." },
            { q: "What formats are supported?", a: tool.accept?.length ? `This tool accepts ${tool.accept.map((a) => a.toUpperCase()).join(", ")} files.` : "Almost anything — check the picker for details." },
          ].map((f) => (
            <details key={f.q} className="group panel overflow-hidden !rounded-xl">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <Icon name="chevronDown" size={12} className="text-ink-3 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-ink-3">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    );
  }

  /* ── editor state: the two-panel layout from Samp.jpg ── */
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: cat.color }} />
          <h1 className="text-[15px] font-semibold tracking-tight">{tool.name}</h1>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_1fr]">
        <FileStack
          tool={tool}
          stack={stack}
          onReorder={setStack}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemove={removeFile}
          onRetry={(id) => run([id])}
          onDownloadFile={downloadFile}
          notes={notes}
          reorderable={isCombine && !running}
          running={running}
          allDone={allDone}
          ctaLabel={ctaLabel(tool, stack.length)}
          onRun={() => run()}
          onDownloadAll={downloadAll}
          onClear={clearAll}
          combined={combined}
          onDownloadCombined={() => combined && combined.forEach((o) => downloadBlob(o.blob, o.name))}
        >
          {!tool.single && <DropZone onFiles={addFiles} accept={tool.accept} multiple compact />}
        </FileStack>

        <section className="panel flex min-h-[480px] flex-col p-4" aria-label="Preview and options">
          <header className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="microlabel shrink-0">Editing:</span>
              {selected ? (
                <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-line-2 bg-panel-2 py-1 pr-1.5 pl-3">
                  <span className="truncate text-[12px] text-ink">{selected.file.name}</span>
                  <button
                    aria-label="Deselect"
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hi hover:text-ink"
                    onClick={() => setSelectedId(null)}
                  >
                    <Icon name="x" size={9} />
                  </button>
                </span>
              ) : (
                <span className="text-[12px] text-ink-3">nothing selected</span>
              )}
            </div>
            {allDone && (
              <button onClick={downloadAll} className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-ink transition-colors hover:text-ok">
                Save results
                <Icon name="check" size={13} className="text-ok" strokeWidth={2} />
              </button>
            )}
          </header>

          <PreviewPane sf={selected} onDownloadOutput={(o) => downloadBlob(o.blob, o.name)} />

          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="sliders" size={13} className="text-ink-3" />
              <span className="microlabel">{SURFACE_META[tool.surface].verb} settings</span>
              <span className="ml-auto text-[11px] text-ink-3">applies to all files</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-4 sm:col-span-2">
                <OptionsPanel tool={tool} opts={opts} set={setOpt} pageNote={pageNote} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
