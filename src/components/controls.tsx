import { Icon } from "./Icon";
import { cx } from "../lib/util";

export function Field({ label, children, right }: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="microlabel">{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "%",
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <Field
      label={label}
      right={
        <span className={cx("font-mono text-[11.5px] tabular-nums", disabled ? "text-ink-3" : "text-ink")}>
          {value}
          {unit}
        </span>
      }
    >
      <input
        type="range"
        className={cx("slider", disabled && "opacity-40")}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <select
          className="field appearance-none pr-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={12}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
        />
      </div>
    </Field>
  );
}

export function Segment<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-[10px] border border-line-2 bg-panel-2 p-[3px]"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium transition-all duration-150",
            value === o.value
              ? "bg-panel-3 text-ink shadow-[0_1px_4px_rgb(0_0_0/0.4),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
              : "text-ink-3 hover:text-ink-2",
          )}
          style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  min,
  max,
  width,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  suffix?: string;
  min?: number;
  max?: number;
  width?: string;
}) {
  return (
    <div className="relative" style={{ width }}>
      <input
        type="number"
        inputMode="numeric"
        className={cx("field font-mono !text-[13px] tabular-nums", suffix && "pr-10")}
        value={value}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange("");
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
      {suffix && (
        <span className="microlabel pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 !text-[9.5px]">
          {suffix}
        </span>
      )}
    </div>
  );
}
