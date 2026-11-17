import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { toast } from "./toast";
import { cx } from "../lib/util";

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string[]; // extensions without dot
  multiple?: boolean;
  hint?: string;
  compact?: boolean;
}

export function DropZone({ onFiles, accept, multiple = true, hint, compact }: Props) {
  const [over, setOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const acceptAttr = accept?.length ? accept.map((e) => `.${e}`).join(",") : undefined;

  const take = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const files = [...list];
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
    [onFiles, multiple],
  );

  // Whole-window drag awareness so the zone lights up before the cursor reaches it.
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = () => {
      depth.current = 0;
      setOver(false);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const sourceUnavailable = (name: string) =>
    toast(`${name} import arrives with accounts — drop a local file for now`, "info");

  return (
    <div
      className={cx(
        "relative rounded-2xl border-[1.5px] border-dashed transition-[border-color,background-color,transform] duration-200",
        over ? "scale-[1.008] border-transparent" : "border-line-2 bg-panel hover:border-line-3",
      )}
      style={{
        transitionTimingFunction: "var(--ease-out-quart)",
        // Solid surfaces only — the particle field must stay behind cards.
        background: over
          ? "color-mix(in srgb, var(--color-accent) 9%, var(--color-panel))"
          : undefined,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
    >
      {/* Marching-ants marquee while dragging — the Samp.jpg selection language */}
      <AnimatePresence>
        {over && (
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <rect
              x="1"
              y="1"
              rx="15"
              style={{ width: "calc(100% - 2px)", height: "calc(100% - 2px)" }}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeDasharray="7 7"
              className="ants"
            />
          </motion.svg>
        )}
      </AnimatePresence>

      <div
        className={cx(
          "relative flex flex-col items-center justify-center text-center",
          compact ? "gap-2 px-4 py-5" : "gap-4 px-6 py-14",
        )}
      >
        {!compact && (
          <motion.div
            animate={over ? { y: -3, scale: 1.06 } : { y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="grid h-12 w-12 place-items-center rounded-2xl border border-line-2 bg-panel-2 text-ink-2"
          >
            <Icon name="upload" size={19} className={cx(over && "text-accent")} />
          </motion.div>
        )}

        <div className={cx("font-medium text-ink", compact ? "text-[13px]" : "text-[15px]")}>
          {over ? "Drop to add files" : compact ? "Drop more files" : "Drag & drop files here"}
        </div>

        <div className={cx("flex items-stretch", compact ? "h-9" : "h-[42px]")}>
          <button
            className={cx("pill h-full !rounded-r-none !py-0 !pr-3.5", compact && "!text-[12.5px]")}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="plus" size={13} strokeWidth={2} />
            Choose Files
          </button>
          <div className="relative">
            <button
              aria-label="More sources"
              className="pill h-full !rounded-l-none !border-l !px-2.5 !py-0"
              style={{ borderLeftColor: "var(--pill-divider)" }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <Icon
                name="chevronDown"
                size={12}
                className={cx("transition-transform duration-200", menuOpen && "rotate-180")}
              />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.11 } }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                  className="panel absolute right-0 z-20 mt-2 w-44 origin-top-right overflow-hidden !rounded-xl p-1 shadow-[0_16px_40px_rgb(0_0_0/0.5)]"
                >
                  {[
                    { icon: "link" as const, label: "From URL" },
                    { icon: "upload" as const, label: "Google Drive" },
                    { icon: "archive" as const, label: "Dropbox" },
                  ].map((s) => (
                    <button
                      key={s.label}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hi hover:text-ink"
                      onClick={() => sourceUnavailable(s.label)}
                    >
                      <Icon name={s.icon} size={13} />
                      {s.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {!compact && (
          <p className="text-[12px] text-ink-3">
            {hint ?? "Max file size 1 GB —"}{" "}
            {!hint && (
              <button
                className="text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-ink"
                onClick={() => toast("Accounts are coming with larger file limits", "info")}
              >
                Sign up for more
              </button>
            )}
            <span className="mx-1.5 text-line-2">·</span>
            <button className="transition-colors hover:text-ink-2" onClick={() => toast("Files are processed locally and never uploaded", "ok")}>
              Terms of Use
            </button>
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
