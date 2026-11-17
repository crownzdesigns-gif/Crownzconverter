export type Surface = "convert" | "compress" | "tools";

export type Category = "video" | "image" | "pdf" | "gif" | "other";

/** Which client-side pipeline runs this tool. */
export type Engine =
  | "image-convert"
  | "image-compress"
  | "image-resize"
  | "image-rotate"
  | "image-flip"
  | "image-crop"
  | "image-color-picker"
  | "images-to-pdf"
  | "pdf-merge"
  | "pdf-split"
  | "pdf-extract"
  | "pdf-remove"
  | "pdf-rotate"
  | "pdf-flatten"
  | "pdf-resize"
  | "pdf-crop"
  | "pdf-organize"
  | "pdf-render"
  | "pdf-compress"
  | "pdf-unlock"
  | "pdf-protect"
  | "pdf-word"
  | "ffmpeg-video"
  | "ffmpeg-audio"
  | "ffmpeg-extract"
  | "ffmpeg-gif"
  | "gif-to-video"
  | "gif-to-apng"
  | "frames-to-gif"
  | "ffmpeg-trim"
  | "ffmpeg-crop"
  | "compress-video"
  | "compress-audio"
  | "compress-wav"
  | "compress-gif"
  | "trace-svg"
  | "upscale"
  | "doc-convert"
  | "ebook"
  | "archive"
  | "unit"
  | "time"
  | "server";

export interface ToolDef {
  slug: string;
  name: string;
  /** Short label used in menus when the full name is redundant. */
  menuLabel?: string;
  description: string;
  surface: Surface;
  category: Category;
  engine: Engine;
  /** Accepted file extensions (lowercase, no dot). Empty = any. */
  accept?: string[];
  /** Force output format for preset converters (e.g. webp-to-png). */
  fixedTarget?: string;
  /** Restrict source for preset converters, used for messaging. */
  fixedSource?: string;
  /** Allows multiple files per job. Default true. */
  single?: boolean;
  /** Build phase if not yet live client-side. */
  phase?: 2 | 3;
}

export type JobStatus = "idle" | "processing" | "done" | "error";

export interface OutputFile {
  name: string;
  blob: Blob;
}

export interface StackFile {
  id: string;
  file: File;
  status: JobStatus;
  /** 0..1, or -1 for indeterminate */
  progress: number;
  outputs: OutputFile[];
  error?: string;
  previewUrl?: string;
}
