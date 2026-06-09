import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { Player } from "@remotion/player";
import AppShell from "@/components/layout/AppShell";
import { supabase } from "@/lib/supabase";
import { UserVideoCaption } from "@/remotion/UserVideoCaption";
import type { TranscriptWord, KeepSegment, BrollLayout } from "@/remotion/UserVideoCaption";

const BROLL_LAYOUTS: { value: BrollLayout | "auto"; label: string; desc: string }[] = [
  { value: "auto",           label: "Auto",          desc: "Bottom + corner rotation — avoids face" },
  { value: "bottom-third",   label: "Bottom third",  desc: "Lower 33%, face always visible" },
  { value: "corner",         label: "Corner PiP",    desc: "Small top-right panel" },
  { value: "floating",       label: "Floating",      desc: "Framed panel with side margins" },
  { value: "top-third",      label: "Top third",     desc: "Upper 33%, face in lower portion" },
  { value: "top-half",       label: "Top half",      desc: "Upper 50%, face below" },
  { value: "top-two-thirds", label: "Top two-thirds", desc: "Upper 67%, small face strip" },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const CAPTION_STYLES = [
  { value: "pill",        label: "Pill",        desc: "Active word highlighted in orange" },
  { value: "bold",        label: "Bold",         desc: "Yellow karaoke word highlight" },
  { value: "lower-third", label: "Lower Third",  desc: "Subtitle bar at bottom" },
  { value: "none",        label: "Off",          desc: "No caption overlay" },
];

const SILENCE_BUFFER = 4; // frames, mirrors pipeline.ts buildKeepSegments

const C = {
  bg:            "oklch(14% 0.015 250)",
  surface:       "oklch(18% 0.015 250)",
  surfaceRaised: "oklch(21% 0.015 250)",
  accent:        "oklch(72% 0.17 280)",
  fg:            "oklch(96% 0.005 250)",
  fgMuted:       "oklch(65% 0.01 250)",
  fgDim:         "oklch(45% 0.01 250)",
  strokeSoft:    "oklch(100% 0 0 / 0.08)",
  strokeMed:     "oklch(100% 0 0 / 0.13)",
  green:         "#10b981",
  orange:        "#E89054",
  red:           "#ef4444",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(frame: number): string {
  const s = Math.floor(frame / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Mirrors pipeline.ts buildKeepSegments. overrides = set of word-only indices to keep.
function computeKeepSegments(
  words: TranscriptWord[],
  totalFrames: number,
  overrides: Set<number> = new Set()
): KeepSegment[] {
  const wordsOnly = words.filter(w => w.type === "word");
  const removeRanges = wordsOnly
    .map((w, idx) => ({ w, idx }))
    .filter(({ w, idx }) => w.is_filler && !overrides.has(idx))
    .map(({ w }) => ({
      start: Math.max(0, w.startFrame - SILENCE_BUFFER),
      end:   Math.min(totalFrames, w.endFrame + SILENCE_BUFFER),
    }));

  if (removeRanges.length === 0) return [{ source_start_frame: 0, source_end_frame: totalFrames }];

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

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none",
        background: on ? C.orange : C.strokeMed,
        cursor: "pointer", position: "relative", flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoStyle() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  const userEmail: string = location.state?.userEmail ?? "";
  const wordCount:  number = location.state?.wordCount  ?? 0;

  // DB-sourced
  const [videoUrl,        setVideoUrl]        = useState("");
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[]>([]);
  const [sourceDuration,  setSourceDuration]  = useState(1800);
  const [loading,         setLoading]         = useState(true);
  const [fetchError,      setFetchError]      = useState("");

  // User settings
  const [captionStyle,    setCaptionStyle]    = useState("pill");
  const [removeFillers,   setRemoveFillers]   = useState(false);
  const [brollLayout,     setBrollLayout]     = useState<BrollLayout | "auto">("auto");
  const [overrides,       setOverrides]       = useState<Set<number>>(new Set());
  const [showReview,      setShowReview]      = useState(false);
  const [saving,          setSaving]          = useState(false);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("ai_generations")
      .select("user_video_url, transcript_words, video_duration_frames")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setFetchError("Could not load project data."); setLoading(false); return; }
        setVideoUrl(data.user_video_url ?? "");
        setTranscriptWords(Array.isArray(data.transcript_words) ? data.transcript_words : []);
        setSourceDuration(data.video_duration_frames ?? 1800);
        setLoading(false);
      });
  }, [projectId]);

  // Derived
  const wordsOnly  = transcriptWords.filter(w => w.type === "word");
  const fillerList = wordsOnly.map((w, idx) => ({ ...w, wordIdx: idx })).filter(f => f.is_filler);
  const activeFillerCount   = fillerList.filter(f => !overrides.has(f.wordIdx)).length;
  const activeFillerSeconds = fillerList
    .filter(f => !overrides.has(f.wordIdx))
    .reduce((s, w) => s + (w.endFrame - w.startFrame) / 30, 0);

  const keepSegments = removeFillers && activeFillerCount > 0
    ? computeKeepSegments(transcriptWords, sourceDuration, overrides)
    : undefined;

  const outputDuration = keepSegments
    ? keepSegments.reduce((s, seg) => s + (seg.source_end_frame - seg.source_start_frame), 0)
    : sourceDuration;

  const removalPct = sourceDuration > 0
    ? Math.round((1 - outputDuration / sourceDuration) * 100)
    : 0;
  const tooMuchCut = removeFillers && removalPct > 50;

  const toggleOverride = (idx: number) =>
    setOverrides(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const handleGenerate = async () => {
    if (!projectId) return;
    setSaving(true);
    await supabase
      .from("ai_generations")
      .update({
        remove_fillers:   removeFillers,
        filler_overrides: [...overrides],
        broll_layout:     brollLayout === "auto" ? null : brollLayout,
      })
      .eq("project_id", projectId);
    setSaving(false);
    navigate(`/results/${projectId}`, {
      state: { projectId, userEmail, captionStyle, sourceMode: "video", captions: [], transitionStyle: "cut", videoSource: "user" },
    });
  };

  return (
    <AppShell>
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.fg,
        fontFamily: '"Geist", system-ui, sans-serif',
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "40px 24px", gap: 48, flexWrap: "wrap",
      }}>

        {/* ── Left: Player ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
            Live Preview
          </p>

          {loading ? (
            <div style={{ width: 270, height: 480, background: C.surface, borderRadius: 16, border: `1px solid ${C.strokeMed}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.fgDim, fontSize: 13 }}>
              Loading…
            </div>
          ) : fetchError ? (
            <div style={{ width: 270, height: 480, background: C.surface, borderRadius: 16, border: `1px solid ${C.strokeMed}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontSize: 13, padding: 24, textAlign: "center" }}>
              {fetchError}
            </div>
          ) : videoUrl ? (
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
          ) : (
            <div style={{ width: 270, height: 480, background: C.surface, borderRadius: 16, border: `1px solid ${C.strokeMed}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.fgDim, fontSize: 13 }}>
              No video
            </div>
          )}

          {/* Filler summary under Player */}
          {!loading && fillerList.length > 0 && (
            <p style={{ fontSize: 12, color: C.fgDim, margin: 0, textAlign: "center" }}>
              {removeFillers
                ? activeFillerCount > 0
                  ? `Removing ${activeFillerCount} filler${activeFillerCount !== 1 ? "s" : ""} · saves ${activeFillerSeconds.toFixed(1)}s`
                  : "No fillers will be removed"
                : `${fillerList.length} filler word${fillerList.length !== 1 ? "s" : ""} detected`}
            </p>
          )}
        </div>

        {/* ── Right: Controls ───────────────────────────────────────────── */}
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
              {wordCount > 0 ? `${wordCount} words transcribed · ` : ""}Preview updates live as you adjust settings.
            </p>
          </div>

          {/* Caption style picker */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, margin: "0 0 10px" }}>
              Caption Style
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CAPTION_STYLES.map(style => {
                const sel = captionStyle === style.value;
                return (
                  <button key={style.value} type="button" onClick={() => setCaptionStyle(style.value)} style={{
                    padding: "14px 16px",
                    border: `1.5px solid ${sel ? C.accent : C.strokeMed}`,
                    borderRadius: 12,
                    background: sel ? `oklch(72% 0.17 280 / 0.1)` : C.surface,
                    color: C.fg, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{style.label}</div>
                    <div style={{ color: C.fgDim, fontSize: 12, lineHeight: 1.4 }}>{style.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filler removal toggle — only shown if fillers exist */}
          {fillerList.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                background: C.surface, border: `1px solid ${C.strokeMed}`,
                borderRadius: removeFillers && showReview ? "12px 12px 0 0" : 12,
                padding: "14px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: C.fg }}>
                    Remove filler words
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: C.fgDim, lineHeight: 1.4 }}>
                    {fillerList.length} detected (um, uh, like…) · {fillerList.reduce((s, w) => s + (w.endFrame - w.startFrame) / 30, 0).toFixed(1)}s
                  </p>
                </div>
                <Toggle on={removeFillers} onChange={v => { setRemoveFillers(v); if (!v) setShowReview(false); }} />
              </div>

              {/* Expandable review list */}
              {removeFillers && (
                <div style={{
                  background: C.surface,
                  border: `1px solid ${C.strokeMed}`,
                  borderTop: `1px solid ${C.strokeSoft}`,
                  borderRadius: "0 0 12px 12px",
                  overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => setShowReview(v => !v)}
                    style={{
                      width: "100%", padding: "10px 16px",
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      color: C.fgMuted, fontSize: 12,
                    }}
                  >
                    <span>Review detected fillers</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ transform: showReview ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {showReview && (
                    <div style={{ maxHeight: 200, overflowY: "auto", padding: "0 16px 12px" }}>
                      {fillerList.map(f => {
                        const kept = overrides.has(f.wordIdx);
                        return (
                          <label
                            key={f.wordIdx}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "7px 0",
                              borderBottom: `1px solid ${C.strokeSoft}`,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!kept}
                              onChange={() => toggleOverride(f.wordIdx)}
                              style={{ accentColor: C.orange, width: 14, height: 14, cursor: "pointer" }}
                            />
                            <span style={{ fontSize: 13, color: kept ? C.fgDim : C.fg, textDecoration: kept ? "line-through" : "none", flex: 1 }}>
                              "{f.word}"
                            </span>
                            <span style={{ fontSize: 11, color: C.fgDim, fontVariantNumeric: "tabular-nums" }}>
                              {formatTs(f.startFrame)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* >50% cut warning */}
          {tooMuchCut && (
            <div style={{
              background: "oklch(30% 0.08 25 / 0.4)",
              border: `1px solid oklch(55% 0.15 25 / 0.5)`,
              borderRadius: 10, padding: "12px 14px", marginTop: 8, marginBottom: 8,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p style={{ margin: 0, fontSize: 13, color: "#fca5a5", lineHeight: 1.5 }}>
                <strong>This removes {removalPct}% of your video.</strong> Uncheck some fillers above to keep more of your content.
              </p>
            </div>
          )}

          {/* B-roll layout picker */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
              B-roll Layout
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {BROLL_LAYOUTS.map(opt => {
                const sel = brollLayout === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setBrollLayout(opt.value)} style={{
                    padding: "10px 8px",
                    border: `1.5px solid ${sel ? C.accent : C.strokeMed}`,
                    borderRadius: 10,
                    background: sel ? `oklch(72% 0.17 280 / 0.1)` : C.surface,
                    color: C.fg, cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{opt.label}</div>
                    <div style={{ color: C.fgDim, fontSize: 10, marginTop: 2, lineHeight: 1.3 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info blurb */}
          <div style={{
            background: C.surface, border: `1px solid ${C.strokeSoft}`,
            borderRadius: 12, padding: "14px 16px", marginTop: 16, marginBottom: 24,
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
            disabled={saving || loading || tooMuchCut}
            style={{
              width: "100%", padding: "14px",
              background: tooMuchCut ? C.strokeMed : C.accent,
              border: "none", borderRadius: 12,
              color: tooMuchCut ? C.fgDim : "oklch(14% 0.015 250)",
              fontSize: 15, fontWeight: 700,
              cursor: saving || tooMuchCut ? "not-allowed" : "pointer",
              letterSpacing: "-0.01em",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {saving ? "Saving settings…" : "Generate Final Video"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
