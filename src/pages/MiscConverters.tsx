import { useEffect, useMemo, useState } from "react";
import type { ToolDef } from "../lib/types";
import { CATEGORY_META } from "../lib/registry";
import { Icon } from "../components/Icon";
import { SelectField } from "../components/controls";
import { toast } from "../components/toast";
import { cx } from "../lib/util";

/* ─────────────────────────── shared shell ─────────────────────────── */

function PageShell({ tool, children }: { tool: ToolDef; children: React.ReactNode }) {
  const cat = CATEGORY_META[tool.category];
  useEffect(() => {
    document.title = `${tool.name} — CrownzConverter`;
  }, [tool]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-20">
      <div className="rise mb-3 flex items-center gap-2">
        <span className="glass-chip px-3 py-1">
          <span className="h-[7px] w-[7px] rounded-[2.5px]" style={{ background: cat.color }} />
          <span className="microlabel !text-[9.5px]">{cat.label}</span>
        </span>
      </div>
      <h1 className="rise text-[34px] font-semibold tracking-tight" style={{ animationDelay: "40ms" }}>{tool.name}</h1>
      <p className="rise mt-2 mb-8 max-w-xl text-[15px] text-ink-2" style={{ animationDelay: "80ms" }}>{tool.description}</p>
      <div className="rise" style={{ animationDelay: "130ms" }}>{children}</div>
    </div>
  );
}

const copyValue = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${text} copied`, "ok");
  } catch {
    toast("Couldn't access the clipboard", "err");
  }
};

function pretty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, "e");
  const s = n.toPrecision(10);
  return String(Number(s));
}

/* ─────────────────────────── unit converter ─────────────────────────── */

type UnitTable = Record<string, number>; // factor → base unit

const UNIT_CATEGORIES: Record<string, { label: string; units: UnitTable }> = {
  length: { label: "Length", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  mass: { label: "Mass", units: { mg: 1e-6, g: 0.001, kg: 1, "metric ton": 1000, oz: 0.028349523125, lb: 0.45359237, stone: 6.35029318 } },
  temperature: { label: "Temperature", units: { "°C": 1, "°F": 1, K: 1 } },
  area: { label: "Area", units: { "cm²": 1e-4, "m²": 1, hectare: 1e4, "km²": 1e6, "in²": 0.00064516, "ft²": 0.09290304, acre: 4046.8564224 } },
  volume: { label: "Volume", units: { ml: 0.001, L: 1, "m³": 1000, tsp: 0.00492892159375, tbsp: 0.01478676478125, "fl oz": 0.0295735295625, cup: 0.2365882365, pint: 0.473176473, quart: 0.946352946, gallon: 3.785411784 } },
  speed: { label: "Speed", units: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 } },
  data: { label: "Data", units: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 } },
  energy: { label: "Energy", units: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6 } },
  pressure: { label: "Pressure", units: { Pa: 1, kPa: 1000, bar: 1e5, psi: 6894.757293168, atm: 101325 } },
};

function convertUnits(cat: string, value: number, from: string, to: string): number {
  if (cat === "temperature") {
    let celsius = value;
    if (from === "°F") celsius = (value - 32) * (5 / 9);
    if (from === "K") celsius = value - 273.15;
    if (to === "°F") return celsius * (9 / 5) + 32;
    if (to === "K") return celsius + 273.15;
    return celsius;
  }
  const t = UNIT_CATEGORIES[cat].units;
  return (value * t[from]) / t[to];
}

export function UnitConverterPage({ tool }: { tool: ToolDef }) {
  const [cat, setCat] = useState("length");
  const [value, setValue] = useState("1");
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("ft");

  const units = Object.keys(UNIT_CATEGORIES[cat].units);
  const num = parseFloat(value);
  const result = Number.isFinite(num) ? convertUnits(cat, num, from, to) : NaN;

  const pickCat = (key: string) => {
    setCat(key);
    const u = Object.keys(UNIT_CATEGORIES[key].units);
    setFrom(u[Math.min(2, u.length - 1)]);
    setTo(u[Math.min(5, u.length - 1)]);
  };

  return (
    <PageShell tool={tool}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.entries(UNIT_CATEGORIES).map(([key, c]) => (
          <button
            key={key}
            onClick={() => pickCat(key)}
            className={cx(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
              cat === key
                ? "border-accent/60 bg-accent-dim text-accent"
                : "border-line-2 bg-panel text-ink-3 hover:border-line-3 hover:text-ink-2",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="panel p-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-3">
            <div>
              <div className="microlabel mb-2">Value</div>
              <input
                className="field font-mono !text-[15px] tabular-nums"
                value={value}
                inputMode="decimal"
                onChange={(e) => setValue(e.target.value)}
                aria-label="Value to convert"
              />
            </div>
            <SelectField label="From" value={from} onChange={setFrom} options={units.map((u) => ({ value: u, label: u }))} />
          </div>

          <button
            aria-label="Swap units"
            className="icon-btn mx-auto mb-1 !h-9 !w-9 !rounded-full"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <Icon name="convert" size={14} />
          </button>

          <div className="space-y-3">
            <div>
              <div className="microlabel mb-2">Result</div>
              <button
                onClick={() => Number.isFinite(result) && copyValue(pretty(result))}
                className="field block w-full cursor-copy truncate text-left font-mono !text-[15px] !text-ink tabular-nums transition-colors hover:!border-accent/50"
                title="Click to copy"
              >
                {pretty(result)}
              </button>
            </div>
            <SelectField label="To" value={to} onChange={setTo} options={units.map((u) => ({ value: u, label: u }))} />
          </div>
        </div>
      </div>

      {Number.isFinite(num) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {units
            .filter((u) => u !== from)
            .slice(0, 6)
            .map((u) => (
              <button
                key={u}
                onClick={() => copyValue(pretty(convertUnits(cat, num, from, u)))}
                className="panel cursor-copy px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-line-2"
              >
                <div className="truncate font-mono text-[13.5px] text-ink tabular-nums">{pretty(convertUnits(cat, num, from, u))}</div>
                <div className="microlabel mt-0.5 !text-[9px]">{u}</div>
              </button>
            ))}
        </div>
      )}
    </PageShell>
  );
}

/* ─────────────────────────── time converter ─────────────────────────── */

const DURATIONS: UnitTable = {
  milliseconds: 0.001,
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
  months: 2629746, // mean Gregorian month
  years: 31556952,
};

export function TimeConverterPage({ tool }: { tool: ToolDef }) {
  const [value, setValue] = useState("90");
  const [from, setFrom] = useState("minutes");
  const [stamp, setStamp] = useState(() => String(Math.floor(Date.now() / 1000)));

  const num = parseFloat(value);
  const seconds = Number.isFinite(num) ? num * DURATIONS[from] : NaN;

  const stampInfo = useMemo(() => {
    const raw = stamp.trim();
    if (!/^\d{1,17}$/.test(raw)) return null;
    let n = Number(raw);
    const isMs = raw.length > 11;
    if (!isMs) n *= 1000;
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return null;
    return {
      unit: isMs ? "milliseconds" : "seconds",
      local: d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "medium" }),
      utc: d.toISOString(),
      relative: relativeTime(d),
    };
  }, [stamp]);

  return (
    <PageShell tool={tool}>
      <div className="panel p-5">
        <div className="microlabel mb-4">Duration</div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field w-36 font-mono !text-[15px] tabular-nums"
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value)}
            aria-label="Duration value"
          />
          <div className="w-40">
            <SelectField label="" value={from} onChange={setFrom} options={Object.keys(DURATIONS).map((u) => ({ value: u, label: u }))} />
          </div>
        </div>
        {Number.isFinite(seconds) && (
          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {Object.keys(DURATIONS)
              .filter((u) => u !== from)
              .map((u) => (
                <button
                  key={u}
                  onClick={() => copyValue(pretty(seconds / DURATIONS[u]))}
                  className="cursor-copy rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-line-2"
                >
                  <div className="truncate font-mono text-[13.5px] text-ink tabular-nums">{pretty(seconds / DURATIONS[u])}</div>
                  <div className="microlabel mt-0.5 !text-[9px]">{u}</div>
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="panel mt-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="microlabel">Unix timestamp</span>
          <button className="pill-dark !py-1 !text-[11.5px]" onClick={() => setStamp(String(Math.floor(Date.now() / 1000)))}>
            <Icon name="clock" size={12} />
            Now
          </button>
        </div>
        <input
          className="field font-mono !text-[15px] tabular-nums"
          value={stamp}
          inputMode="numeric"
          onChange={(e) => setStamp(e.target.value)}
          aria-label="Unix timestamp"
          placeholder="e.g. 1753228800"
        />
        {stampInfo ? (
          <div className="mt-4 space-y-2">
            {[
              { label: `Detected · ${stampInfo.unit}`, value: stampInfo.relative },
              { label: "Local time", value: stampInfo.local },
              { label: "UTC / ISO 8601", value: stampInfo.utc },
            ].map((row) => (
              <button
                key={row.label}
                onClick={() => copyValue(row.value)}
                className="flex w-full cursor-copy items-baseline justify-between gap-4 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-line-2"
              >
                <span className="microlabel shrink-0 !text-[9px]">{row.label}</span>
                <span className="truncate font-mono text-[12.5px] text-ink">{row.value}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-ink-3">Paste a timestamp in seconds or milliseconds.</p>
        )}
      </div>
    </PageShell>
  );
}

function relativeTime(d: Date): string {
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [1000, "second"],
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [2_629_746_000, "month"],
    [31_556_952_000, "year"],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let div = 1000;
  for (const [ms, u] of steps) {
    if (abs >= ms) {
      unit = u;
      div = ms;
    }
  }
  return rtf.format(Math.round(diff / div), unit);
}
