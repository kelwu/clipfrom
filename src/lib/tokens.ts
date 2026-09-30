// Design tokens from DESIGN.md ("The Console Palette"). Import these instead of
// redefining colors per page — local copies drifted (e.g. muted text at 65% lightness
// instead of 82%, which fails contrast on dark surfaces).
export const T = {
  bgDeep: "oklch(10% 0.018 255)",
  bgSidebar: "oklch(12% 0.02 258)",
  surface: "oklch(14% 0.015 250)",
  surfaceRaised: "oklch(18% 0.015 250)",
  surfaceLifted: "oklch(21% 0.015 250)",
  accent: "oklch(72% 0.17 280)",
  accentSubtle: "oklch(72% 0.17 280 / 0.09)",
  accentBorder: "oklch(72% 0.17 280 / 0.22)",
  ink: "oklch(96% 0.005 250)",
  inkMuted: "oklch(82% 0.01 250)",
  inkDim: "oklch(70% 0.01 250)",
  borderSoft: "oklch(100% 0 0 / 0.07)",
  borderMed: "oklch(100% 0 0 / 0.13)",
  amber: "oklch(75% 0.17 75)",
  red: "oklch(65% 0.2 25)",
  green: "oklch(65% 0.2 155)",
} as const;
