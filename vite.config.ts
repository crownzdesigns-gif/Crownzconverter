import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Cross-origin isolation unlocks SharedArrayBuffer → multithreaded ffmpeg core.
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    // ffmpeg.wasm spawns its own module worker; pre-bundling breaks the URL wiring.
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
