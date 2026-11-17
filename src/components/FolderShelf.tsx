import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CATEGORY_META, SURFACE_META, TOOLS } from "../lib/registry";
import type { Surface, ToolDef } from "../lib/types";
import { Icon, type IconName } from "./Icon";

/* The folder fronts stay dark in both themes — that's the look of the reference. */
const SHELL = "#0f0f11";
const FRONT = "#18181b";

const FOLDERS: Array<{ surface: Surface; subtitle: string; gradient: string }> = [
  {
    surface: "convert",
    subtitle: "Any format, any file",
    gradient:
      "radial-gradient(90% 80% at 18% 0%, #cfe1ff 0%, rgb(207 225 255 / 0) 55%)," +
      "radial-gradient(120% 90% at 85% 12%, #2f6bff 0%, rgb(47 107 255 / 0) 60%)," +
      "radial-gradient(130% 100% at 52% 115%, #7b5cf0 0%, rgb(123 92 240 / 0) 65%)," +
      "linear-gradient(150deg, #8fb7ff 0%, #3e8bff 55%, #4f46e5 100%)",
  },
  {
    surface: "compress",
    subtitle: "Smaller, same quality",
    gradient:
      "radial-gradient(90% 80% at 18% 0%, #ffd9d0 0%, rgb(255 217 208 / 0) 55%)," +
      "radial-gradient(120% 90% at 82% 10%, #ff4530 0%, rgb(255 69 48 / 0) 60%)," +
      "radial-gradient(130% 100% at 55% 115%, #d6336c 0%, rgb(214 51 108 / 0) 65%)," +
      "linear-gradient(150deg, #ff9a8a 0%, #f43f2e 55%, #c2255c 100%)",
  },
  {
    surface: "tools",
    subtitle: "Crop, merge & more",
    gradient:
      "radial-gradient(90% 80% at 18% 0%, #e6dcff 0%, rgb(230 220 255 / 0) 55%)," +
      "radial-gradient(120% 90% at 82% 12%, #7c5cf0 0%, rgb(124 92 240 / 0) 60%)," +
      "radial-gradient(130% 100% at 55% 115%, #d63384 0%, rgb(214 51 132 / 0) 65%)," +
      "linear-gradient(150deg, #b9a6ff 0%, #8b7cf6 55%, #6d28d9 100%)",
  },
];

const CAT_ICON: Record<string, IconName> = {
  video: "video",
  image: "image",
  pdf: "fileText",
  gif: "gif",
  other: "archive",
};

function toolIcon(t: ToolDef): IconName {
  if (t.engine === "unit") return "ruler";
  if (t.engine === "time") return "clock";
  return CAT_ICON[t.category];
}

/* White sheet with faint text lines, poking out of the folder pocket */
function Paper({
  lines,
  className,
  style,
}: {
  lines: string[];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute rounded-[9px] bg-white shadow-[0_2px_12px_rgb(0_0_0/0.22)] ${className ?? ""}`}
      style={style}
    >
      <div className="flex flex-col gap-[7px] px-[13%] pt-[15%]">
        {lines.map((w, i) => (
          <span key={i} className="h-[3px] rounded-full bg-black/[0.13]" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

const CARD_PAPERS = [
  { left: "8%", top: "12%", rotate: "-10deg", delay: "0ms", lines: ["78%", "56%", "68%"] },
  { left: "33%", top: "7%", rotate: "-2deg", delay: "40ms", lines: ["70%", "50%", "62%", "40%"] },
  { left: "58%", top: "13%", rotate: "9deg", delay: "80ms", lines: ["66%", "48%", "58%"] },
];

function FolderCard({
  surface,
  subtitle,
  gradient,
  count,
  onOpen,
  buttonRef,
}: {
  surface: Surface;
  subtitle: string;
  gradient: string;
  count: number;
  onOpen: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <motion.button
      ref={buttonRef}
      layoutId={`folder-${surface}`}
      onClick={onOpen}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ borderRadius: 28, background: SHELL }}
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden border border-line p-[7px] text-left shadow-[0_10px_30px_rgb(0_0_0/0.25)] transition-shadow duration-300 hover:shadow-[0_22px_60px_rgb(0_0_0/0.4)]"
      aria-haspopup="dialog"
      aria-label={`Open ${SURFACE_META[surface].label} folder — ${count} tools`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[22px]" style={{ background: FRONT }}>
        {/* wallpaper gradient behind the pocket */}
        <div className="absolute inset-x-0 top-0 h-[52%]" style={{ background: gradient }} />

        {/* sheets — rise slightly, staggered, when the folder is hovered */}
        {CARD_PAPERS.map((p, i) => (
          <Paper
            key={i}
            lines={p.lines}
            className="h-[64%] w-[34%] transition-transform duration-300 group-hover:-translate-y-2"
            style={{
              left: p.left,
              top: p.top,
              rotate: p.rotate,
              transitionDelay: p.delay,
              transitionTimingFunction: "var(--ease-spring)",
            }}
          />
        ))}

        {/* folder front: tab, concave fillet, main pocket */}
        <div
          className="absolute left-0 flex items-center px-6"
          style={{
            bottom: "calc(58% - 1px)",
            height: "calc(13% + 1px)",
            width: "56%",
            background: FRONT,
            borderRadius: "18px 14px 0 0",
          }}
        >
          <span className="text-[16px] font-semibold tracking-tight text-[#f4f4f5]">
            {SURFACE_META[surface].label}
          </span>
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "calc(56% - 1px)",
            bottom: "58%",
            width: 18,
            height: 18,
            background: FRONT,
            WebkitMaskImage: "radial-gradient(circle 18px at 100% 0%, transparent 17.5px, #000 18px)",
            maskImage: "radial-gradient(circle 18px at 100% 0%, transparent 17.5px, #000 18px)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ height: "58%", background: FRONT, borderRadius: "0 16px 0 0" }}
        >
          <span className="block px-6 pt-2.5 text-[12.5px] text-[#84848d]">{subtitle}</span>
          <span aria-hidden className="absolute top-[15px] right-6 flex gap-[3px]">
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-[3.5px] w-[3.5px] rounded-full bg-white/70" />
            ))}
          </span>
          <span className="absolute bottom-5 left-6 flex items-center gap-2 text-[#e4e4e7]">
            <Icon name="copy" size={14} className="text-[#a1a1aa]" />
            <span className="text-[13.5px] font-medium">{count} Tools</span>
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function FolderOverlay({
  surface,
  gradient,
  tools,
  onClose,
}: {
  surface: Surface;
  gradient: string;
  tools: ToolDef[];
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const pop = (i: number) =>
    reduce
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 420, damping: 30, delay: 0.12 + i * 0.022 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[8px]"
      onClick={onClose}
    >
      <motion.div
        layoutId={`folder-${surface}`}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        style={{ borderRadius: 26 }}
        className="relative mx-auto mt-[8vh] flex max-h-[82vh] w-[min(740px,calc(100vw-28px))] flex-col overflow-hidden border border-line-2 bg-menu shadow-[0_40px_120px_rgb(0_0_0/0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${SURFACE_META[surface].label} tools`}
      >
        {/* opened folder: same wallpaper, sheets peeking from behind the header bar */}
        <div className="relative h-[104px] shrink-0 overflow-hidden" style={{ background: gradient }}>
          {CARD_PAPERS.map((p, i) => (
            <motion.div
              key={i}
              initial={{ y: reduce ? 14 : 44 }}
              animate={{ y: 14 }}
              transition={pop(i)}
              className="absolute top-auto bottom-[-30%] h-[80%] w-[21%]"
              style={{ left: `${16 + i * 24}%`, rotate: p.rotate }}
            >
              <Paper lines={p.lines} className="h-full w-full" />
            </motion.div>
          ))}
          <button
            ref={closeRef}
            onClick={onClose}
            className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-sm transition-transform duration-150 hover:scale-105 active:scale-95"
            aria-label="Close folder"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="flex items-baseline justify-between border-b border-line px-6 py-4">
          <div className="text-[16.5px] font-semibold tracking-tight">
            {SURFACE_META[surface].label}
          </div>
          <span className="microlabel">{tools.length} tools</span>
        </div>

        <div className="grid content-start gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {tools.map((t, i) => (
            <motion.div
              key={t.slug}
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={pop(i)}
            >
              <Link
                to={`/${t.slug}`}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 transition-colors duration-150 hover:border-line-2 hover:bg-panel-3 ${t.phase ? "opacity-70 hover:opacity-100" : ""}`}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]"
                  style={{
                    background: `color-mix(in srgb, ${CATEGORY_META[t.category].color} 13%, transparent)`,
                    color: CATEGORY_META[t.category].color,
                  }}
                >
                  <Icon name={toolIcon(t)} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="truncate">{t.name}</span>
                    {t.phase && (
                      <span className="microlabel shrink-0 rounded-full border border-line-2 px-1.5 py-px !text-[8px]">
                        soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{t.description}</span>
                </span>
                <Icon
                  name="chevronRight"
                  size={13}
                  className="shrink-0 text-ink-3/0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ink-3"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * The full catalog as three folders — Convert, Compress, Tools.
 * Tapping one morphs it open into an overlay where its tools spill out.
 */
export function FolderShelf() {
  const [open, setOpen] = useState<Surface | null>(null);
  const triggers = useRef<Partial<Record<Surface, HTMLButtonElement | null>>>({});

  const close = () => {
    const s = open;
    setOpen(null);
    if (s) triggers.current[s]?.focus();
  };

  const folder = FOLDERS.find((f) => f.surface === open);
  const tools = open
    ? TOOLS.filter((t) => t.surface === open).sort((a, b) => (a.phase ? 1 : 0) - (b.phase ? 1 : 0))
    : [];

  return (
    <section className="mt-20">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold tracking-tight">Browse all tools</h2>
        <span className="microlabel">{TOOLS.length} tools · 3 folders</span>
      </div>
      <p className="mb-6 text-[13.5px] text-ink-3">
        Everything lives in one of three folders — tap one to open it.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FOLDERS.map((f) => (
          <FolderCard
            key={f.surface}
            {...f}
            count={TOOLS.filter((t) => t.surface === f.surface).length}
            onOpen={() => setOpen(f.surface)}
            buttonRef={(el) => (triggers.current[f.surface] = el)}
          />
        ))}
      </div>

      <AnimatePresence>
        {open && folder && (
          <FolderOverlay
            key={open}
            surface={open}
            gradient={folder.gradient}
            tools={tools}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
