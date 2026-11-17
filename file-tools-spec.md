# File Tools — Product & Technical Spec

A web-based file utility platform for converting, compressing, and editing files. Users upload a file, pick an operation, and download the result. Feature set is organized into three product surfaces: **Converters**, **Compressors**, and **Tools**.

---

## 1. Product Overview

**One-liner:** Convert, compress, and edit any file — video, audio, image, PDF, or GIF — in the browser.

**Core user flow:**
1. User lands on a tool page (or the homepage)
2. Uploads file(s) via drag-and-drop or "Choose Files" (with dropdown for URL / Drive / Dropbox sources)
3. Configures options (target format, quality, dimensions, etc.)
4. Processing runs (client-side or server-side depending on file type/size)
5. User downloads the output

**Free tier constraint:** Max file size 1GB. Sign-up unlocks larger files.

---

## 2. Feature Set

### 2.1 Converters

#### Video & Audio
- Video Converter (universal, any-to-any)
- Audio Converter (universal)
- MP3 Converter
- MP4 to MP3
- Video to MP3
- MP4 Converter
- MOV to MP4
- MP3 to OGG

#### Image
- Image Converter (universal)
- WEBP to PNG
- JFIF to PNG
- PNG to SVG
- HEIC to JPG
- HEIC to PNG
- WEBP to JPG
- SVG Converter

#### PDF & Documents
- PDF Converter (universal)
- Document Converter
- Ebook Converter
- PDF to Word
- PDF to JPG
- PDF to EPUB
- EPUB to PDF
- HEIC to PDF
- DOCX to PDF
- JPG to PDF

#### GIF
- Video to GIF
- MP4 to GIF
- WEBM to GIF
- APNG to GIF
- GIF to MP4
- GIF to APNG
- Image to GIF
- MOV to GIF
- AVI to GIF

#### Others
- Unit Converter
- Time Converter
- Archive Converter (ZIP, RAR, 7Z, TAR, etc.)

### 2.2 Compressors

#### Video & Audio
- Video Compressor
- MP3 Compressor
- WAV Compressor

#### Image
- Image Compressor (universal)
- JPEG Compressor
- PNG Compressor

#### PDF & Documents
- PDF Compressor

#### GIF
- GIF Compressor

**Compressor options (per tool):**
- Target file size (e.g. "compress to 10MB")
- Quality percentage slider
- Resolution downscale (video/image)
- Bitrate control (audio/video)
- Compression method: lossy vs lossless where applicable

### 2.3 Tools

#### Video Tools
- Crop Video
- Trim Video

#### Image Tools
- GIF Maker
- Resize Image
- Crop Image
- Color Picker
- Rotate Image
- Flip Image
- Image Enlarger (upscaler)

#### PDF Tools
- PDF Merge
- PDF Split
- Flatten PDF
- Resize PDF
- Unlock PDF
- Rotate PDF
- Protect PDF (password)
- Crop PDF
- Organize PDF (reorder pages)
- Extract Image from PDF
- PDF Page Remover
- Extract Pages from PDF

---

## 3. Architecture

### 3.1 High-level approach

Two processing strategies, chosen per tool:

| Strategy | Where | Best for | Why |
|---|---|---|---|
| **Client-side (WASM)** | Browser | Images, small PDFs, unit/time converters, crop/rotate/flip | Zero server cost, instant, private (file never leaves the device) |
| **Server-side (workers)** | Backend queue | Video, audio, large PDFs, archives, ebooks, upscaling | Heavy CPU, needs FFmpeg/LibreOffice/Ghostscript |

Start client-side wherever possible — it's cheaper and a strong privacy selling point.

### 3.2 Suggested stack

**Frontend**
- Next.js (React) + Tailwind
- File handling: drag-and-drop upload zone, chunked/resumable uploads (tus or Uppy) for large video files
- Client-side processing libraries:
  - `ffmpeg.wasm` — video/audio convert, compress, trim, GIF conversion (works up to ~2GB in-browser, slower than native)
  - `pdf-lib` — merge, split, rotate, crop, organize, page remove, protect
  - `pdf.js` — render PDF to images (PDF to JPG)
  - Canvas API / `browser-image-compression` — image compress, resize, crop, rotate, flip, format conversion
  - `heic2any` — HEIC to JPG/PNG
  - `gif.js` or `gifski` (WASM) — GIF maker, image to GIF

**Backend (for heavy jobs)**
- Node.js (or Python) API
- Job queue: BullMQ + Redis (or a serverless queue)
- Workers running:
  - **FFmpeg** — all video/audio conversion and compression
  - **Ghostscript** — PDF compression, flattening
  - **LibreOffice headless** — DOCX to PDF, document conversion
  - **Calibre** — ebook conversion (EPUB, MOBI, PDF)
  - **ImageMagick / Sharp** — server-side image ops, PNG to SVG (via potrace)
  - **7-Zip** — archive conversion
  - **Real-ESRGAN or similar** — AI image enlarger
- Storage: S3-compatible object storage with auto-delete after 1–4 hours (privacy + cost)
- CDN for downloads

**Infra notes**
- Files auto-delete after processing window — state this prominently (trust signal)
- Rate limit anonymous users; auth unlocks higher limits
- Progress via WebSocket or polling for server jobs

### 3.3 URL structure (SEO-critical)

Each tool gets its own landing page — this is how these products get traffic:

```
/video-converter
/mp4-to-mp3
/heic-to-jpg
/pdf-compressor
/compress-pdf-to-100kb   (long-tail variants)
/merge-pdf
/crop-video
```

Each page: H1 with the tool name, upload zone above the fold, how-it-works steps, FAQ (schema markup), internal links to related tools.

---

## 4. UI Requirements

### Navigation
- Mega-menu with three top-level items: **Convert**, **Compress**, **Tools**
- Each opens a columned dropdown grouped by category (Video & Audio / Image / PDF & Documents / GIF / Others), matching the reference layout
- Category headers with icons; plain-text tool links beneath

### Tool page
- Dashed-border drop zone, centered
- Primary "Choose Files" button (with split dropdown: from URL, Google Drive, Dropbox)
- "Max file size 1GB. Sign Up for more" microcopy
- Terms of Use link
- After upload: file list with per-file settings gear, "Convert/Compress" CTA, progress bars, download-all when done

### States
- Idle → Uploading (progress %) → Queued → Processing → Done (download) → Error (retry)
- Batch support: multiple files per job, ZIP download for batches

---

## 5. Monetization

- **Free:** 1GB max file size, limited concurrent jobs, ads optional
- **Paid tiers:** larger files (5–25GB), batch priority, no queue wait, API access, no ads
- **API product:** developers pay per conversion minute/GB

---

## 6. Build Phases

### Phase 1 — MVP (client-side only)
- Image Converter + Compressor (JPEG, PNG, WEBP, HEIC)
- Resize / Crop / Rotate / Flip Image
- PDF Merge, Split, Rotate, Page Remover (pdf-lib)
- Unit + Time Converter
- 15–20 SEO landing pages

### Phase 2 — Server workers
- Video/Audio Converter + Compressor (FFmpeg)
- Video to GIF and all GIF tools
- PDF Compressor (Ghostscript), PDF to Word, DOCX to PDF
- Trim/Crop Video
- Auth + file size tiers

### Phase 3 — Long tail
- Ebook Converter, Archive Converter
- Image Enlarger (AI upscale)
- Protect/Unlock/Flatten PDF
- API access, Drive/Dropbox import
- Remaining format-pair landing pages

---

## 7. Open Decisions

- [ ] Client-side-first vs server-first for video (ffmpeg.wasm is free but slow on large files)
- [ ] Auth provider and pricing tiers
- [ ] Whether to build "Unlock PDF" (legal review: only for files the user owns/has the password to)
- [ ] Ads vs clean freemium
- [ ] Brand name + domain
