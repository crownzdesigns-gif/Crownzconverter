import type { Category, Surface, ToolDef } from "./types";

const IMG = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "jfif", "heic", "heif", "svg"];
const IMG_RASTER = ["jpg", "jpeg", "png", "webp", "bmp", "jfif", "avif"];

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  video: { label: "Video & Audio", color: "var(--color-cat-video)" },
  image: { label: "Image", color: "var(--color-cat-image)" },
  pdf: { label: "PDF & Documents", color: "var(--color-cat-pdf)" },
  gif: { label: "GIF", color: "var(--color-cat-gif)" },
  other: { label: "Others", color: "var(--color-cat-other)" },
};

export const SURFACE_META: Record<Surface, { label: string; verb: string }> = {
  convert: { label: "Convert", verb: "Convert" },
  compress: { label: "Compress", verb: "Compress" },
  tools: { label: "Tools", verb: "Apply" },
};

export const TOOLS: ToolDef[] = [
  /* ═══════════ CONVERTERS — Video & Audio (ffmpeg.wasm) ═══════════ */
  { slug: "video-converter", name: "Video Converter", description: "Convert any video to MP4, WEBM, MOV, AVI and more.", surface: "convert", category: "video", engine: "ffmpeg-video", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"] },
  { slug: "audio-converter", name: "Audio Converter", description: "Convert audio between MP3, WAV, OGG, FLAC and more.", surface: "convert", category: "video", engine: "ffmpeg-audio", accept: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"] },
  { slug: "mp3-converter", name: "MP3 Converter", description: "Convert any audio file to MP3.", surface: "convert", category: "video", engine: "ffmpeg-audio", accept: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "mp4", "mov", "webm", "mkv"], fixedTarget: "mp3" },
  { slug: "mp4-to-mp3", name: "MP4 to MP3", description: "Extract MP3 audio from MP4 video.", surface: "convert", category: "video", engine: "ffmpeg-extract", accept: ["mp4", "m4v"], fixedTarget: "mp3" },
  { slug: "video-to-mp3", name: "Video to MP3", description: "Extract the audio track from any video as MP3.", surface: "convert", category: "video", engine: "ffmpeg-extract", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"], fixedTarget: "mp3" },
  { slug: "mp4-converter", name: "MP4 Converter", description: "Convert any video to MP4.", surface: "convert", category: "video", engine: "ffmpeg-video", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"], fixedTarget: "mp4" },
  { slug: "mov-to-mp4", name: "MOV to MP4", description: "Convert QuickTime MOV videos to MP4.", surface: "convert", category: "video", engine: "ffmpeg-video", accept: ["mov"], fixedTarget: "mp4" },
  { slug: "mp3-to-ogg", name: "MP3 to OGG", description: "Convert MP3 audio to OGG Vorbis.", surface: "convert", category: "video", engine: "ffmpeg-audio", accept: ["mp3"], fixedTarget: "ogg" },

  /* ═══════════ CONVERTERS — Image (client-side, live) ═══════════ */
  { slug: "image-converter", name: "Image Converter", description: "Convert images between PNG, JPG, WEBP and more — right in your browser.", surface: "convert", category: "image", engine: "image-convert", accept: IMG },
  { slug: "webp-to-png", name: "WEBP to PNG", description: "Convert WEBP images to PNG.", surface: "convert", category: "image", engine: "image-convert", accept: ["webp"], fixedSource: "webp", fixedTarget: "png" },
  { slug: "jfif-to-png", name: "JFIF to PNG", description: "Convert JFIF images to PNG.", surface: "convert", category: "image", engine: "image-convert", accept: ["jfif", "jpg", "jpeg"], fixedSource: "jfif", fixedTarget: "png" },
  { slug: "png-to-svg", name: "PNG to SVG", description: "Trace PNG images into scalable vector graphics.", surface: "convert", category: "image", engine: "trace-svg", accept: ["png", "jpg", "jpeg", "webp", "bmp"] },
  { slug: "heic-to-jpg", name: "HEIC to JPG", description: "Convert iPhone HEIC photos to JPG.", surface: "convert", category: "image", engine: "image-convert", accept: ["heic", "heif"], fixedSource: "heic", fixedTarget: "jpg" },
  { slug: "heic-to-png", name: "HEIC to PNG", description: "Convert iPhone HEIC photos to PNG.", surface: "convert", category: "image", engine: "image-convert", accept: ["heic", "heif"], fixedSource: "heic", fixedTarget: "png" },
  { slug: "webp-to-jpg", name: "WEBP to JPG", description: "Convert WEBP images to JPG.", surface: "convert", category: "image", engine: "image-convert", accept: ["webp"], fixedSource: "webp", fixedTarget: "jpg" },
  { slug: "svg-converter", name: "SVG Converter", description: "Rasterize SVG vectors to PNG, JPG or WEBP.", surface: "convert", category: "image", engine: "image-convert", accept: ["svg"], fixedSource: "svg" },

  /* ═══════════ CONVERTERS — PDF & Documents ═══════════ */
  { slug: "pdf-converter", name: "PDF Converter", description: "Convert PDFs to images and images to PDF.", surface: "convert", category: "pdf", engine: "pdf-render", accept: ["pdf"] },
  { slug: "document-converter", name: "Document Converter", description: "Convert DOCX, HTML and TXT documents.", surface: "convert", category: "pdf", engine: "doc-convert", accept: ["docx", "txt", "html", "htm", "md"] },
  { slug: "ebook-converter", name: "Ebook Converter", description: "Convert between EPUB, PDF and TXT.", surface: "convert", category: "pdf", engine: "ebook", accept: ["epub", "pdf", "txt"] },
  { slug: "pdf-to-word", name: "PDF to Word", description: "Convert PDF documents to editable DOCX.", surface: "convert", category: "pdf", engine: "pdf-word", accept: ["pdf"] },
  { slug: "pdf-to-jpg", name: "PDF to JPG", description: "Render each PDF page as a high-quality JPG.", surface: "convert", category: "pdf", engine: "pdf-render", accept: ["pdf"] },
  { slug: "pdf-to-epub", name: "PDF to EPUB", description: "Convert PDF documents to EPUB ebooks.", surface: "convert", category: "pdf", engine: "ebook", accept: ["pdf"], fixedTarget: "epub" },
  { slug: "epub-to-pdf", name: "EPUB to PDF", description: "Convert EPUB ebooks to PDF.", surface: "convert", category: "pdf", engine: "ebook", accept: ["epub"], fixedTarget: "pdf" },
  { slug: "heic-to-pdf", name: "HEIC to PDF", description: "Turn iPhone HEIC photos into a PDF.", surface: "convert", category: "pdf", engine: "images-to-pdf", accept: ["heic", "heif"], fixedSource: "heic" },
  { slug: "docx-to-pdf", name: "DOCX to PDF", description: "Convert Word documents to PDF.", surface: "convert", category: "pdf", engine: "doc-convert", accept: ["docx"], fixedTarget: "pdf" },
  { slug: "jpg-to-pdf", name: "JPG to PDF", description: "Combine JPG images into a single PDF.", surface: "convert", category: "pdf", engine: "images-to-pdf", accept: IMG },

  /* ═══════════ CONVERTERS — GIF (ffmpeg.wasm) ═══════════ */
  { slug: "video-to-gif", name: "Video to GIF", description: "Turn video clips into animated GIFs.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"] },
  { slug: "mp4-to-gif", name: "MP4 to GIF", description: "Convert MP4 clips to animated GIFs.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["mp4", "m4v"] },
  { slug: "webm-to-gif", name: "WEBM to GIF", description: "Convert WEBM clips to animated GIFs.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["webm"] },
  { slug: "apng-to-gif", name: "APNG to GIF", description: "Convert animated PNGs to GIF.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["png", "apng"] },
  { slug: "gif-to-mp4", name: "GIF to MP4", description: "Convert animated GIFs to lightweight MP4s.", surface: "convert", category: "gif", engine: "gif-to-video", accept: ["gif"] },
  { slug: "gif-to-apng", name: "GIF to APNG", description: "Convert GIFs to animated PNG.", surface: "convert", category: "gif", engine: "gif-to-apng", accept: ["gif"] },
  { slug: "image-to-gif", name: "Image to GIF", description: "Stitch images into an animated GIF.", surface: "convert", category: "gif", engine: "frames-to-gif", accept: ["jpg", "jpeg", "png", "webp", "bmp"] },
  { slug: "mov-to-gif", name: "MOV to GIF", description: "Convert MOV clips to animated GIFs.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["mov"] },
  { slug: "avi-to-gif", name: "AVI to GIF", description: "Convert AVI clips to animated GIFs.", surface: "convert", category: "gif", engine: "ffmpeg-gif", accept: ["avi"] },

  /* ═══════════ CONVERTERS — Others ═══════════ */
  { slug: "unit-converter", name: "Unit Converter", description: "Convert length, mass, temperature, data and more.", surface: "convert", category: "other", engine: "unit" },
  { slug: "time-converter", name: "Time Converter", description: "Convert durations and Unix timestamps.", surface: "convert", category: "other", engine: "time" },
  { slug: "archive-converter", name: "Archive Converter", description: "Convert between ZIP, TAR and TAR.GZ.", surface: "convert", category: "other", engine: "archive", accept: ["zip", "tar", "gz", "tgz"] },

  /* ═══════════ COMPRESSORS ═══════════ */
  { slug: "video-compressor", name: "Video Compressor", description: "Shrink videos with quality and resolution control.", surface: "compress", category: "video", engine: "compress-video", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"] },
  { slug: "mp3-compressor", name: "MP3 Compressor", description: "Reduce MP3 file size with bitrate control.", surface: "compress", category: "video", engine: "compress-audio", accept: ["mp3"] },
  { slug: "wav-compressor", name: "WAV Compressor", description: "Compress WAV audio files.", surface: "compress", category: "video", engine: "compress-wav", accept: ["wav"] },
  { slug: "image-compressor", name: "Image Compressor", description: "Compress JPG, PNG and WEBP — with a target file size.", surface: "compress", category: "image", engine: "image-compress", accept: IMG_RASTER },
  { slug: "jpeg-compressor", name: "JPEG Compressor", description: "Compress JPEG photos without visible quality loss.", surface: "compress", category: "image", engine: "image-compress", accept: ["jpg", "jpeg", "jfif"], fixedSource: "jpeg" },
  { slug: "png-compressor", name: "PNG Compressor", description: "Shrink PNG images.", surface: "compress", category: "image", engine: "image-compress", accept: ["png"], fixedSource: "png" },
  { slug: "pdf-compressor", name: "PDF Compressor", description: "Reduce PDF file size for sharing.", surface: "compress", category: "pdf", engine: "pdf-compress", accept: ["pdf"] },
  { slug: "gif-compressor", name: "GIF Compressor", description: "Shrink animated GIFs.", surface: "compress", category: "gif", engine: "compress-gif", accept: ["gif"] },

  /* ═══════════ TOOLS — Video ═══════════ */
  { slug: "crop-video", name: "Crop Video", description: "Crop video edges by precise margins.", surface: "tools", category: "video", engine: "ffmpeg-crop", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"] },
  { slug: "trim-video", name: "Trim Video", description: "Cut a clip out of a longer video.", surface: "tools", category: "video", engine: "ffmpeg-trim", accept: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"] },

  /* ═══════════ TOOLS — Image ═══════════ */
  { slug: "gif-maker", name: "GIF Maker", description: "Build an animated GIF from your images.", surface: "tools", category: "gif", engine: "frames-to-gif", accept: ["jpg", "jpeg", "png", "webp", "bmp"] },
  { slug: "resize-image", name: "Resize Image", description: "Resize images to exact pixels or a percentage.", surface: "tools", category: "image", engine: "image-resize", accept: IMG },
  { slug: "crop-image", name: "Crop Image", description: "Crop images with a precise, draggable selection.", surface: "tools", category: "image", engine: "image-crop", accept: IMG, single: true },
  { slug: "color-picker", name: "Color Picker", description: "Pick exact colors from any image.", surface: "tools", category: "image", engine: "image-color-picker", accept: IMG, single: true },
  { slug: "rotate-image", name: "Rotate Image", description: "Rotate images by 90° steps.", surface: "tools", category: "image", engine: "image-rotate", accept: IMG },
  { slug: "flip-image", name: "Flip Image", description: "Mirror images horizontally or vertically.", surface: "tools", category: "image", engine: "image-flip", accept: IMG },
  { slug: "image-enlarger", name: "Image Enlarger", description: "Upscale images 2× or 4× with edge sharpening.", surface: "tools", category: "image", engine: "upscale", accept: ["jpg", "jpeg", "png", "webp", "bmp", "jfif"] },

  /* ═══════════ TOOLS — PDF ═══════════ */
  { slug: "pdf-merge", name: "PDF Merge", description: "Combine PDFs into one — drag to set the order.", surface: "tools", category: "pdf", engine: "pdf-merge", accept: ["pdf"] },
  { slug: "pdf-split", name: "PDF Split", description: "Split a PDF into one file per page.", surface: "tools", category: "pdf", engine: "pdf-split", accept: ["pdf"] },
  { slug: "flatten-pdf", name: "Flatten PDF", description: "Flatten form fields into static page content.", surface: "tools", category: "pdf", engine: "pdf-flatten", accept: ["pdf"] },
  { slug: "resize-pdf", name: "Resize PDF", description: "Scale PDF pages up or down.", surface: "tools", category: "pdf", engine: "pdf-resize", accept: ["pdf"] },
  { slug: "unlock-pdf", name: "Unlock PDF", description: "Remove restrictions from PDFs you own.", surface: "tools", category: "pdf", engine: "pdf-unlock", accept: ["pdf"] },
  { slug: "rotate-pdf", name: "Rotate PDF", description: "Rotate all or selected PDF pages.", surface: "tools", category: "pdf", engine: "pdf-rotate", accept: ["pdf"] },
  { slug: "protect-pdf", name: "Protect PDF", description: "Password-protect a PDF.", surface: "tools", category: "pdf", engine: "pdf-protect", accept: ["pdf"] },
  { slug: "crop-pdf", name: "Crop PDF", description: "Trim margins from every page.", surface: "tools", category: "pdf", engine: "pdf-crop", accept: ["pdf"] },
  { slug: "organize-pdf", name: "Organize PDF", description: "Reorder and remove pages visually.", surface: "tools", category: "pdf", engine: "pdf-organize", accept: ["pdf"], single: true },
  { slug: "extract-image-from-pdf", name: "Extract Image from PDF", description: "Save PDF pages as images.", surface: "tools", category: "pdf", engine: "pdf-render", accept: ["pdf"] },
  { slug: "pdf-page-remover", name: "PDF Page Remover", description: "Delete pages from a PDF.", surface: "tools", category: "pdf", engine: "pdf-remove", accept: ["pdf"] },
  { slug: "extract-pages-from-pdf", name: "Extract Pages from PDF", description: "Pull selected pages into a new PDF.", surface: "tools", category: "pdf", engine: "pdf-extract", accept: ["pdf"] },
];

export const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));

export function toolsFor(surface: Surface): Map<Category, ToolDef[]> {
  const out = new Map<Category, ToolDef[]>();
  for (const cat of ["video", "image", "pdf", "gif", "other"] as Category[]) {
    const list = TOOLS.filter((t) => t.surface === surface && t.category === cat);
    if (list.length) out.set(cat, list);
  }
  return out;
}

export const LIVE_TOOLS = TOOLS.filter((t) => !t.phase);

/** Tools that can act on a given file extension, used by the homepage router. */
export function toolsForExtension(ext: string): ToolDef[] {
  return LIVE_TOOLS.filter(
    (t) => t.accept?.includes(ext) && t.engine !== "unit" && t.engine !== "time",
  );
}
