import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Player } from "@remotion/player";
import AppShell from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { UserVideoCaption } from "@/remotion/UserVideoCaption";
import type { TranscriptWord, KeepSegment } from "@/remotion/UserVideoCaption";

const CAPTION_STYLES = [
  { value: "pill",        label: "Pill",        desc: "Active word highlighted in orange" },
  { value: "bold",        label: "Bold",         desc: "Yellow karaoke word highlight" },
  { value: "lower-third", label: "Lower Third",  desc: "Subtitle bar at bottom" },
  { value: "none",        label: "Off",          desc: "No caption overlay" },
];

const SILENCE_BUFFER = 4; // frames, mirrors pipeline.ts

function computeKeepSegments(
  words: TranscriptWord[],
  totalFrames: number
): KeepSegment[] {
  const fillerWords = words.filter(w => w.type === "word" && w.is_filler);
  if (fillerWords.length === 0) return [{ source_start_frame: 0, source_end_frame: totalFrames }];

  const removeRanges = fillerWords.map(w => ({
    start: Math.max(0, w.startFrame - SILENCE_BUFFER),
    end:   Math.min(totalFrames, w.endFrame + SILENCE_BUFFER),
  }));

  const merged = removeRanges
    .sort((a, b) => a.start - b.start)
    .reduce<typeof removeRanges>((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && r.start <= last.end) { last.end = Math.max(last.end, r.end); return acc; }
      return [...acc, r];
    }, []);

  const keeps: KeepSegment[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) keeps.push({ source_start_frame: cursor, source_end_frame: r.start });
    cursor = r.end;
  }
  if (cursor < totalFrames) keeps.push({ source_start_frame: cursor, source_end_frame: totalFrames });
  return keeps;
}

const C = {
  bg:           "oklch(14% 0.015 250)",
  surface:      "oklch(18% 0.015 250)",
  surfaceRaised:"oklch(21% 0.015 250)",
  accent:       "oklch(72% 0.17 280)",
  fg:           "oklch(96% 0.005 250)",
  fgMuted:      "oklch(65% 0.01 250)",
  fgDim:        "oklch(45% 0.01 250)",
  strokeSoft:   "oklch(100% 0 0 / 0.08)",
  strokeMed:    "oklch(100% 0 0 / 0.13)",
  green:        "#10b981",
  orange:       "#E89054",
} as const;

export default function VideoStyle() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  const userEmail: string = location.state?.userEmail ?? "";
  const wordCount: number = location.state?.wordCount  ?? 0;

  const [captionStyle,   setCaptionStyle]   = useState("pill");
  const [removeFillers,  setRemoveFillers]  = useState(false);
  const [saving,         setSaving]         = useState(false);

  // Data from DB
  const [videoUrl,          setVideoUrl]          = useState<string>("");
  const [transcriptWords,   setTranscriptWords]   = useState<TranscriptWord[]>([]);
  const [sourceDuration,    setSourceDuration]    = useState(1800);
  const [fillerCount,       setFillerCount]        = useState(0);
  const [fillerSeconds,     setFillerSeconds]      = useState(0);
  const [loading,           setLoading]            = useState(true);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("ai_generations")
      .select("user_video_url, transcript_words, video_duration_frames")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const words: TranscriptWord[] = Array.isArray(data.transcript_words) ? data.transcript_words : [];
        const dur = data.video_duration_frames ?? 1800;
        const fillers = words.filter(w => w.type === "word" && w.is_filler);
        const secs = fillers.reduce((sum, w) => sum + (w.endFrame - w.startFrame) / 30, 0);

        setVideoUrl(data.user_video_url ?? "");
        setTranscriptWords(words);
        setSourceDuration(dur);
        setFillerCount(fillers.length);
        setFillerSeconds(Math.round(secs * 10) / 10);
        setLoading(false);
      });
  }, [projectId]);

  // Derived values for the Player
  const keepSegments = removeFillers && fillerCount > 0
    ? computeKeepSegments(transcriptWords, sourceDuration)
    : undefined;

  const outputDuration = keepSegments
    ? keepSegments.reduce((sum, s) => sum + (s.source_end_frame - s.source_start_frame), 0)
    : sourceDuration;

  const handleGenerate = async () => {
    if (!projectId) return;
    setSaving(true);
    // Persist filler removal setting to DB so the pipeline picks it up
    await supabase
      .from("ai_generations")
      .update({ remove_fillers: removeFillers })
      .eq("project_id", projectId);
    setSaving(false);

    navigate(`/results/${projectId}`, {
      state: {
        projectId,
        userEmail,
        captionStyle,
        sourceMode: "video",
        captions: [],
        transitionStyle: "cut",
        videoSource: "user",
      },
    });
  };

  return (
    <AppShell>
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.fg,
        fontFamily: '"Geist", system-ui, sans-serif',
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, gap: 48, flexWrap: "wrap",
      }}>

        {/* Left: Player preview */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
            Live Preview
          </p>

          {loading || !videoUrl ? (
            <div style={{
              width: 270, height: 480, background: C.surface,
              borderRadius: 16, border: `1px solid ${C.strokeMed}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.fgDim, fontSize: 13,
            }}>
              {loading ? "Loading…" : "No video"}
            </div>
          ) : (
            <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.strokeMed}` }}>
              <Player
                component={UserVideoCaption}
                inputProps={{
                  videoUrl,
                  transcriptWords,
                  brollSegments: [],
                  captionStyle: captionStyle as "pill" | "bold" | "lower-third" | "none",
                  keepSegments,
                }}
                durationInFrames={Math.max(1, outputDuration)}
                fps={30}
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: 270, height: 480 }}
                controls
              />
            </div>
          )}

          {!loading && fillerCount > 0 && (
            <p style={{ fontSize: 12, color: C.fgDim, margin: 0 }}>
              {removeFillers
                ? `${fillerCount} fillers removed · saves ${fillerSeconds}s`
                : `${fillerCount} fillers detected · ${fillerSeconds}s`}
            </p>
          )}
        </div>

        {/* Right: Controls */}
        <div style={{ maxWidth: 420, width: "100%" }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, background: C.green, borderRadius: "50%", boxShadow: `0 0 8px ${C.green}` }} />
              <span style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Transcript Ready
              </span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              Customise your video
            </h1>
            <p style={{ color: C.fgDim, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              {wordCount > 0 ? `${wordCount} words transcribed · ` : ""}Preview updates live.
            </p>
          </div>

          {/* Caption style picker */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Caption Style
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CAPTION_STYLES.map(style => {
                const isSelected = captionStyle === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setCaptionStyle(style.value)}
                    style={{
                      padding: "14px 16px",
                      border: `1.5px solid ${isSelected ? C.accent : C.strokeMed}`,
                      borderRadius: 12,
                      background: isSelected ? `oklch(72% 0.17 280 / 0.1)` : C.surface,
                      color: C.fg,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{style.label}</div>
                    <div style={{ color: C.fgDim, fontSize: 12, lineHeight: 1.4 }}>{style.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filler word removal toggle */}
          {fillerCount > 0 && (
            <div style={{
              background: C.surface, border: `1px solid ${C.strokeMed}`,
              borderRadius: 12, padding: "14px 16px", marginBottom: 24,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: C.fg }}>
                  Remove filler words
                </p>
                <p style={{ margin: 0, fontSize: 12, color: C.fgDim, lineHeight: 1.4 }}>
                  {fillerCount} detected (um, uh, like…) · saves {fillerSeconds}s
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRemoveFillers(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: "none",
                  background: removeFillers ? C.orange : C.strokeMed,
                  cursor: "pointer", position: "relative", flexShrink: 0,
                  transition: "background 0.2s",
                }}
                aria-checked={removeFillers}
                role="switch"
              >
                <span style={{
                  position: "absolute", top: 3,
                  left: removeFillers ? 23 : 3,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }} />
              </button>
            </div>
          )}

          {/* Info blurb */}
          <div style={{
            background: C.surface, border: `1px solid ${C.strokeSoft}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 24,
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.fgDim} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ margin: 0, fontSize: 13, color: C.fgMuted, lineHeight: 1.5 }}>
              The preview above shows exactly what will be rendered. Generating a final 9:16 MP4 usually takes <strong style={{ color: C.fg }}>2–4 minutes</strong> and uses 1 credit.
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={saving || loading}
            style={{
              width: "100%", padding: "14px",
              background: C.accent, border: "none", borderRadius: 12,
              color: "oklch(14% 0.015 250)", fontSize: 15, fontWeight: 700,
              cursor: saving ? "wait" : "pointer", letterSpacing: "-0.01em",
              opacity: saving || loading ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {saving ? "Saving settings…" : "Generate Final Video"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
