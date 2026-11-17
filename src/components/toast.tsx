import { forwardRef, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { uid } from "../lib/util";

type Kind = "info" | "ok" | "err";

interface Toast {
  id: string;
  kind: Kind;
  message: string;
}

type Listener = (t: Toast) => void;
let listener: Listener | null = null;

/** Fire-and-forget toast from anywhere — no hooks required. */
export function toast(message: string, kind: Kind = "info") {
  listener?.({ id: uid(), kind, message });
}

const KIND_ICON: Record<Kind, React.ReactNode> = {
  info: <Icon name="sparkle" size={13} style={{ color: "var(--color-accent)" }} />,
  ok: <Icon name="check" size={13} style={{ color: "var(--color-ok)" }} strokeWidth={2} />,
  err: <Icon name="x" size={13} style={{ color: "var(--color-err)" }} strokeWidth={2} />,
};

const LIFETIME = 4200;

const ToastCard = forwardRef<HTMLDivElement, { t: Toast; onDone: (id: string) => void }>(
  function ToastCard({ t, onDone }, ref) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(LIFETIME);
  const last = useRef(performance.now());

  useEffect(() => {
    let raf: number;
    const tick = (now: number) => {
      if (!paused) {
        remaining.current -= now - last.current;
        if (remaining.current <= 0) {
          onDone(t.id);
          return;
        }
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    last.current = performance.now();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, t.id, onDone]);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 480, damping: 34 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => onDone(t.id)}
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl border border-line-2 bg-panel-2 py-2.5 pr-4 pl-3 shadow-[0_12px_32px_rgb(0_0_0/0.5)]"
    >
      {KIND_ICON[t.kind]}
      <span className="text-[13px] text-ink">{t.message}</span>
    </motion.div>
  );
});

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listener = (t) => setToasts((prev) => [...prev.slice(-3), t]);
    return () => {
      listener = null;
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[90] flex flex-col items-end gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} t={t} onDone={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
