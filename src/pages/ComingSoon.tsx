import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ToolDef } from "../lib/types";
import { CATEGORY_META, TOOLS } from "../lib/registry";
import { Icon } from "../components/Icon";
import { toast } from "../components/toast";

const PIPELINE: Record<string, string> = {
  video: "the FFmpeg worker fleet",
  gif: "the FFmpeg worker fleet",
  pdf: "our document pipeline",
  image: "the AI upscaling pipeline",
  other: "the archive pipeline",
};

export function ComingSoon({ tool }: { tool: ToolDef }) {
  const [email, setEmail] = useState("");
  const cat = CATEGORY_META[tool.category];
  const related = TOOLS.filter((t) => !t.phase && t.category === tool.category && t.slug !== tool.slug).slice(0, 6);
  const fallback = related.length ? related : TOOLS.filter((t) => !t.phase).slice(0, 6);

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
      <h1 className="rise text-[34px] leading-tight font-semibold tracking-tight" style={{ animationDelay: "40ms" }}>
        {tool.name}
      </h1>
      <p className="rise mt-2 mb-8 max-w-xl text-[15px] leading-relaxed text-ink-2" style={{ animationDelay: "80ms" }}>
        {tool.description}
      </p>

      <div className="rise panel relative overflow-hidden p-7" style={{ animationDelay: "130ms" }}>
        <div className="dotgrid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="microlabel mb-3 flex items-center gap-2 !text-accent">
            <Icon name="zap" size={12} />
            In the works — Phase {tool.phase}
          </div>
          <p className="max-w-lg text-[14px] leading-relaxed text-ink-2">
            Heavy jobs like this one run on {PIPELINE[tool.category]}, which is rolling out now. Uploaded
            files will auto-delete within the hour — same privacy bar as our in-browser tools.
          </p>
          <form
            className="mt-5 flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) return toast("That email doesn't look right", "err");
              setEmail("");
              toast(`We'll ping ${email} when ${tool.name} ships`, "ok");
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field flex-1"
              aria-label="Email for launch notification"
            />
            <button type="submit" className="pill shrink-0">
              Notify me
            </button>
          </form>
        </div>
      </div>

      <div className="rise mt-12" style={{ animationDelay: "200ms" }}>
        <div className="microlabel mb-3">Live right now</div>
        <div className="flex flex-wrap gap-2">
          {fallback.map((t) => (
            <Link
              key={t.slug}
              to={`/${t.slug}`}
              className="rounded-full border border-line-2 bg-panel px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-all duration-150 hover:border-line-3 hover:text-ink"
            >
              {t.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
