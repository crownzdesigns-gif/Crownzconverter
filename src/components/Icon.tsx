import type { SVGProps } from "react";

export type IconName =
  | "sparkle" | "upload" | "download" | "check" | "x" | "plus" | "minus"
  | "chevronDown" | "chevronRight" | "search" | "drag" | "image" | "video"
  | "audio" | "fileText" | "gif" | "archive" | "ruler" | "clock" | "convert"
  | "compress" | "sliders" | "crop" | "rotate" | "flipH" | "expand" | "trash"
  | "retry" | "copy" | "lock" | "layers" | "arrowRight" | "link" | "eyedropper"
  | "menu" | "zap" | "sun" | "moon";

const paths: Record<IconName, React.ReactNode> = {
  sparkle: <path d="M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3Z" fill="currentColor" stroke="none" />,
  upload: <><path d="M8 10.5V3M4.5 6.5 8 3l3.5 3.5" /><path d="M2.5 13.5h11" /></>,
  download: <><path d="M8 3v7.5M4.5 7 8 10.5 11.5 7" /><path d="M2.5 13.5h11" /></>,
  check: <path d="m3 8.5 3.2 3.2L13 5" />,
  x: <path d="m4 4 8 8m0-8-8 8" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  chevronDown: <path d="m4 6 4 4 4-4" />,
  chevronRight: <path d="m6 4 4 4-4 4" />,
  search: <><circle cx="7.2" cy="7.2" r="4.7" /><path d="M10.7 10.7 14 14" /></>,
  drag: <g fill="currentColor" stroke="none">{[4, 8, 12].flatMap((y) => [5.5, 10.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />))}</g>,
  image: <><rect x="2" y="3" width="12" height="10" rx="2" /><circle cx="5.6" cy="6.3" r="1" fill="currentColor" stroke="none" /><path d="m2.5 11.2 3-2.8 2.6 2.4 2.8-2.7 2.6 2.4" /></>,
  video: <><rect x="1.5" y="4" width="9.5" height="8" rx="2" /><path d="m11 7 3.5-2.2v6.4L11 9" /></>,
  audio: <><path d="M6.2 12.3V4.2l6.3-1.7v8.1" /><circle cx="4.4" cy="12.3" r="1.9" /><circle cx="10.6" cy="10.6" r="1.9" /></>,
  fileText: <><path d="M9.2 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.8L9.2 1.5Z" /><path d="M9.2 1.5v3.3h3.3M6 8.7h4M6 11.2h4" /></>,
  gif: <><rect x="1.5" y="4" width="13" height="8" rx="2" /><text x="8" y="9.9" textAnchor="middle" fontSize="4.6" fontFamily="var(--font-mono)" fontWeight="600" fill="currentColor" stroke="none">GIF</text></>,
  archive: <><rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M8 1.5V3m0 1.5V6m0 1.5V9" /><rect x="6.6" y="9.8" width="2.8" height="2.4" rx="0.6" /></>,
  ruler: <><rect x="1.5" y="5.8" width="13" height="4.4" rx="1" /><path d="M4.5 5.8v2.1M7 5.8v2.1M9.5 5.8v2.1M12 5.8v2.1" /></>,
  clock: <><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.4 1.6" /></>,
  convert: <><path d="M2.5 5.2h9.4M9.6 2.7l2.4 2.5-2.4 2.5" /><path d="M13.5 10.8H4.1m2.3 2.5-2.4-2.5 2.4-2.5" /></>,
  compress: <><path d="M13.7 2.3 9.8 6.2m0-3v3h3" /><path d="M2.3 13.7l3.9-3.9m0 3v-3h-3" /></>,
  sliders: <><path d="M2.5 4.6h11M2.5 8h11M2.5 11.4h11" /><circle cx="6" cy="4.6" r="1.5" fill="var(--color-panel)" /><circle cx="10.6" cy="8" r="1.5" fill="var(--color-panel)" /><circle cx="4.6" cy="11.4" r="1.5" fill="var(--color-panel)" /></>,
  crop: <><path d="M1.5 4.5h8a2 2 0 0 1 2 2v8" /><path d="M4.5 1.5v8a2 2 0 0 0 2 2h8" /></>,
  rotate: <><path d="M13.4 8A5.4 5.4 0 1 1 11.6 4" /><path d="M11.9 1.4v2.8H9.1" /></>,
  flipH: <><path d="M8 1.5v13" strokeDasharray="2 2.2" /><path d="M5.8 4.8v6.4L2.2 8l3.6-3.2Z" fill="currentColor" stroke="none" /><path d="M10.2 4.8v6.4L13.8 8l-3.6-3.2Z" /></>,
  expand: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  trash: <><path d="M2.8 4.3h10.4M6 4.3V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.3" /><path d="m4.2 4.3.6 8.5a1.2 1.2 0 0 0 1.2 1.2h4a1.2 1.2 0 0 0 1.2-1.2l.6-8.5" /><path d="M6.7 7.2v4M9.3 7.2v4" /></>,
  retry: <><path d="M2.6 8a5.4 5.4 0 1 1 1.8 4" /><path d="M4.1 14.6v-2.8h2.8" /></>,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.2a1 1 0 0 0-1-1H3.3a1 1 0 0 0-1 1v6.2a1 1 0 0 0 1 1h.2" /></>,
  lock: <><rect x="3.5" y="7" width="9" height="7" rx="1.6" /><path d="M5.6 7V5.1a2.4 2.4 0 0 1 4.8 0V7" /></>,
  layers: <><path d="M8 1.8 14.3 5 8 8.2 1.7 5 8 1.8Z" /><path d="M1.7 8.1 8 11.3l6.3-3.2" /><path d="M1.7 11.2 8 14.4l6.3-3.2" /></>,
  arrowRight: <path d="M2.5 8h11M10.2 4.5 13.7 8l-3.5 3.5" />,
  link: <><path d="m6.6 9.4 2.8-2.8" /><path d="M5.2 6.8 3.4 8.6a2.5 2.5 0 0 0 3.5 3.5l1.8-1.8" /><path d="m10.8 9.2 1.8-1.8a2.5 2.5 0 0 0-3.5-3.5L7.3 5.7" /></>,
  eyedropper: <><path d="m9.3 6.7-5.9 5.9-1 2.1 2.1-1 5.9-5.9" /><path d="m8.1 5.5 2.4 2.4" /><path d="M9.6 2.7a1.9 1.9 0 0 1 2.7 2.7l-1.4 1.4-2.7-2.7 1.4-1.4Z" /></>,
  menu: <path d="M2.5 5h11M2.5 8h11M2.5 11h11" />,
  zap: <path d="M8.8 1.8 3.4 9h3.4l-.9 5.2L11.3 7H7.9l.9-5.2Z" />,
  sun: <><circle cx="8" cy="8" r="2.7" /><path d="M8 1.3v1.9M8 12.8v1.9M1.3 8h1.9M12.8 8h1.9M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3" /></>,
  moon: <path d="M13.6 9.7A6.1 6.1 0 1 1 6.3 2.4a4.9 4.9 0 0 0 7.3 7.3Z" />,
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
  ...rest
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
