import type { SVGProps } from "react";

// One line-icon family: 24px grid, 1.8 stroke, round caps and joins.
const PATHS = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M18 15c2 .5 3 2 3 4",
  building: "M4 3h16v18H4zM9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  wrench: "M4 20l6-6M14 4l6 6-3 1-4 4-3-3 4-4z",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  mail: "M4 5h16v14H4zM4 6l8 7 8-7",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  dollar: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM14.5 9a2.5 2.5 0 0 0-5 1c0 3 5 2 5 5a2.5 2.5 0 0 1-5 1M12 6v1.5M12 16.5V18",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  dot: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  plus: "M12 5v14M5 12h14",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  printer: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  download: "M12 4v11M7 10l5 5 5-5M4 20h16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clipboard: "M9 3h6v3H9zM9 4.5H6V21h12V4.5h-3M9 11h6M9 15h4",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  pause: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 9v6M14 9v6",
  play: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l5.5-3.5z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
