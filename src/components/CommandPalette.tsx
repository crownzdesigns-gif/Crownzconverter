import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CATEGORY_META, SURFACE_META, TOOLS } from "../lib/registry";
import { Icon } from "./Icon";
import { cx } from "../lib/util";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS.filter((t) => !t.phase).slice(0, 9);
    return TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.includes(q.replace(/\s+/g, "-")) ||
        t.description.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Focus after the paint so the enter animation doesn't fight the caret.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const go = (slug: string) => {
    onClose();
    navigate(`/${slug}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[index]) {
      go(results[index].slug);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-[6px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.13 } }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="panel mx-auto mt-[16vh] w-[min(560px,calc(100vw-32px))] overflow-hidden !rounded-2xl shadow-[0_32px_80px_rgb(0_0_0/0.6)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Search tools"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon name="search" size={15} className="shrink-0 text-ink-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search 60+ tools — try “heic”, “compress”, “merge”…"
                className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
              />
              <kbd className="microlabel shrink-0 rounded-[5px] border border-line-2 bg-panel-2 px-1.5 py-0.5 !text-[9px]">
                esc
              </kbd>
            </div>
            <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <div className="px-3 py-8 text-center text-[13px] text-ink-3">
                  Nothing matches “{query}”
                </div>
              )}
              {results.map((t, i) => (
                <button
                  key={t.slug}
                  data-idx={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(t.slug)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-75",
                    i === index ? "bg-hi" : "bg-transparent",
                  )}
                >
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-[2.5px]"
                    style={{ background: CATEGORY_META[t.category].color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{t.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{t.description}</span>
                  </span>
                  <span className="microlabel shrink-0 !text-[9px]">
                    {t.phase ? "soon" : SURFACE_META[t.surface].label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
