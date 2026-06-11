import React from "react";
import {
  Audio,
  Video,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

export type CaptionStyle = "pill" | "bold" | "lower-third" | "none";

export interface StudioCompositionProps {
  clips: string[];
  audioUrl?: string;
  captions: string[];
  captionStyle?: CaptionStyle;
  transitionStyle?: string;
  captionTimings?: number[];
  wordTimings?: number[][];
  musicUrl?: string;
}

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const CLIP_DURATION = 150;
const HOOK_DURATION = 45; // 1.5s hook before clips + audio

function resolveTransition(style: string = "fade") {
  switch (style) {
    case "slide": return { presentation: slide({ direction: "from-right" as const }), duration: 35 };
    case "wipe":  return { presentation: wipe({ direction: "from-bottom-left" as const }), duration: 35 };
    case "cut":   return { presentation: fade(), duration: 5 };
    default:      return { presentation: fade(), duration: 35 };
  }
}

function getColorGrade(style: CaptionStyle): string | null {
  switch (style) {
    case "pill":         return "rgba(255, 175, 80, 0.07)";
    case "bold":         return "rgba(80, 140, 255, 0.07)";
    case "lower-third":  return "rgba(255, 210, 120, 0.05)";
    default:             return null;
  }
}

const KEN_BURNS_CONFIG = [
  { startScale: 1.0,  endScale: 1.12, originX: "50%", originY: "50%" },
  { startScale: 1.12, endScale: 1.0,  originX: "30%", originY: "30%" },
  { startScale: 1.0,  endScale: 1.12, originX: "70%", originY: "65%" },
  { startScale: 1.12, endScale: 1.0,  originX: "50%", originY: "72%" },
  { startScale: 1.0,  endScale: 1.1,  originX: "35%", originY: "38%" },
];

// ── Hook frame ─────────────────────────────────────────────────────────────────

const HookFrame: React.FC<{ caption: string }> = ({ caption }) => {
  const frame = useCurrentFrame();
  const scaleIn = interpolate(frame, [0, 14], [0.92, 1.0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [HOOK_DURATION - 14, HOOK_DURATION + 8], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "linear-gradient(160deg, #0d0d0d 0%, #111 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0 64px", opacity,
      transform: `scale(${scaleIn})`,
      pointerEvents: "none",
    }}>
      <p style={{
        fontSize: 68, fontFamily: FONT, fontWeight: 900, color: "#ffffff",
        textAlign: "center", lineHeight: 1.25, margin: 0,
        textShadow: "0 4px 32px rgba(0,0,0,0.9), 0 0 80px rgba(0,0,0,0.6)",
      }}>
        {caption}
      </p>
    </div>
  );
};

// ── Word-level active index resolver ──────────────────────────────────────────

function resolveActiveWord(
  frame: number,
  startFrame: number,
  endFrame: number,
  wordCount: number,
  absWordFrames?: number[],
): { activeIndex: number; framesSinceChange: number } {
  if (absWordFrames && absWordFrames.length >= wordCount) {
    let activeIndex = wordCount - 1;
    for (let j = 0; j < wordCount; j++) {
      if (frame < absWordFrames[j]) { activeIndex = Math.max(0, j - 1); break; }
    }
    const wordStart = absWordFrames[activeIndex] ?? startFrame;
    return { activeIndex, framesSinceChange: frame - wordStart };
  }
  const framesPerWord = Math.max(endFrame - startFrame, 1) / wordCount;
  const frameInCaption = Math.max(frame - startFrame, 0);
  const activeIndex = Math.min(Math.floor(frameInCaption / framesPerWord), wordCount - 1);
  return { activeIndex, framesSinceChange: frameInCaption - activeIndex * framesPerWord };
}

// ── Word renderers ─────────────────────────────────────────────────────────────

const renderPillWords = (
  caption: string,
  frame: number,
  startFrame: number,
  endFrame: number,
  wordTimings?: number[],
  windowSize = 3,
): React.ReactNode => {
  const words = caption.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const absWordFrames = wordTimings?.map(t => t + HOOK_DURATION);
  const { activeIndex, framesSinceChange } = resolveActiveWord(frame, startFrame, endFrame, words.length, absWordFrames);
  const punch = framesSinceChange < 8
    ? interpolate(framesSinceChange, [0, 4, 8], [1.14, 1.07, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1.0;
  const winStart = Math.max(0, Math.min(activeIndex - 1, words.length - windowSize));
  const winEnd = Math.min(words.length - 1, winStart + windowSize - 1);
  return words.slice(winStart, winEnd + 1).map((word, i) => {
    const idx = winStart + i;
    const isActive = idx === activeIndex;
    return (
      <span key={idx} style={{
        display: "inline-block",
        background: isActive ? "#E89054" : "transparent",
        color: "#ffffff",
        borderRadius: isActive ? 8 : 0,
        padding: isActive ? "5px 16px" : "5px 8px",
        margin: "3px",
        fontWeight: isActive ? 800 : 600,
        fontFamily: FONT,
        textShadow: isActive ? "none" : "0 1px 10px rgba(0,0,0,1), 0 0 24px rgba(0,0,0,0.9)",
        transform: isActive ? `scale(${punch})` : "none",
        transformOrigin: "center",
      }}>
        {word}
      </span>
    );
  });
};

const renderBoldWords = (
  caption: string,
  frame: number,
  startFrame: number,
  endFrame: number,
  wordTimings?: number[],
  windowSize = 3,
): React.ReactNode => {
  const words = caption.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const absWordFrames = wordTimings?.map(t => t + HOOK_DURATION);
  const { activeIndex, framesSinceChange } = resolveActiveWord(frame, startFrame, endFrame, words.length, absWordFrames);
  const punch = framesSinceChange < 8
    ? interpolate(framesSinceChange, [0, 4, 8], [1.14, 1.07, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1.0;
  const winStart = Math.max(0, Math.min(activeIndex - 1, words.length - windowSize));
  const winEnd = Math.min(words.length - 1, winStart + windowSize - 1);
  return words.slice(winStart, winEnd + 1).map((word, i) => {
    const idx = winStart + i;
    const isActive = idx === activeIndex;
    return (
      <span key={idx} style={{
        display: "inline-block",
        color: isActive ? "#F5C518" : "#ffffff",
        fontWeight: isActive ? 900 : 700,
        fontFamily: FONT,
        textShadow: "0 2px 14px rgba(0,0,0,1), 0 0 32px rgba(0,0,0,0.95)",
        margin: "0 5px",
        transform: isActive ? `scale(${punch})` : "none",
        transformOrigin: "center",
      }}>
        {word}
      </span>
    );
  });
};

// ── ClipSegment ────────────────────────────────────────────────────────────────

const ClipSegment: React.FC<{ videoUrl: string; clipIndex: number }> = ({ videoUrl, clipIndex }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { startScale, endScale, originX, originY } = KEN_BURNS_CONFIG[clipIndex % KEN_BURNS_CONFIG.length];
  const scale = interpolate(frame, [0, durationInFrames], [startScale, endScale], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
      {videoUrl ? (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          <Video src={videoUrl} style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${scale})`,
            transformOrigin: `${originX} ${originY}`,
          }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111", color: "#555", fontSize: 32, fontFamily: "system-ui" }}>
          No video
        </div>
      )}
    </div>
  );
};

// ── CaptionOverlay ─────────────────────────────────────────────────────────────

const CaptionOverlay: React.FC<{
  caption: string;
  captionStyle: CaptionStyle;
  opacity: number;
  translateY: number;
  frame: number;
  startFrame: number;
  endFrame: number;
  wordTimings?: number[];
}> = ({ caption, captionStyle, opacity, translateY, frame, startFrame, endFrame, wordTimings }) => {
  if (!caption || captionStyle === "none") return null;

  if (captionStyle === "bold") {
    return (
      <div style={{ position: "absolute", bottom: "12%", left: "50%", transform: `translateX(-50%) translateY(${translateY}px)`, width: "88%", display: "flex", flexWrap: "wrap", justifyContent: "center", opacity, pointerEvents: "none" }}>
        <p style={{ margin: 0, fontSize: 52, fontFamily: FONT, lineHeight: 1.3, textAlign: "center", display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
          {renderBoldWords(caption, frame, startFrame, endFrame, wordTimings)}
        </p>
      </div>
    );
  }

  if (captionStyle === "lower-third") {
    const words = caption.split(" ").filter(Boolean);
    const absWordFrames = wordTimings?.map(t => t + HOOK_DURATION);
    const { activeIndex: activeIdx } = resolveActiveWord(frame, startFrame, endFrame, words.length, absWordFrames);
    return (
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.65)", padding: "28px 48px", opacity, transform: `translateY(${translateY}px)`, pointerEvents: "none" }}>
        <div style={{ fontSize: 36, fontFamily: FONT, lineHeight: 1.5, textAlign: "left", display: "flex", flexWrap: "wrap" }}>
          {words.map((word, i) => (
            <span key={i} style={{ marginRight: 8, color: i === activeIdx ? "#E89054" : "#ffffff", fontWeight: i === activeIdx ? 800 : 600 }}>
              {word}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", bottom: "12%", left: "50%", transform: `translateX(-50%) translateY(${translateY}px)`, width: "88%", display: "flex", flexWrap: "wrap", justifyContent: "center", opacity, pointerEvents: "none" }}>
      <div style={{ fontSize: 52, fontFamily: FONT, lineHeight: 1.3, display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
        {renderPillWords(caption, frame, startFrame, endFrame, wordTimings)}
      </div>
    </div>
  );
};

// ── StudioComposition (root) ───────────────────────────────────────────────────

export const StudioComposition: React.FC<StudioCompositionProps> = ({
  clips,
  audioUrl,
  captions,
  captionStyle = "pill",
  captionTimings,
  wordTimings,
  transitionStyle = "fade",
  musicUrl,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const transition = resolveTransition(transitionStyle);

  const rawStartFrames: number[] = (() => {
    if (captionTimings && captionTimings.length === captions.length) return captionTimings;
    const wordCounts = captions.map(c => c.split(" ").filter(Boolean).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;
    let cumulative = 0;
    return wordCounts.map(w => {
      const f = Math.round((cumulative / totalWords) * (durationInFrames - HOOK_DURATION));
      cumulative += w;
      return f;
    });
  })();

  const startFrames = rawStartFrames.map(t => t + HOOK_DURATION);
  const endFrames = [...startFrames.slice(1), durationInFrames];
  const colorGrade = getColorGrade(captionStyle);

  const clipDurations = (() => {
    if (!captionTimings || !captionTimings.some(t => t > 0)) {
      return Array(clips.length).fill(CLIP_DURATION) as number[];
    }
    return startFrames.map((start, i) => {
      const end = i < startFrames.length - 1 ? startFrames[i + 1] : durationInFrames;
      const raw = end - start + (i < startFrames.length - 1 ? transition.duration : 0);
      return Math.max(raw, transition.duration + 30);
    });
  })();

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", position: "relative" }}>

      {/* Hook frame — scales in, fades out into first clip */}
      <Sequence from={0} durationInFrames={HOOK_DURATION + 10}>
        <HookFrame caption={captions[0]} />
      </Sequence>

      {musicUrl && <Audio src={musicUrl} volume={0.12} />}

      {audioUrl && (
        <Sequence from={HOOK_DURATION}>
          <Audio src={audioUrl} />
        </Sequence>
      )}

      <Sequence from={HOOK_DURATION}>
        <TransitionSeries>
          {clips.map((videoUrl, i) => (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={clipDurations[i]}>
                <ClipSegment videoUrl={videoUrl} clipIndex={i} />
              </TransitionSeries.Sequence>
              {i < clips.length - 1 && (
                <TransitionSeries.Transition
                  timing={springTiming({ durationInFrames: transition.duration })}
                  presentation={transition.presentation}
                />
              )}
            </React.Fragment>
          ))}
        </TransitionSeries>
      </Sequence>

      {colorGrade && (
        <div style={{ position: "absolute", inset: 0, background: colorGrade, pointerEvents: "none" }} />
      )}

      {captionStyle !== "none" && captions.map((caption, i) => {
        const start = startFrames[i];
        const end = Math.max(endFrames[i], start + 21);
        const opacity = interpolate(frame, [start, start + 10, end - 10, end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const translateY = interpolate(frame, [start, start + 10], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <CaptionOverlay
            key={i}
            caption={caption}
            captionStyle={captionStyle}
            opacity={opacity}
            translateY={translateY}
            frame={frame}
            startFrame={start}
            endFrame={end}
            wordTimings={wordTimings?.[i]}
          />
        );
      })}
    </div>
  );
};
