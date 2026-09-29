// Tiny 9:16 phone diagram showing where b-roll sits for each layout, so the choice is
// visible before rendering (the live preview can't show b-roll — it's picked at render).
type Layout =
  | "auto" | "fullscreen" | "top-three-quarters" | "top-two-thirds" | "top-half"
  | "top-third" | "bottom-third" | "corner" | "floating";

// b-roll rectangle in a 18×32 viewBox
const RECTS: Record<Exclude<Layout, "auto">, { x: number; y: number; w: number; h: number }> = {
  fullscreen:           { x: 0,  y: 0,    w: 18, h: 32 },
  "top-three-quarters": { x: 0,  y: 0,    w: 18, h: 22.4 },
  "top-two-thirds":     { x: 0,  y: 0,    w: 18, h: 21.3 },
  "top-half":           { x: 0,  y: 0,    w: 18, h: 16 },
  "top-third":          { x: 0,  y: 0,    w: 18, h: 10.7 },
  "bottom-third":       { x: 0,  y: 21.3, w: 18, h: 10.7 },
  corner:               { x: 11, y: 2,    w: 5.2, h: 9.3 },
  floating:             { x: 1,  y: 1.3,  w: 16, h: 9.5 },
};

export default function BrollLayoutIcon({ layout, color }: { layout: string; color: string }) {
  const frame = (
    <rect x="0.5" y="0.5" width="17" height="31" rx="3" fill="none" stroke={color} strokeOpacity="0.45" />
  );
  // Auto = the AI mixes layouts: show three small tiles
  if (layout === "auto" || !(layout in RECTS)) {
    return (
      <svg width="18" height="32" viewBox="0 0 18 32" aria-hidden="true">
        {frame}
        <rect x="2" y="2" width="14" height="8" rx="1.5" fill={color} fillOpacity="0.55" />
        <rect x="2" y="22" width="14" height="8" rx="1.5" fill={color} fillOpacity="0.35" />
        <rect x="10" y="12" width="6" height="8" rx="1.5" fill={color} fillOpacity="0.8" />
      </svg>
    );
  }
  const r = RECTS[layout as Exclude<Layout, "auto">];
  return (
    <svg width="18" height="32" viewBox="0 0 18 32" aria-hidden="true">
      {frame}
      {/* speaker's head, so it's clear what stays visible */}
      <circle cx="9" cy="14.5" r="3" fill={color} fillOpacity="0.25" />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="2" fill={color} fillOpacity="0.75" />
    </svg>
  );
}
