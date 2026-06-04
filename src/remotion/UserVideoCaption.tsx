// Browser copy of the Lambda composition — keep in sync with
// clipfrom-remotion/src/UserVideoCaption.tsx.
// Key difference: uses <Video> instead of <OffthreadVideo> so it
// works inside @remotion/player in the browser.

import React from "react";
import { Audio, Video, Sequence, interpolate, useCurrentFrame } from "remotion";

export type CaptionStyle = "pill" | "bold" | "lower-third" | "none";

export interface TranscriptWord {
  word: string;
  startFrame: number;
  endFrame: number;
  type: string;
  is_filler?: boolean;
}

export interface BrollSegment {
  from: number;
  durationInFrames: number;
  clipUrl: string;
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
  keepSegments?: KeepSegment[];
}

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

function findActiveWordIndex(words: TranscriptWord[], frame: number): number {
  const active = words.findIndex(w => frame >= w.startFrame && frame <= w.endFrame);
  if (active >= 0) return active;
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
    const frameInWord = frame - w.startFrame;
    const punch =
      isActive && frameInWord >= 0 && frameInWord < 8
        ? interpolate(frameInWord, [0, 4, 8], [1.14, 1.07, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 1.0;

    if (captionStyle === "bold") {
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
          {w.word}
        </span>
      );
    }

    if (captionStyle === "lower-third") {
      return (
        <span key={idx} style={{
          marginRight: 8,
          color: isActive ? "#E89054" : "#ffffff",
          fontWeight: isActive ? 800 : 600,
          fontFamily: FONT,
        }}>
          {w.word}
        </span>
      );
    }

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
        {w.word}
      </span>
    );
  });
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

  const sourceWords = transcriptWords.filter(w => w.type === "word");
  const words = keepSegments && keepSegments.length > 0
    ? remapWordsToOutput(sourceWords, keepSegments)
    : sourceWords;
  const activeIndex = words.length > 0 ? findActiveWordIndex(words, frame) : -1;

  const captionOpacity = activeIndex >= 0
    ? interpolate(frame, [words[activeIndex].startFrame, words[activeIndex].startFrame + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const captionTranslateY = activeIndex >= 0
    ? interpolate(frame, [words[activeIndex].startFrame, words[activeIndex].startFrame + 8], [16, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 16;

  return (
    <div style={{ width: "100%", height: "100%", background: "#000", position: "relative" }}>

      {videoUrl && (
        keepSegments && keepSegments.length > 0 ? (
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
        )
      )}

      {brollSegments.map((seg, i) => (
        <Sequence key={i} from={seg.from} durationInFrames={seg.durationInFrames}>
          <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>
            <Video
              src={seg.clipUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </Sequence>
      ))}

      {musicUrl && <Audio src={musicUrl} volume={0.12} />}

      {captionStyle !== "none" && activeIndex >= 0 && (() => {
        if (captionStyle === "lower-third") {
          return (
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "rgba(0,0,0,0.65)", padding: "28px 48px",
              opacity: captionOpacity,
              transform: `translateY(${captionTranslateY}px)`,
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
            position: "absolute", bottom: "12%", left: "50%",
            transform: `translateX(-50%) translateY(${captionTranslateY}px)`,
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
