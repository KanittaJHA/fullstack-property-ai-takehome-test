const paths = {
  thumbtack: "M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7ZM12 16v6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "eye-off": "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  book: "M12 5v16M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z",
  moon: "M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10Z",
  rainbow:
    "M2 20v-5a10 10 0 0 1 20 0v5M6 20v-5a6 6 0 0 1 12 0v5M10 20v-5a2 2 0 0 1 4 0v5",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  spark:
    "m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8ZM20 2v4m-2-2h4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  bed: "M3 18V6m18 12v-7H3m0 5h18M7 11V7h5v4m1 0V7h5v4",
  bath: "M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm3 0V5a3 3 0 0 1 6 0M6 20v2m12-2v2",
  size: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  filter: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  chat: "M21 4v12H9l-6 5V4Z M7 8h10M7 12h7",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-4 9 3 3 5-5",
  plus: "M12 5v14M5 12h14",
  send: "m3 3 19 9-19 9 4-9Zm4 9h15",
  train:
    "M7 3h10a2 2 0 0 1 2 2v12H5V5a2 2 0 0 1 2-2ZM5 11h14M9 3v8m6 6 4 5M9 17l-4 5M8 14h1m6 0h1",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
