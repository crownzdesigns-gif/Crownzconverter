import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { TOOLS } from "./lib/registry";
import type { ToolDef } from "./lib/types";
import { claimFiles } from "./lib/transfer";
import { NavBar } from "./components/NavBar";
import { ParticleField } from "./components/ParticleField";
import { CommandPalette } from "./components/CommandPalette";
import { ToastHost } from "./components/toast";
import { Home } from "./pages/Home";
import { ToolPage } from "./pages/ToolPage";
import { CropImagePage } from "./pages/CropImagePage";
import { ColorPickerPage } from "./pages/ColorPickerPage";
import { OrganizePdfPage } from "./pages/OrganizePdfPage";
import { TimeConverterPage, UnitConverterPage } from "./pages/MiscConverters";

function ToolRoute({ tool }: { tool: ToolDef }) {
  // Claim any files stashed by the homepage drop zone exactly once per mount.
  const [initialFiles] = useState(claimFiles);

  switch (tool.engine) {
    case "image-crop":
      return <CropImagePage tool={tool} initialFiles={initialFiles} />;
    case "image-color-picker":
      return <ColorPickerPage tool={tool} initialFiles={initialFiles} />;
    case "pdf-organize":
      return <OrganizePdfPage tool={tool} initialFiles={initialFiles} />;
    case "unit":
      return <UnitConverterPage tool={tool} />;
    case "time":
      return <TimeConverterPage tool={tool} />;
    default:
      return <ToolPage tool={tool} initialFiles={initialFiles} />;
  }
}

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <img src="/brand/logo-128.png" alt="" width={20} height={20} className="rounded-[30%]" draggable={false} />
          <span className="text-[13px] font-medium text-ink-2">CrownzConverter</span>
        </div>
        <p className="text-[12px] text-ink-3">Files are processed in your browser — they never leave your device.</p>
        <span className="text-[12px] text-ink-3">© Created by Crownzdesigns 2026</span>
      </div>
    </footer>
  );
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <ParticleField />
      <ScrollReset />
      <NavBar onOpenPalette={() => setPaletteOpen(true)} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          {TOOLS.map((tool) => (
            <Route key={tool.slug} path={`/${tool.slug}`} element={<ToolRoute key={tool.slug} tool={tool} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastHost />
    </div>
  );
}
