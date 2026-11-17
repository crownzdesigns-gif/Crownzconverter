import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CATEGORY_META, SURFACE_META, toolsFor } from "../lib/registry";
import type { Surface } from "../lib/types";
import { currentTheme, setTheme, type Theme } from "../lib/theme";
import { Icon } from "./Icon";
import { toast } from "./toast";
import { cx } from "../lib/util";

const SURFACES: Surface[] = ["convert", "compress", "tools"];

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <img
        src="/brand/logo-128.png"
        alt="CrownzConverter"
        width={size}
        height={size}
        className="rounded-[30%] transition-transform duration-200 group-hover:rotate-12"
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
        draggable={false}
      />
      <span className="text-[14.5px] font-semibold tracking-tight text-ink">CrownzConverter</span>
    </Link>
  );
}

function MegaPanel({ surface, onNavigate }: { surface: Surface; onNavigate: () => void }) {
  const groups = [...toolsFor(surface).entries()];
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.995, transition: { duration: 0.13 } }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-x-0 top-full pt-2"
    >
      <div className="mx-auto max-w-5xl px-4">
        <div className="panel overflow-hidden rounded-2xl !bg-menu shadow-[0_24px_64px_rgb(0_0_0/0.45)]">
          <div className="grid gap-x-6 gap-y-7 p-7" style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 5)}, minmax(0, 1fr))` }}>
            {groups.map(([cat, tools], gi) => (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 + gi * 0.035, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: CATEGORY_META[cat].color }} />
                  <span className="microlabel">{CATEGORY_META[cat].label}</span>
                </div>
                <ul className="space-y-0.5">
                  {tools.map((t) => (
                    <li key={t.slug}>
                      <Link
                        to={`/${t.slug}`}
                        onClick={onNavigate}
                        className="group/link flex items-center justify-between rounded-md px-1.5 py-[5px] text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hi hover:text-ink"
                      >
                        <span className="transition-transform duration-150 ease-out group-hover/link:translate-x-0.5">
                          {t.menuLabel ?? t.name}
                        </span>
                        {t.phase && (
                          <span className="microlabel !text-[8.5px] text-ink-3/70">soon</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line bg-panel-2 px-7 py-3">
            <span className="text-[12px] text-ink-3">
              Files are processed in your browser — they never leave your device.
            </span>
            <span className="microlabel flex items-center gap-1.5 !text-[9.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" /> All systems live
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function NavBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [open, setOpen] = useState<Surface | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const closeTimer = useRef<number>(0);
  const hoverMutedUntil = useRef<number>(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
    // The browser re-fires mouseover under a resting cursor after navigation;
    // mute hover-open briefly so the menu never pops open uninvited.
    hoverMutedUntil.current = performance.now() + 600;
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hold = () => window.clearTimeout(closeTimer.current);
  const release = () => {
    hold();
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-xl"
      onMouseLeave={release}
      onMouseEnter={hold}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Wordmark />

        <div className="hidden items-center gap-1 md:flex">
          {SURFACES.map((s) => (
            <button
              key={s}
              onMouseEnter={() => {
                if (performance.now() > hoverMutedUntil.current || open) setOpen(s);
              }}
              onClick={() => setOpen(open === s ? null : s)}
              aria-expanded={open === s}
              className={cx(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors duration-120",
                open === s ? "bg-hi text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {SURFACE_META[s].label}
              <Icon
                name="chevronDown"
                size={11}
                className={cx("transition-transform duration-200", open === s && "rotate-180")}
              />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="icon-btn !h-8 !w-8 !rounded-full"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => {
              const next: Theme = theme === "dark" ? "light" : "dark";
              setTheme(next);
              setThemeState(next);
            }}
          >
            <motion.span
              key={theme}
              initial={{ rotate: -60, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className="grid place-items-center"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
            </motion.span>
          </button>
          <button
            onClick={onOpenPalette}
            className="hidden items-center gap-2 rounded-full border border-line-2 bg-panel-2 py-1.5 pr-2 pl-3 text-[12.5px] text-ink-3 transition-colors duration-120 hover:border-line-3 hover:text-ink-2 sm:flex"
          >
            <Icon name="search" size={12} />
            <span>Search tools</span>
            <kbd className="microlabel rounded-[5px] border border-line-2 bg-panel-3 px-1.5 py-0.5 !text-[9px] !text-ink-3">
              ⌘K
            </kbd>
          </button>
          <button className="pill !py-1.5 !text-[12.5px]" onClick={() => toast("Accounts are coming with larger file limits", "info")}>
            Sign up
          </button>
          <button
            className="icon-btn md:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Icon name={mobileOpen ? "x" : "menu"} size={15} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && <MegaPanel key={open} surface={open} onNavigate={() => setOpen(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-line bg-canvas md:hidden"
          >
            <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5">
              {SURFACES.map((s) => (
                <div key={s}>
                  <div className="microlabel mb-2">{SURFACE_META[s].label}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {[...toolsFor(s).values()].flat().map((t) => (
                      <button
                        key={t.slug}
                        onClick={() => navigate(`/${t.slug}`)}
                        className="rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hi hover:text-ink"
                      >
                        {t.name}
                        {t.phase ? <span className="microlabel ml-1.5 !text-[8px]">soon</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
