import type { OutputFile } from "../types";
import { baseName } from "../util";

/**
 * Hardware video compression via WebCodecs (through mediabunny for demux/mux).
 * The browser's own decoder and encoder handle 4K HEVC in roughly real time,
 * whereas ffmpeg.wasm decodes 4K HEVC at ~2 fps. Throws when unsupported so
 * the caller can fall back to ffmpeg.
 */

export function webCodecsAvailable(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined" && typeof AudioEncoder !== "undefined";
}

/** Map the UI quality (1–100) to bits per pixel per frame for H.264. */
function bitsPerPixel(quality: number): number {
  return 0.025 + (Math.max(1, Math.min(100, quality)) / 100) * 0.1;
}

export async function compressVideoFast(
  file: File,
  opts: { quality: number; vScale?: number },
  onProgress: (p: number) => void,
): Promise<OutputFile[]> {
  if (!webCodecsAvailable()) throw new Error("WebCodecs unavailable");
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat } = await import("mediabunny");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track");
  if (!(await track.canDecode())) throw new Error("Browser cannot decode this codec");

  const s = Math.max(0.05, Math.min(1, (opts.vScale ?? 100) / 100));
  const width = Math.max(2, Math.round((track.displayWidth * s) / 2) * 2);
  const height = Math.max(2, Math.round((track.displayHeight * s) / 2) * 2);
  const stats = await track.computePacketStats(200).catch(() => null);
  const fps = stats?.averagePacketRate && stats.averagePacketRate > 1 ? Math.min(120, stats.averagePacketRate) : 30;
  const bitrate = Math.round(width * height * fps * bitsPerPixel(opts.quality));

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const t0 = performance.now();
  const conversion = await Conversion.init({
    input,
    output,
    video: { codec: "avc", width, height, fit: "fill", bitrate, hardwareAcceleration: "prefer-hardware", forceTranscode: true },
    audio: { codec: "aac", bitrate: 128_000 },
    showWarnings: false,
  });
  if (!conversion.isValid) {
    throw new Error(`WebCodecs conversion invalid: ${conversion.discardedTracks.map((d) => d.reason).join(", ") || "unknown"}`);
  }
  console.info(`[webcodecs] ${track.codec} ${track.displayWidth}x${track.displayHeight} → avc ${width}x${height} @ ${Math.round(bitrate / 1e6)} Mbps`);
  conversion.onProgress = (p) => onProgress(0.02 + p * 0.96);
  await conversion.execute();
  const buf = target.buffer;
  if (!buf || !buf.byteLength) throw new Error("WebCodecs produced an empty file");
  console.info(`[webcodecs] done in ${Math.round(performance.now() - t0)}ms, ${Math.round(buf.byteLength / 1e6)} MB`);
  onProgress(1);
  return [{ name: `${baseName(file.name)}-compressed.mp4`, blob: new Blob([buf], { type: "video/mp4" }) }];
}
