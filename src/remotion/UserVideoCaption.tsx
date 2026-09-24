// Browser copy of the Lambda composition — keep in sync with
// clipfrom-remotion/src/UserVideoCaption.tsx.
// Key difference: uses <Video> instead of <OffthreadVideo> so it
// works inside @remotion/player in the browser.

import React from "react";
import { Audio, Easing, Video, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type CaptionStyle = "pill" | "bold" | "lower-third" | "none";

export interface TranscriptWord {
  word: string;
  startFrame: number;
  endFrame: number;
  type: string;
  is_filler?: boolean;
  is_emphasis?: boolean;
}

export type BrollLayout =
  | "fullscreen"
  | "top-three-quarters"
  | "top-two-thirds"
  | "top-half"
  | "top-third"
  | "bottom-third"
  | "floating"
  | "corner";

export interface BrollSegment {
  from: number;
  durationInFrames: number;
  clipUrl: string;
  layout?: BrollLayout;
}

export interface KeepSegment {
  source_start_frame: number;
  source_end_frame: number;
}

export interface UserVideoCaptionProps {
  videoUrl: string;
  transcriptWords: TranscriptWord[];
  brollSegments: BrollSegment[];
  captionStyle?: CaptionStyle;
  musicUrl?: string;
  keepSegments?: KeepSegment[]; // when present, video is cut into these source ranges sequenced back-to-back
  durationInFrames?: number; // total render length; consumed by calculateMetadata in Root.tsx
}

// Remap source-coordinate words to output coordinates given a set of kept segments.
// Words whose startFrame falls in a removed segment are dropped entirely.
function remapWordsToOutput(words: TranscriptWord[], keepSegments: KeepSegment[]): TranscriptWord[] {
  const remapped: TranscriptWord[] = [];
  let cumulativeOutput = 0;
  for (const seg of keepSegments) {
    const segLen = seg.source_end_frame - seg.source_start_frame;
    for (const w of words) {
      if (w.startFrame >= seg.source_start_frame && w.startFrame < seg.source_end_frame) {
        remapped.push({
          ...w,
          startFrame: cumulativeOutput + (w.startFrame - seg.source_start_frame),
          endFrame: cumulativeOutput + Math.min(w.endFrame - seg.source_start_frame, segLen),
        });
      }
    }
    cumulativeOutput += segLen;
  }
  return remapped;
}

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const WINDOW_SIZE = 3;

const EMPHASIS_WORDS = new Set([
  "never","always","first","last","only","best","worst","most","least",
  "billion","million","trillion","zero","hundred","thousand",
  "impossible","secret","actually","literally","absolutely",
  "incredible","massive","huge","tiny","perfect","broken","failed",
  "hate","love","amazing","terrible","biggest","fastest","slowest",
  "immediately","instantly","suddenly","exactly","guaranteed","free",
  "new","now","stop","start","change","dead","live","win","lose",
  "true","false","wrong","right","real","fake","raw","pure",
]);

function isEmphasis(w: TranscriptWord): boolean {
  if (w.is_emphasis) return true;
  const raw = w.word;
  const clean = raw.replace(/[^a-zA-Z0-9%$]/g, "");
  if (/\d/.test(raw)) return true;
  if (clean.length >= 2 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) return true;
  return EMPHASIS_WORDS.has(clean.toLowerCase());
}

// ── Auto-zoom ─────────────────────────────────────────────────────────────────
// Punch-ins land on the lines that matter: words flagged is_emphasis by the
// pipeline's art director (hook, key terms, punchlines, CTA). Each punch snaps in
// fast, holds, then eases back out. Between punches the frame "breathes" with a
// barely-perceptible drift so the shot never feels static.
// Fallback for renders without a plan: punch on the first word after a long pause.
const PUNCH_IN      = 5;    // frames to snap in
const PUNCH_HOLD    = 35;   // frames held at full zoom
const PUNCH_OUT     = 20;   // frames to ease back out
const PUNCH_SCALES  = [1.18, 1.12, 1.22]; // varied so consecutive punches don't feel mechanical
const MIN_PUNCH_GAP = 60;   // frames (2s) between punches
const DRIFT_AMOUNT  = 0.025;
const DRIFT_PERIOD  = 240;  // frames (8s) per breath

function computePunchFrames(words: TranscriptWord[]): number[] {
  const flagged = words.filter(w => w.is_emphasis).map(w => w.startFrame);
  const candidates = flagged.length > 0
    ? flagged
    : words.filter((w, i) => i > 0 && w.startFrame - words[i - 1].endFrame >= 20).map(w => w.startFrame);
  const minGap = flagged.length > 0 ? MIN_PUNCH_GAP : 150;
  const punches: number[] = [];
  for (const f of [...candidates].sort((x, y) => x - y)) {
    if (punches.length === 0 || f - punches[punches.length - 1] >= minGap) punches.push(f);
  }
  return punches;
}

function getZoomScale(punches: number[], frame: number): number {
  const drift = 1 + DRIFT_AMOUNT * (0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / DRIFT_PERIOD));
  let k = -1;
  for (let i = 0; i < punches.length && punches[i] <= frame; i++) k = i;
  if (k < 0) return drift;
  const t = frame - punches[k];
  const peak = PUNCH_SCALES[k % PUNCH_SCALES.length];
  let punch: number;
  if (t < PUNCH_IN) {
    punch = interpolate(t, [0, PUNCH_IN], [1, peak], { easing: Easing.out(Easing.cubic) });
  } else if (t < PUNCH_IN + PUNCH_HOLD) {
    punch = peak;
  } else {
    punch = interpolate(t, [PUNCH_IN + PUNCH_HOLD, PUNCH_IN + PUNCH_HOLD + PUNCH_OUT], [peak, 1], {
      easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp",
    });
  }
  return punch * drift;
}

function findActiveWordIndex(words: TranscriptWord[], frame: number): number {
  const active = words.findIndex(w => frame >= w.startFrame && frame <= w.endFrame);
  if (active >= 0) return active;
  // Between words: return the last word that has already ended
  let last = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].endFrame < frame) last = i;
    else break;
  }
  return last;
}

function renderWords(
  words: TranscriptWord[],
  frame: number,
  captionStyle: CaptionStyle,
  activeIndex: number
): React.ReactNode {
  const winStart = Math.max(0, Math.min(activeIndex - 1, words.length - WINDOW_SIZE));
  const winEnd = Math.min(words.length - 1, winStart + WINDOW_SIZE - 1);

  return words.slice(winStart, winEnd + 1).map((w, i) => {
    const idx = winStart + i;
    const isActive = idx === activeIndex;
    const emph = isActive && isEmphasis(w);
    const frameInWord = frame - w.startFrame;

    const punch = isActive && frameInWord >= 0
      ? emph
        ? interpolate(frameInWord, [0, 3, 10, 18], [1.4, 1.38, 1.2, 1.0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          })
        : interpolate(frameInWord, [0, 4, 8], [1.14, 1.07, 1.0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          })
      : 1.0;

    if (captionStyle === "bold") {
      return (
        <span key={idx} style={{
          display: "inline-block",
          color: emph ? "#FFFFFF" : isActive ? "#F5C518" : "#ffffff",
          fontWeight: isActive ? 900 : 700,
          fontFamily: FONT,
          textShadow: emph
            ? "0 0 20px #F5C518, 0 0 40px rgba(245,197,24,0.6), 0 2px 14px rgba(0,0,0,1)"
            : "0 2px 14px rgba(0,0,0,1), 0 0 32px rgba(0,0,0,0.95)",
          margin: "0 5px",
          transform: isActive ? `scale(${punch})` : "none",
          transformOrigin: "center",
        }}>
          {w.word}
        </span>
      );
    }

    if (captionStyle === "lower-third") {
      return (
        <span key={idx} style={{
          display: "inline-block",
          marginRight: 8,
          color: emph ? "#FFFFFF" : isActive ? "#E89054" : "#ffffff",
          fontWeight: emph ? 900 : isActive ? 800 : 600,
          fontFamily: FONT,
          textShadow: emph ? "0 0 16px #E89054, 0 0 32px rgba(232,144,84,0.5)" : "none",
          transform: emph ? `scale(${punch})` : "none",
          transformOrigin: "center",
        }}>
          {w.word}
        </span>
      );
    }

    // pill — emphasis: white bg + orange text + orange glow ring
    return (
      <span key={idx} style={{
        display: "inline-block",
        background: emph ? "#FFFFFF" : isActive ? "#E89054" : "transparent",
        color: emph ? "#E89054" : "#ffffff",
        borderRadius: isActive ? 8 : 0,
        padding: isActive ? "5px 16px" : "5px 8px",
        margin: "3px",
        fontWeight: emph ? 900 : isActive ? 800 : 600,
        fontFamily: FONT,
        textShadow: isActive ? "none" : "0 1px 10px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9)",
        boxShadow: emph ? "0 0 0 3px #E89054, 0 0 20px rgba(232,144,84,0.5)" : "none",
        transform: isActive ? `scale(${punch})` : "none",
        transformOrigin: "center",
      }}>
        {w.word}
      </span>
    );
  });
}

// ── B-roll overlay panel ──────────────────────────────────────────────────────
// Renders B-roll in one of eight layouts while the talking head keeps playing
// beneath. Each layout has its own entrance (bands slide, corners pop, full screen
// punches in), clips get a slow Ken Burns push, and for top bands the speaker is
// reframed into the visible strip so their face stays on screen.

const W = 1080;
const H = 1920;
// Typical face height in a phone talking head (measured ~0.45 on real uploads).
const FACE_Y = H * 0.45;

interface Rect { top: number; left: number; width: number; height: number; radius: string }

function layoutRect(layout: BrollLayout): Rect {
  switch (layout) {
    case "fullscreen":         return { top: 0, left: 0, width: W, height: H, radius: "0" };
    case "top-three-quarters": return { top: 0, left: 0, width: W, height: 1344, radius: "0 0 48px 48px" };
    case "top-two-thirds":     return { top: 0, left: 0, width: W, height: 1280, radius: "0 0 48px 48px" };
    case "top-half":           return { top: 0, left: 0, width: W, height: 960, radius: "0 0 40px 40px" };
    case "top-third":          return { top: 0, left: 0, width: W, height: 640, radius: "0 0 40px 40px" };
    case "bottom-third":       return { top: H - 640, left: 0, width: W, height: 640, radius: "40px 40px 0 0" };
    case "corner":             return { top: 120, left: W - 36 - 306, width: 306, height: 544, radius: "28px" };
    case "floating":
    default:                   return { top: 80, left: 36, width: W - 72, height: 570, radius: "40px" };
  }
}

const isTopBand = (l: BrollLayout) =>
  l === "top-three-quarters" || l === "top-two-thirds" || l === "top-half" || l === "top-third";

// 0 → 1 as the overlay enters, back to 0 as it leaves. Shared by the overlay and
// by the speaker reframe / caption move so everything travels together.
function brollPresence(local: number, duration: number, fps: number): number {
  if (local < 0 || local >= duration) return 0;
  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.6 }, durationInFrames: 14 });
  const exit = interpolate(local, [duration - 12, duration], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic),
  });
  return Math.max(0, Math.min(1, enter - exit));
}

const BrollOverlay: React.FC<{ clipUrl: string; durationInFrames: number; layout?: BrollLayout; index: number }> = ({
  clipUrl, durationInFrames, layout = "floating", index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rect = layoutRect(layout);
  const presence = brollPresence(frame, durationInFrames, fps);

  let transform = "none";
  let opacity = 1;
  if (layout === "fullscreen") {
    const enter = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
    const exit = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    opacity = Math.min(enter, exit);
    transform = `scale(${1.08 - 0.08 * enter})`;
  } else if (isTopBand(layout)) {
    transform = `translateY(${-rect.height * (1 - presence)}px)`;
  } else if (layout === "bottom-third") {
    transform = `translateY(${rect.height * (1 - presence)}px)`;
  } else {
    // corner / floating: springy pop
    const pop = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
    const exit = interpolate(frame, [durationInFrames - 10, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    transform = `scale(${(0.6 + 0.4 * pop) * (1 - 0.3 * exit)})`;
    opacity = Math.min(1, pop * 1.5) * (1 - exit);
  }

  // Ken Burns: alternate push-in / pull-out so consecutive clips don't feel identical
  const kb = interpolate(frame, [0, durationInFrames], index % 2 === 0 ? [1.0, 1.08] : [1.08, 1.0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div style={{
      position: "absolute", zIndex: 5, overflow: "hidden",
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      borderRadius: rect.radius,
      boxShadow: layout === "fullscreen" ? "none" : "0 12px 48px rgba(0,0,0,0.75), 0 0 0 3px rgba(255,255,255,0.08)",
      transform, transformOrigin: layout === "corner" ? "top right" : "center", opacity,
    }}>
      <Video
        src={clipUrl}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kb})` }}
      />
    </div>
  );
};

// Where the active overlay (if any) wants the speaker and captions this frame.
function activeBrollState(segments: BrollSegment[], frame: number, fps: number) {
  for (const seg of segments) {
    const local = frame - seg.from;
    if (local < 0 || local >= seg.durationInFrames) continue;
    const layout = seg.layout ?? "floating";
    return { layout, presence: brollPresence(local, seg.durationInFrames, fps), rect: layoutRect(layout) };
  }
  return null;
}

export const UserVideoCaption: React.FC<UserVideoCaptionProps> = ({
  videoUrl,
  transcriptWords = [],
  brollSegments = [],
  captionStyle = "pill",
  musicUrl,
  keepSegments,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Only render word-type tokens for captions, then optionally remap to output coordinates
  const words = React.useMemo(() => {
    const sourceWords = transcriptWords.filter(w => w.type === "word");
    return keepSegments && keepSegments.length > 0 ? remapWordsToOutput(sourceWords, keepSegments) : sourceWords;
  }, [transcriptWords, keepSegments]);
  const activeIndex = words.length > 0 ? findActiveWordIndex(words, frame) : -1;
  const punches = React.useMemo(() => computePunchFrames(words), [words]);
  const zoomScale = getZoomScale(punches, frame);

  // Top-band B-roll pushes the speaker down into the visible strip (face stays on
  // screen) and moves captions onto the seam; a bottom band lifts captions above it.
  const broll = activeBrollState(brollSegments, frame, fps);
  const DEFAULT_CAPTION_Y = H * 0.88 - 50;
  let speakerShift = 0;
  let captionY = DEFAULT_CAPTION_Y;
  if (broll && isTopBand(broll.layout)) {
    speakerShift = ((broll.rect.height + H) / 2 - FACE_Y) * broll.presence;
    captionY = interpolate(broll.presence, [0, 1], [DEFAULT_CAPTION_Y, broll.rect.height]);
  } else if (broll && broll.layout === "bottom-third") {
    captionY = interpolate(broll.presence, [0, 1], [DEFAULT_CAPTION_Y, broll.rect.top - 80]);
  }
  const lowerThirdLift = broll && broll.layout === "bottom-third" ? broll.rect.height * broll.presence : 0;

  // Animate only when the visible window shifts (every ~3 words), not on every word.
  const winStart = activeIndex >= 0
    ? Math.max(0, Math.min(activeIndex - 1, words.length - WINDOW_SIZE))
    : 0;
  const windowEntryFrame = words[winStart]?.startFrame ?? 0;
  const captionOpacity = activeIndex >= 0
    ? interpolate(frame, [windowEntryFrame, windowEntryFrame + 6], [0, 1], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", position: "relative" }}>

      {/* Base: user's talking head with auto-zoom — overflow hidden clips zoomed edges */}
      {videoUrl && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            transform: `translateY(${speakerShift}px) scale(${zoomScale})`,
            transformOrigin: "50% 45%", // on the face (see FACE_Y) so punch-ins keep it in frame
          }}>
            {keepSegments && keepSegments.length > 0 ? (
              (() => {
                let cursor = 0;
                return keepSegments.map((seg, i) => {
                  const segLen = seg.source_end_frame - seg.source_start_frame;
                  const from = cursor;
                  cursor += segLen;
                  return (
                    <Sequence key={`keep-${i}`} from={from} durationInFrames={segLen}>
                      <Video
                        src={videoUrl}
                        startFrom={seg.source_start_frame}
                        endAt={seg.source_end_frame}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </Sequence>
                  );
                });
              })()
            ) : (
              <Video
                src={videoUrl}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>
        </div>
      )}

      {/* B-roll overlays — layout per moment, talking head keeps playing beneath */}
      {brollSegments.map((seg, i) => (
        <Sequence key={i} from={seg.from} durationInFrames={seg.durationInFrames}>
          <BrollOverlay clipUrl={seg.clipUrl} durationInFrames={seg.durationInFrames} layout={seg.layout} index={i} />
        </Sequence>
      ))}

      {/* Background music bed */}
      {musicUrl && <Audio src={musicUrl} volume={0.12} />}

      {/* Caption overlay */}
      {captionStyle !== "none" && activeIndex >= 0 && (() => {
        if (captionStyle === "lower-third") {
          return (
            <div style={{
              position: "absolute", bottom: lowerThirdLift, left: 0, right: 0,
              background: "rgba(0,0,0,0.65)", padding: "28px 48px",
              opacity: captionOpacity,
              zIndex: 10, pointerEvents: "none",
            }}>
              <div style={{ fontSize: 36, fontFamily: FONT, lineHeight: 1.5, display: "flex", flexWrap: "wrap" }}>
                {renderWords(words, frame, captionStyle, activeIndex)}
              </div>
            </div>
          );
        }

        return (
          <div style={{
            position: "absolute", top: captionY, left: "50%",
            transform: "translate(-50%, -50%)",
            width: "88%", display: "flex", flexWrap: "wrap", justifyContent: "center",
            opacity: captionOpacity, zIndex: 10, pointerEvents: "none",
          }}>
            <div style={{ fontSize: 52, fontFamily: FONT, lineHeight: 1.3, display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
              {renderWords(words, frame, captionStyle, activeIndex)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
