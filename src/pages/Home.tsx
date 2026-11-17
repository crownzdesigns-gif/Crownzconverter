import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CATEGORY_META, LIVE_TOOLS, SURFACE_META, TOOLS, toolsForExtension } from "../lib/registry";
import type { Surface, ToolDef } from "../lib/types";
import { stashFiles } from "../lib/transfer";
import { extOf, formatBytes } from "../lib/util";
import { DropZone } from "../components/DropZone";
import { FolderShelf } from "../components/FolderShelf";
import { Icon, type IconName } from "../components/Icon";
import { toast } from "../components/toast";

const SURFACE_CARDS: Array<{ surface: Surface; icon: IconName; blurb: string }> = [
  { surface: "convert", icon: "convert", blurb: "Any format to any format — video, audio, image, PDF and GIF." },
  { surface: "compress", icon: "compress", blurb: "Hit exact target sizes without wrecking quality." },
  { surface: "tools", icon: "sliders", blurb: "Crop, trim, merge, split, organize — precision edits." },
];

function ChooserSheet({
  files,
  tools,
  onClose,
}: {
  files: File[];
  tools: ToolDef[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const total = files.reduce((a, f) => a + f.size, 0);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10, transition: { duration: 0.13 } }}
        transition={{ type: "spring", stiffness: 460, damping: 34 }}
        className="panel mx-auto mt-[14vh] w-[min(520px,calc(100vw-32px))] overflow-hidden !rounded-2xl shadow-[0_32px_80px_rgb(0_0_0/0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose an operation"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="microlabel mb-1">
            {files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(total)}
          </div>
          <div className="text-[15px] font-medium">What should we do with {files.length > 1 ? "them" : "it"}?</div>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {tools.map((t, i) => (
            <motion.button
              key={t.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.03, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => {
                stashFiles(files);
                onClose();
                navigate(`/${t.slug}`);
              }}
              className="group flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors duration-100 hover:bg-hi"
            >
              <span className="h-[7px] w-[7px] shrink-0 rounded-[2.5px]" style={{ background: CATEGORY_META[t.category].color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-ink">{t.name}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{t.description}</span>
              </span>
              <Icon name="arrowRight" size={13} className="shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Home() {
  const [chooser, setChooser] = useState<{ files: File[]; tools: ToolDef[] } | null>(null);

  useEffect(() => {
    document.title = "CrownzConverter — Convert, Compress & Edit Files";
  }, []);

  const onFiles = (files: File[]) => {
    const exts = [...new Set(files.map((f) => extOf(f.name)))];
    const tools = [...new Map(exts.flatMap(toolsForExtension).map((t) => [t.slug, t])).values()];
    if (!tools.length) {
      toast(`No live tool handles .${exts[0] || "that"} yet — video & audio land in Phase 2`, "err");
      return;
    }
    setChooser({ files, tools: tools.slice(0, 8) });
  };

  const counts = useMemo(() => {
    const m = { convert: 0, compress: 0, tools: 0 } as Record<Surface, number>;
    for (const t of TOOLS) m[t.surface]++;
    return m;
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-20">
      {/* ── hero ── */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="rise microlabel glass-chip mb-4 px-3.5 py-1.5 !text-[9.5px]">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          {LIVE_TOOLS.length} tools live · free up to 1 GB
        </div>
        <h1 className="rise text-[42px] leading-[1.08] font-semibold tracking-tight sm:text-[52px]" style={{ animationDelay: "40ms" }}>
          Convert, compress &<br />
          edit any file.
        </h1>
        <p className="rise mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-2" style={{ animationDelay: "90ms" }}>
          Video, audio, image, PDF or GIF — processed right in your browser.
          Your files never leave your device.
        </p>
      </div>

      <div className="rise mx-auto mt-9 max-w-2xl" style={{ animationDelay: "150ms" }}>
        <DropZone onFiles={onFiles} multiple />
      </div>

      {/* ── three surfaces ── */}
      <div className="rise mt-20 grid gap-3 md:grid-cols-3" style={{ animationDelay: "220ms" }}>
        {SURFACE_CARDS.map((c) => {
          const top = TOOLS.filter((t) => t.surface === c.surface && !t.phase).slice(0, 3);
          return (
            <div key={c.surface} className="group panel relative overflow-hidden p-5 transition-colors duration-200 hover:border-line-2">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-line-2 bg-panel-2 text-ink-2 transition-colors duration-200 group-hover:text-accent">
                  <Icon name={c.icon} size={16} />
                </span>
                <span className="microlabel !text-[9px]">{counts[c.surface]} tools</span>
              </div>
              <h2 className="text-[16px] font-semibold tracking-tight">{SURFACE_META[c.surface].label}</h2>
              <p className="mt-1.5 mb-4 text-[13px] leading-relaxed text-ink-3">{c.blurb}</p>
              <div className="flex flex-wrap gap-1.5">
                {top.map((t) => (
                  <Link
                    key={t.slug}
                    to={`/${t.slug}`}
                    className="rounded-full border border-line-2 bg-panel-2 px-2.5 py-1 text-[11.5px] text-ink-2 transition-colors duration-150 hover:border-line-3 hover:text-ink"
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── full catalog: three folders that morph open ── */}
      <FolderShelf />


      <AnimatePresence>
        {chooser && <ChooserSheet files={chooser.files} tools={chooser.tools} onClose={() => setChooser(null)} />}
      </AnimatePresence>
    </div>
  );
}
