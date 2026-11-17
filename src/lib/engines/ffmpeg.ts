import { baseName, extOf } from "../util";
import type { OutputFile } from "../types";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { FFFSType } from "@ffmpeg/ffmpeg";

/**
 * All video / audio / GIF tools run on ffmpeg.wasm — a single lazily-loaded
 * instance shared across jobs (jobs are already serialized by the tool page).
 */

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let threaded = false;
/**
 * Thread args for the current core. The single-thread build must stay at 1.
 * The multithreaded core hangs when asked for too many threads (8 stalled
 * indefinitely in testing; 2 and 4 completed), so cap it at 4.
 */
const threads = () => ["-threads", threaded ? String(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) : "1"];
const logTail: string[] = [];

async function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => {
        logTail.push(message);
        if (logTail.length > 40) logTail.shift();
      });
      // The cores live in /public — their package exports map hides them from bundlers.
      // When the page is cross-origin isolated (COOP/COEP headers) we can use the
      // multithreaded core, which encodes several times faster than the single-thread one.
      threaded = typeof SharedArrayBuffer !== "undefined" && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
        && !forceSingle;
      const t0 = performance.now();
      if (threaded) {
        await ff.load({
          coreURL: await toBlobURL("/ffmpeg-mt/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("/ffmpeg-mt/ffmpeg-core.wasm", "application/wasm"),
          workerURL: await toBlobURL("/ffmpeg-mt/ffmpeg-core.worker.js", "text/javascript"),
        });
      } else {
        await ff.load({
          coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
        });
      }
      console.info(`[ffmpeg] core loaded (${threaded ? "multi" : "single"}-thread) in ${Math.round(performance.now() - t0)}ms`);
      instance = ff;
      return ff;
    })();
  }
  return loading;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  webm: "video/webm",
  gif: "image/gif",
  apng: "image/apng",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

interface FFInput {
  /** Path ffmpeg should read. Mounted inputs live under MOUNT_DIR. */
  name: string;
  /** In-memory bytes (small inputs). Copied into the wasm heap. */
  data?: Uint8Array;
  /** Browser File mounted read-only via WORKERFS — never copied into the wasm heap,
   *  which matters because the threaded core has a fixed 1 GB of memory. */
  file?: File;
}

const MOUNT_DIR = "/mnt";

/** Abort an encode that has produced no progress for this long and retry single-threaded. */
const STALL_MS = 45_000;
let forceSingle = false;

async function runOnce(
  ff: FFmpeg,
  inputs: FFInput[],
  args: string[],
  outName: string,
  onProgress: (p: number) => void,
): Promise<Uint8Array> {
  const tw = performance.now();
  const mounted = inputs.filter((i) => i.file).map((i) => i.file!);
  if (mounted.length) {
    await ff.createDir(MOUNT_DIR).catch(() => {});
    await ff.mount(FFFSType.WORKERFS, { files: mounted }, MOUNT_DIR);
  }
  // writeFile transfers the buffer to the worker, so hand it a copy to keep the original usable for a retry.
  for (const inp of inputs) if (inp.data) await ff.writeFile(inp.name, inp.data.slice());
  const tx = performance.now();
  console.info(`[ffmpeg] wrote input in ${Math.round(tx - tw)}ms; exec ${args.join(" ")}`);

  let lastLogged = -1;
  let lastTick = performance.now();
  const onProg = ({ progress }: { progress: number }) => {
    lastTick = performance.now();
    if (progress > 0 && progress <= 1) onProgress(0.05 + progress * 0.9);
    const pct = Math.floor(progress * 10);
    if (pct !== lastLogged) { lastLogged = pct; console.info(`[ffmpeg] progress ${Math.round(progress * 100)}% at ${Math.round(performance.now() - tx)}ms`); }
  };
  const onLog = () => { lastTick = performance.now(); };
  ff.on("progress", onProg);
  ff.on("log", onLog);
  logTail.length = 0;

  let timer: ReturnType<typeof setInterval> | undefined;
  const stalled = new Promise<never>((_, rej) => {
    timer = setInterval(() => {
      if (performance.now() - lastTick > STALL_MS) rej(new StallError());
    }, 5_000);
  });
  try {
    const code = await Promise.race([ff.exec(args), stalled]);
    console.info(`[ffmpeg] exec finished code=${code} in ${Math.round(performance.now() - tx)}ms`);
    if (code !== 0) {
      console.warn("[ffmpeg] failed; last log lines:\n" + logTail.join("\n"));
      const all = logTail.join(" ");
      if (all.includes("Unknown encoder")) throw new Error("This output format isn't supported in-browser yet");
      if (/Cannot enlarge memory|out of memory|OOM|memory access out of bounds|Cannot allocate/i.test(all))
        throw new Error("Ran out of memory. Lower the resolution or try a shorter clip.");
      // Surface the first line that actually looks like an error rather than stream metadata.
      const line = logTail.find((l) => /error|failed|invalid|cannot|unable|not supported|no such/i.test(l)) ?? logTail.at(-1);
      throw new Error(`Conversion failed (${(line ?? `code ${code}`).trim().slice(0, 160)})`);
    }
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (!data.byteLength) throw new Error("Conversion produced an empty file");
    return data;
  } finally {
    clearInterval(timer);
    ff.off("progress", onProg);
    ff.off("log", onLog);
    for (const inp of inputs) if (inp.data) ff.deleteFile(inp.name).catch(() => {});
    if (mounted.length) await ff.unmount(MOUNT_DIR).catch(() => {});
    ff.deleteFile(outName).catch(() => {});
  }
}

class StallError extends Error {
  constructor() { super("Encoder stalled"); }
}

async function exec(
  inputs: FFInput[],
  args: string[],
  outName: string,
  onProgress: (p: number) => void,
): Promise<OutputFile> {
  let ff = await getFFmpeg();
  onProgress(0.02);
  let data: Uint8Array;
  try {
    data = await runOnce(ff, inputs, [...threads(), ...args], outName, onProgress);
  } catch (err) {
    // The multithreaded core occasionally wedges, and its heap is fixed at 1 GB so 4K
    // decodes can OOM. Either way: kill it and redo the job on the single-thread
    // core, which is slower but reliable and can grow its memory.
    const oom = /out of memory/i.test((err as Error).message ?? "");
    if (!threaded || !(err instanceof StallError || oom)) { onProgress(1); throw err; }
    console.warn(`[ffmpeg] ${oom ? "out of memory" : `no progress for ${STALL_MS / 1000}s`} — restarting on the single-thread core`);
    ff.terminate();
    instance = null;
    loading = null;
    forceSingle = true;
    ff = await getFFmpeg();
    onProgress(0.02);
    try {
      data = await runOnce(ff, inputs, [...threads(), ...args], outName, onProgress);
    } catch (err2) {
      onProgress(1);
      throw err2 instanceof StallError ? new Error("The encoder stopped responding. Try a lower resolution or a shorter clip.") : err2;
    }
  }
  onProgress(1);
  const ext = extOf(outName);
  return { name: outName, blob: new Blob([data as BlobPart], { type: MIME[ext] ?? "application/octet-stream" }) };
}

/** Inputs above this size are mounted (read straight from the File) instead of copied into
 *  the wasm heap. Copying is faster to read, but the threaded core has a fixed 1 GB heap that
 *  also has to hold decode buffers and the output. */
const MOUNT_THRESHOLD = 200 * 1024 * 1024;

async function inputOf(file: File): Promise<FFInput> {
  const name = `in.${extOf(file.name) || "bin"}`;
  if (file.size > MOUNT_THRESHOLD) {
    // A File wrapper over the same blob is zero-copy; it only renames the entry inside the mount.
    return { name: `${MOUNT_DIR}/${name}`, file: new File([file], name, { type: file.type }) };
  }
  return { name, data: new Uint8Array(await file.arrayBuffer()) };
}

const H264 = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
/** Compression-oriented encode: tuned for speed in wasm, still a big size win over camera footage. */
const H264_FAST = ["-c:v", "libx264", "-preset", "superfast", "-tune", "fastdecode", "-pix_fmt", "yuv420p"];
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

function gifChain(fps: number, width: number, colors: number): string {
  const scale = width > 0 ? `scale=${width}:-1:flags=lanczos,` : "";
  return `fps=${fps},${scale}split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
}

/* ── conversions ── */

export async function convertVideo(
  file: File,
  target: string,
  opts: { crf?: number; fps?: number; gifWidth?: number; colors?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}.${target}`;
  const crf = String(opts.crf ?? 23);
  let args: string[];
  switch (target) {
    case "gif":
      args = ["-i", inp.name, "-vf", gifChain(opts.fps ?? 15, opts.gifWidth ?? 480, opts.colors ?? 128), out];
      break;
    case "webm":
      args = ["-i", inp.name, "-c:v", "libvpx", "-crf", "30", "-b:v", "1.5M", "-c:a", "libvorbis", out];
      break;
    case "avi":
      args = ["-i", inp.name, "-c:v", "mpeg4", "-q:v", "6", "-c:a", "libmp3lame", "-b:a", "160k", out];
      break;
    default: // mp4 / mov / mkv
      args = ["-i", inp.name, ...H264, "-crf", crf, "-vf", EVEN, "-c:a", "aac", "-b:a", "128k",
        ...(target === "mkv" ? [] : ["-movflags", "faststart"]), out];
  }
  return [await exec([inp], args, out, onProgress)];
}

export async function convertAudio(
  file: File,
  target: string,
  opts: { bitrate?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}.${target}`;
  const br = `${opts.bitrate ?? 192}k`;
  const codec: Record<string, string[]> = {
    mp3: ["-c:a", "libmp3lame", "-b:a", br],
    wav: ["-c:a", "pcm_s16le"],
    ogg: ["-c:a", "libvorbis", "-q:a", "5"],
    m4a: ["-c:a", "aac", "-b:a", br],
    flac: ["-c:a", "flac"],
  };
  const args = ["-i", inp.name, "-vn", ...(codec[target] ?? codec.mp3), out];
  return [await exec([inp], args, out, onProgress)];
}

export async function gifToVideo(file: File, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}.mp4`;
  return [await exec([inp], ["-i", inp.name, ...H264, "-crf", "22", "-vf", EVEN, "-movflags", "faststart", "-an", out], out, onProgress)];
}

export async function gifToApng(file: File, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}.apng`;
  return [await exec([inp], ["-i", inp.name, "-f", "apng", "-plays", "0", out], out, onProgress)];
}

/** Stitch several images into one GIF (GIF Maker / Image to GIF). */
export async function framesToGif(
  files: File[],
  opts: { frameDelay?: number; gifWidth?: number; colors?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const { decodeImage } = await import("./image");
  // Normalize every frame onto the first frame's canvas so sizes always match.
  const first = await decodeImage(files[0]);
  const maxW = opts.gifWidth && opts.gifWidth > 0 ? opts.gifWidth : 640;
  const scale = Math.min(1, maxW / first.width);
  const W = Math.max(2, Math.round(first.width * scale));
  const H = Math.max(2, Math.round(first.height * scale));

  const inputs: FFInput[] = [];
  for (let i = 0; i < files.length; i++) {
    const img = i === 0 ? first : await decodeImage(files[i]);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const s = Math.min(W / img.width, H / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img.source as CanvasImageSource, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Frame encode failed"))), "image/png"),
    );
    inputs.push({ name: `frame${String(i).padStart(4, "0")}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress((i / files.length) * 0.3);
  }

  const fps = 1 / (opts.frameDelay ?? 0.7);
  const out = "animation.gif";
  const args = ["-framerate", fps.toFixed(4), "-i", "frame%04d.png", "-vf",
    `split[a][b];[a]palettegen=max_colors=${opts.colors ?? 192}[p];[b][p]paletteuse`, out];
  const result = await exec(inputs, args, out, (p) => onProgress(0.3 + p * 0.7));
  return [result];
}

/* ── edits ── */

export async function trimVideo(
  file: File,
  startSec: number,
  endSec: number,
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  if (endSec <= startSec) throw new Error("End time must be after the start time");
  const inp = await inputOf(file);
  const ext = extOf(file.name) || "mp4";
  const out = `${baseName(file.name)}-trim.${ext}`;
  const dur = (endSec - startSec).toFixed(3);
  try {
    // Stream copy first — instant, no quality loss (cuts land on keyframes).
    return [await exec([inp], ["-ss", startSec.toFixed(3), "-i", inp.name, "-t", dur, "-c", "copy", out], out, onProgress)];
  } catch {
    const inp2 = await inputOf(file);
    const out2 = `${baseName(file.name)}-trim.mp4`;
    return [await exec([inp2], ["-ss", startSec.toFixed(3), "-i", inp2.name, "-t", dur, ...H264, "-crf", "22", "-c:a", "aac", out2], out2, onProgress)];
  }
}

export async function cropVideo(
  file: File,
  m: { top: number; right: number; bottom: number; left: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}-crop.mp4`;
  const w = Math.max(0.05, 1 - (m.left + m.right) / 100).toFixed(4);
  const h = Math.max(0.05, 1 - (m.top + m.bottom) / 100).toFixed(4);
  const crop = `crop=trunc(iw*${w}/2)*2:trunc(ih*${h}/2)*2:iw*${(m.left / 100).toFixed(4)}:ih*${(m.top / 100).toFixed(4)}`;
  return [await exec([inp], ["-i", inp.name, "-vf", crop, ...H264, "-crf", "22", "-c:a", "aac", "-b:a", "128k", out], out, onProgress)];
}

/* ── compressors ── */

export async function compressVideo(
  file: File,
  opts: { crf?: number; vScale?: number; quality?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  // Hardware path first: the browser's decoder/encoder handles 4K HEVC in near
  // real time, which ffmpeg.wasm cannot. Any failure falls back to ffmpeg.
  try {
    const { compressVideoFast } = await import("./webcodecs");
    return await compressVideoFast(file, { quality: opts.quality ?? 60, vScale: opts.vScale }, onProgress);
  } catch (err) {
    console.warn("[webcodecs] unavailable, using ffmpeg:", (err as Error).message);
    onProgress(0);
  }
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}-compressed.mp4`;
  const s = (opts.vScale ?? 100) / 100;
  const vf = s < 1 ? `scale=trunc(iw*${s.toFixed(3)}/2)*2:-2` : EVEN;
  return [await exec([inp], ["-i", inp.name, ...H264_FAST, "-crf", String(opts.crf ?? 28), "-vf", vf, "-c:a", "aac", "-b:a", "96k", "-movflags", "faststart", out], out, onProgress)];
}

export async function compressMp3(file: File, bitrate: number, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}-compressed.mp3`;
  return [await exec([inp], ["-i", inp.name, "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, out], out, onProgress)];
}

export async function compressWav(file: File, rate: number, onProgress: (p: number) => void): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}-compressed.wav`;
  return [await exec([inp], ["-i", inp.name, "-c:a", "pcm_s16le", "-ar", String(rate), out], out, onProgress)];
}

export async function compressGif(
  file: File,
  opts: { fps?: number; gifWidth?: number; colors?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  const inp = await inputOf(file);
  const out = `${baseName(file.name)}-compressed.gif`;
  return [await exec([inp], ["-i", inp.name, "-vf", gifChain(opts.fps ?? 12, opts.gifWidth ?? 0, opts.colors ?? 96), out], out, onProgress)];
}
