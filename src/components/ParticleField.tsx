import { useEffect, useRef } from "react";

/**
 * The dot-grid canvas, alive. Replaces the static CSS grid with a full-viewport
 * canvas of particles resting at the same 22px pitch. Near the cursor they wake:
 * drift away, rotate tangentially (a swirl around the pointer), take a category
 * color, then decay back to faint rest dots — leaving a fading multicolor trail,
 * like antigravity.google. Runs behind all content, sleeps when idle, and honors
 * prefers-reduced-motion by never mounting the effect at all.
 */

const SPACING = 22;
const RADIUS = 140;
/** Trail fade — quick enough to feel lively, long enough to read as a trail. */
const DECAY = 0.972;

interface Particle {
  rx: number; // rest position
  ry: number;
  ox: number; // spring offset
  oy: number;
  vx: number;
  vy: number;
  e: number; // energy 0..1 — drives size, color, rotation
  a: number; // idle angle
  ta: number; // target (swirl) angle
  l: number; // dash length jitter
  c: string;
}

export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    document.body.classList.add("live-grid");

    let W = 0;
    let H = 0;
    let parts: Particle[] = [];
    let palette: string[] = ["#3e8bff"];
    let restColor = "rgb(255 255 255 / 0.05)";
    let raf = 0;
    let running = false;
    let idleAt = performance.now();
    const mouse = { x: -9e3, y: -9e3, px: -9e3, py: -9e3, vx: 0, vy: 0 };

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const get = (v: string) => cs.getPropertyValue(v).trim();
      restColor = get("--dot") || restColor;
      const accent = get("--color-accent");
      // Blue-leaning mix with sparks of the other category hues, like the reference.
      palette = [
        accent, accent, accent,
        get("--color-cat-video"), get("--color-cat-video"),
        get("--color-cat-gif"),
        get("--color-cat-pdf"),
        get("--color-cat-image"),
      ].filter(Boolean);
    };

    const paint = (p: Particle) => {
      if (p.e > 0.025) {
        const blend = Math.min(1, p.e * 1.4);
        const ang = p.ta * blend + p.a * (1 - blend);
        const len = 2 + p.l * p.e;
        ctx.save();
        ctx.translate(p.rx + p.ox, p.ry + p.oy);
        ctx.rotate(ang);
        ctx.globalAlpha = Math.min(1, p.e * 1.5);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(-len / 2, -0.9, len, 1.8, 1);
        else ctx.rect(-len / 2, -0.9, len, 1.8);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = restColor;
        ctx.fillRect(p.rx + p.ox - 0.75, p.ry + p.oy - 0.75, 1.5, 1.5);
      }
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) paint(p);
    };

    const build = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = [];
      for (let y = 11; y < H; y += SPACING) {
        for (let x = 11; x < W; x += SPACING) {
          parts.push({
            rx: x, ry: y, ox: 0, oy: 0, vx: 0, vy: 0, e: 0,
            a: Math.random() * Math.PI * 2,
            ta: 0,
            l: 4 + Math.random() * 4.5,
            c: palette[(Math.random() * palette.length) | 0],
          });
        }
      }
    };

    const step = () => {
      ctx.clearRect(0, 0, W, H);
      let total = 0;
      mouse.vx *= 0.9;
      mouse.vy *= 0.9;

      for (const p of parts) {
        const dx = p.rx + p.ox - mouse.x;
        const dy = p.ry + p.oy - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < RADIUS * RADIUS) {
          const d = Math.sqrt(d2) || 1;
          const n = 1 - d / RADIUS;
          if (n > p.e) p.e = n;
          const f = n * n * 1.5;
          p.vx += (dx / d) * f + mouse.vx * 0.09 * n;
          p.vy += (dy / d) * f + mouse.vy * 0.09 * n;
          p.ta = Math.atan2(dy, dx) + Math.PI / 2;
        }
        p.vx += -0.14 * p.ox;
        p.vy += -0.14 * p.oy;
        p.vx *= 0.8;
        p.vy *= 0.8;
        p.ox += p.vx;
        p.oy += p.vy;
        p.e *= DECAY;
        total += p.e;
        paint(p);
      }

      // Sleep once the trail has faded and the pointer has gone quiet.
      if (total < 0.4 && performance.now() - idleAt > 700) {
        drawStatic();
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (mouse.px > -9e3) {
        mouse.vx = mouse.vx * 0.75 + (e.clientX - mouse.px) * 0.25;
        mouse.vy = mouse.vy * 0.75 + (e.clientY - mouse.py) * 0.25;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.px = e.clientX;
      mouse.py = e.clientY;
      idleAt = performance.now();
      wake();
    };

    const onLeave = () => {
      mouse.x = -9e3;
      mouse.y = -9e3;
      mouse.px = -9e3;
      mouse.py = -9e3;
    };

    const onResize = () => {
      build();
      if (!running) drawStatic();
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else {
        idleAt = performance.now();
        wake();
      }
    };

    // Re-read palette when the theme flips; keep positions and energy.
    const themeWatch = new MutationObserver(() => {
      readColors();
      for (const p of parts) p.c = palette[(Math.random() * palette.length) | 0];
      if (!running) drawStatic();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    readColors();
    build();
    drawStatic();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      document.body.classList.remove("live-grid");
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
}
