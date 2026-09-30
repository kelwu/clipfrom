import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ESTIMATES } from "@/lib/estimates";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import UpgradeModal from "@/components/UpgradeModal";
import { useCredits } from "@/lib/useCredits";
import { usePreferences } from "@/lib/usePreferences";

const C = {
  bg: "oklch(10% 0.018 255)",
  accent: "oklch(72% 0.17 280)",
  surface: "oklch(18% 0.015 250)",
  surfaceRaised: "oklch(21% 0.015 250)",
  stroke: "oklch(100% 0 0 / 0.08)",
  strokeMed: "oklch(100% 0 0 / 0.13)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(82% 0.01 250)",
} as const;

type CaptionStyle = "pill" | "bold" | "lower-third" | "none";
type BrollLayout = "auto" | "fullscreen" | "top-three-quarters" | "top-half" | "bottom-third" | "corner" | "floating";

interface Segment {
  id: string;
  segment_index: number;
  start_frame: number;
  end_frame: number;
  title: string;
  summary: string;
  status: string;
}

const NUDGE_FRAMES = 5 * 30;
const MIN_LEN_FRAMES = 15 * 30;
const MAX_LEN_FRAMES = 120 * 30;

// Plays just one highlight from the source video (stops at its end)
function SegmentPreview({ src, start, end }: { src: string; start: number; end: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      onLoadedMetadata={() => { if (ref.current) { ref.current.currentTime = start / 30; ref.current.play().catch(() => {}); } }}
      onTimeUpdate={() => { const v = ref.current; if (v && v.currentTime >= end / 30) { v.pause(); v.currentTime = start / 30; } }}
      className="w-full rounded-xl mt-3"
      style={{ maxHeight: 320, background: "#000" }}
    />
  );
}

function frameToTimestamp(frame: number): string {
  const totalSec = Math.round(frame / 30);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CAPTION_STYLES: { value: CaptionStyle; label: string; desc: string }[] = [
  { value: "pill", label: "Pill", desc: "Orange highlight pill on active word" },
  { value: "bold", label: "Bold", desc: "Yellow punch on active word" },
  { value: "lower-third", label: "Lower third", desc: "Subtitle bar at bottom" },
  { value: "none", label: "None", desc: "No captions" },
];

const BROLL_LAYOUTS: { value: BrollLayout; label: string }[] = [
  { value: "auto", label: "Auto (AI)" },
  { value: "fullscreen", label: "Full screen" },
  { value: "top-three-quarters", label: "Top ¾" },
  { value: "top-half", label: "Top half" },
  { value: "bottom-third", label: "Bottom third" },
  { value: "corner", label: "Corner PiP" },
  { value: "floating", label: "Floating panel" },
];

const Spinner = ({ size = 14 }: { size?: number }) => (
  <svg className="animate-spin" width={size} height={size} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function HighlightPicker() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { session, user } = useAuth();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("pill");
  const [brollLayout, setBrollLayout] = useState<BrollLayout>("auto");
  const [analyzing, setAnalyzing] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { outOfCredits } = useCredits();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { prefs } = usePreferences();
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (!prefs || prefsApplied.current) return;
    prefsApplied.current = true;
    if (prefs.captionStyle) setCaptionStyle(prefs.captionStyle);
    if (prefs.brollLayout) setBrollLayout(prefs.brollLayout as BrollLayout);
  }, [prefs]);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Start/end the user nudged, saved when they generate
  const [edits, setEdits] = useState<Record<string, { start: number; end: number }>>({});
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const hasFetchedRef = useRef(false);

  const { session: _s } = useAuth();
  const userEmail = user?.email ?? "";

  useEffect(() => {
    if (!projectId || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    extractHighlights();
    supabase.from("ai_generations").select("user_video_url").eq("project_id", projectId).maybeSingle()
      .then(({ data }) => setSourceUrl(data?.user_video_url ?? null));
  }, [projectId]);

  // regenerate=false returns the saved picks (reopening never wipes them)
  async function extractHighlights(regenerate = false) {
    setAnalyzing(true);
    setError(null);
    setConfirmRegenerate(false);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-highlights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ project_id: projectId, regenerate }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Extract failed: ${res.status}`);
      }
      const { segments: segs } = await res.json() as { segments: Segment[] };
      setSegments(segs.sort((a, b) => a.segment_index - b.segment_index));
      setRemovedIds(new Set());
      setEdits({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze video";
      setError(msg);
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    if (!projectId) return;
    const kept = segments.filter(s => !removedIds.has(s.id));
    if (kept.length === 0) { toast.error("Select at least one highlight to generate"); return; }

    // Check credits before touching anything, so the user's picks survive an upgrade detour
    if (outOfCredits) { setShowUpgrade(true); return; }
    setGenerating(true);

    // Remove unwanted highlights and save any start/end adjustments
    if (removedIds.size > 0) {
      await supabase.from("video_segments").delete().in("id", [...removedIds]);
    }
    for (const seg of kept) {
      const e = edits[seg.id];
      if (e && (e.start !== seg.start_frame || e.end !== seg.end_frame)) {
        await supabase.from("video_segments").update({ start_frame: e.start, end_frame: e.end }).eq("id", seg.id);
      }
    }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trigger-highlights-render`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            project_id: projectId,
            captionStyle,
            broll_layout: brollLayout === "auto" ? null : brollLayout,
            user_email: userEmail,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "no_credits") { setShowUpgrade(true); setGenerating(false); return; }
        throw new Error(body.error ?? `Failed to start render: ${res.status}`);
      }
      navigate(`/results/${projectId}`, { state: { sourceMode: "long_video", userEmail } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start render";
      toast.error(msg);
      setGenerating(false);
    }
  }

  const keptCount = segments.length - removedIds.size;

  if (analyzing) {
    return (
      <AppShell>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-4"
          style={{ background: C.bg }}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: C.surfaceRaised, border: `1px solid ${C.stroke}` }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke={C.accent} strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Analyzing your video…</h2>
              <p className="text-sm" style={{ color: C.fgMuted }}>
                AI is reading the transcript to find your best moments
              </p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: C.accent, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-4"
          style={{ background: C.bg }}>
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => { hasFetchedRef.current = false; extractHighlights(); }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: C.accent }}>
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-10" style={{ background: C.bg }}>
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <button type="button" onClick={() => navigate("/dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, marginBottom: 20, color: C.fgMuted, fontSize: 13, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Library
            </button>
            <h1 className="text-2xl font-bold text-white mb-1">Pick your highlights</h1>
            <p className="text-sm" style={{ color: C.fgMuted }}>
              AI picked {segments.length} moment{segments.length !== 1 ? "s" : ""} from your video. Preview them, adjust the start or end, and remove any you don't want.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: C.fgMuted }}>
              {confirmRegenerate ? (
                <>
                  <span>Replace these with new picks?</span>
                  <button type="button" onClick={() => extractHighlights(true)} className="underline" style={{ color: C.accent }}>Yes, find new ones</button>
                  <button type="button" onClick={() => setConfirmRegenerate(false)} className="underline">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmRegenerate(true)} className="underline" style={{ color: C.fgMuted }}>
                  Not quite right? Find different moments
                </button>
              )}
            </div>
          </div>

          {/* Segment cards */}
          <div className="space-y-3">
            {segments.map(seg => {
              const removed = removedIds.has(seg.id);
              const start = edits[seg.id]?.start ?? seg.start_frame;
              const end = edits[seg.id]?.end ?? seg.end_frame;
              const durationSec = Math.round((end - start) / 30);
              const nudge = (which: "start" | "end", delta: number) => setEdits(prev => {
                const s2 = which === "start" ? Math.max(0, start + delta) : start;
                const e2 = which === "end" ? end + delta : end;
                if (e2 - s2 < MIN_LEN_FRAMES || e2 - s2 > MAX_LEN_FRAMES) return prev;
                return { ...prev, [seg.id]: { start: s2, end: e2 } };
              });
              return (
                <div key={seg.id}
                  className="rounded-2xl p-5 flex items-start gap-4 transition-all"
                  style={{
                    background: removed ? "oklch(16% 0.01 250)" : C.surfaceRaised,
                    border: `1px solid ${removed ? "oklch(100% 0 0 / 0.04)" : C.strokeMed}`,
                    opacity: removed ? 0.45 : 1,
                  }}>
                  {/* Index badge */}
                  <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{ background: removed ? C.surface : C.accent, color: removed ? C.fgMuted : C.bg }}>
                    {seg.segment_index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white text-sm leading-snug">{seg.title}</p>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: C.surface, color: C.fgMuted }}>
                        {durationSec}s
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: C.fgMuted }}>{seg.summary}</p>
                    {!removed && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-xs font-mono" style={{ color: C.fgMuted }}>
                        <span className="flex items-center gap-1">
                          <button type="button" className="px-1.5 py-0.5 rounded" style={{ background: C.surface }} aria-label="Start 5 seconds earlier" onClick={() => nudge("start", -NUDGE_FRAMES)}>−5s</button>
                          <span>{frameToTimestamp(start)}</span>
                          <button type="button" className="px-1.5 py-0.5 rounded" style={{ background: C.surface }} aria-label="Start 5 seconds later" onClick={() => nudge("start", NUDGE_FRAMES)}>+5s</button>
                        </span>
                        <span>–</span>
                        <span className="flex items-center gap-1">
                          <button type="button" className="px-1.5 py-0.5 rounded" style={{ background: C.surface }} aria-label="End 5 seconds earlier" onClick={() => nudge("end", -NUDGE_FRAMES)}>−5s</button>
                          <span>{frameToTimestamp(end)}</span>
                          <button type="button" className="px-1.5 py-0.5 rounded" style={{ background: C.surface }} aria-label="End 5 seconds later" onClick={() => nudge("end", NUDGE_FRAMES)}>+5s</button>
                        </span>
                        {sourceUrl && (
                          <button type="button" className="underline font-sans" style={{ color: C.accent }}
                            onClick={() => setPreviewId(previewId === seg.id ? null : seg.id)}>
                            {previewId === seg.id ? "Hide preview" : "▶ Preview"}
                          </button>
                        )}
                      </div>
                    )}
                    {previewId === seg.id && sourceUrl && !removed && (
                      <SegmentPreview key={`${start}-${end}`} src={sourceUrl} start={start} end={end} />
                    )}
                  </div>

                  {/* Remove toggle */}
                  <button
                    onClick={() => setRemovedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(seg.id)) next.delete(seg.id);
                      else next.add(seg.id);
                      return next;
                    })}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: C.surface, color: removed ? C.accent : C.fgMuted }}
                    title={removed ? "Keep this highlight" : "Remove this highlight"}
                    aria-label={removed ? "Keep this highlight" : "Remove this highlight"}
                    aria-pressed={removed}>
                    {removed ? (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Style options */}
          <div className="rounded-2xl p-5 space-y-5"
            style={{ background: C.surfaceRaised, border: `1px solid ${C.strokeMed}` }}>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Caption style</p>
              <div className="grid grid-cols-2 gap-2">
                {CAPTION_STYLES.map(cs => (
                  <button key={cs.value}
                    onClick={() => setCaptionStyle(cs.value)}
                    className="rounded-xl px-3 py-2.5 text-left transition-all"
                    style={{
                      background: captionStyle === cs.value ? C.accent : C.surface,
                      border: `1px solid ${captionStyle === cs.value ? "transparent" : C.stroke}`,
                    }}>
                    <p className="text-sm font-medium text-white">{cs.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: captionStyle === cs.value ? "rgba(255,255,255,0.7)" : C.fgMuted }}>{cs.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-white mb-3">B-roll layout</p>
              <div className="flex flex-wrap gap-2">
                {BROLL_LAYOUTS.map(bl => (
                  <button key={bl.value}
                    onClick={() => setBrollLayout(bl.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: brollLayout === bl.value ? C.accent : C.surface,
                      color: brollLayout === bl.value ? C.bg : C.fgMuted,
                      border: `1px solid ${brollLayout === bl.value ? "transparent" : C.stroke}`,
                    }}>
                    {bl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || keptCount === 0}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: C.accent, color: C.bg }}>
            {generating ? (
              <><Spinner size={16} /> Starting renders…</>
            ) : (
              `Make ${keptCount} short${keptCount !== 1 ? "s" : ""} · 1 credit`
            )}
          </button>

          <p className="text-center text-xs" style={{ color: C.fgMuted }}>
            Each short takes {ESTIMATES.perHighlight} · we'll email you when they're ready
          </p>
          {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
        </div>
      </div>
    </AppShell>
  );
}
