import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import UpgradeModal from "@/components/UpgradeModal";
import { ESTIMATES } from "@/lib/estimates";
import { isFailedStatus, isRenderingStatus } from "@/lib/status";

// requested/error are set by the pipeline when an AI (Kling) clip fell back to stock
interface BrollCue { index: number; source: "kling" | "pexels" | null; requested?: "kling" | "pexels"; error?: string; url: string | null; }

// The founder's cloned voice — only shown to admins.
const OWNER_VOICE_ID = "KXOzch1bNSOicTxNAakl";

// Color removed from VOICES — identity is name + tone, not a dot (P2 fix)
const VOICES = [
  { id: OWNER_VOICE_ID, name: "Kel",    tone: "Custom"          },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  tone: "Soft"            },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",   tone: "Authoritative"   },
] as const;

const C = {
  bg:         "oklch(14% 0.015 250)",
  surface:    "oklch(18% 0.015 250)",
  accent:     "oklch(72% 0.17 280)",
  fg:         "oklch(96% 0.005 250)",
  fgMuted:    "oklch(65% 0.01 250)",
  fgDim:      "oklch(45% 0.01 250)",
  strokeMed:  "oklch(100% 0 0 / 0.13)",
  strokeSoft: "oklch(100% 0 0 / 0.08)",
  green:      "#10b981",
  orange:     "#E89054",
  red:        "oklch(65% 0.2 25)",
  amber:      "oklch(75% 0.17 75)",
} as const;

const SourceBadge = ({ source }: { source: "kling" | "pexels" | null }) => {
  if (!source) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 4,
      background: source === "kling" ? "oklch(55% 0.2 280 / 0.25)" : "oklch(55% 0.1 160 / 0.25)",
      color: source === "kling" ? "#a78bfa" : "#34d399",
    }}>
      {source === "kling" ? "AI Clip" : "Stock"}
    </span>
  );
};

export default function ClipReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { session, user } = useAuth();

  const [captions, setCaptions] = useState<string[]>([]);
  // The user's edits to the script lines (null = unchanged); applied with the voiceover
  const [draftLines, setDraftLines] = useState<string[] | null>(null);
  const [clipUrls, setClipUrls] = useState<(string | null)[]>([]);
  const [brollCues, setBrollCues] = useState<BrollCue[]>([]);
  const [captionTimings, setCaptionTimings] = useState<number[] | undefined>(undefined);
  const [wordTimings, setWordTimings] = useState<number[][] | undefined>(undefined);
  const [renderParams, setRenderParams] = useState<{ captionStyle?: string; transitionStyle?: string } | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [rendering, setRendering] = useState(false);
  const [status, setStatus] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P0: Two-stage render confirmation
  const [pendingRender, setPendingRender] = useState(false);

  // P0: Clip-level error tracking
  const [failedClips, setFailedClips] = useState<Set<number>>(new Set());

  // P1: Undo-after-swap
  const [previousUrls, setPreviousUrls] = useState<Map<number, string>>(new Map());
  const [undoVisible, setUndoVisible] = useState<Set<number>>(new Set());
  const undoTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // P1: Arrival state (for dynamic h1)
  const [dataLoaded, setDataLoaded] = useState(false);

  // Voice state
  const [currentVoiceId, setCurrentVoiceId] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [clonedVoice, setClonedVoice] = useState<{ id: string; name: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // No unrefunded credit on this project (e.g. a re-render after a failure) → rendering costs 1
  const [renderCostsCredit, setRenderCostsCredit] = useState(false);
  const [swappingVoice, setSwappingVoice] = useState(false);
  const [voiceSwapped, setVoiceSwapped] = useState(false);
  const [voicePreviews, setVoicePreviews] = useState<Record<string, string>>({});
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("ai_generations")
      .select("caption_options, video_urls, video_url_1, video_url_2, video_url_3, video_url_4, video_url_5, broll_cues, status, safe_caption_timings, word_timings, render_params, credit_charged_at")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const loadedCaptions = Array.isArray(data.caption_options) ? data.caption_options : [];
        setCaptions(loadedCaptions);
        const rawUrls = Array.isArray(data.video_urls) && data.video_urls.some(Boolean)
          ? data.video_urls
          : [data.video_url_1, data.video_url_2, data.video_url_3, data.video_url_4, data.video_url_5].filter((_, i) => i < loadedCaptions.length);
        const finalUrls: (string | null)[] = rawUrls.length ? rawUrls : Array(loadedCaptions.length).fill(null);
        setClipUrls(finalUrls);
        setBrollCues(Array.isArray(data.broll_cues) ? data.broll_cues : []);
        setStatus(data.status ?? "");
        if (Array.isArray(data.safe_caption_timings)) setCaptionTimings(data.safe_caption_timings);
        if (Array.isArray(data.word_timings)) setWordTimings(data.word_timings);
        if (data.render_params) setRenderParams(data.render_params);
        setRenderCostsCredit(!data.credit_charged_at);
        // Coming back while the final render is running: show that, not the Render button again
        if (isRenderingStatus(data.status)) {
          setRendering(true);
          pollRender();
        }
        // P0: Mark null URLs as failed if generation is complete
        if (data.status === "complete") {
          const failed = new Set(
            finalUrls.map((u, i) => (!u ? i : -1)).filter(i => i >= 0)
          );
          if (failed.size > 0) setFailedClips(failed);
        }
        setDataLoaded(true);
      });
  }, [projectId]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("preferred_voice_id, cloned_voice_id, cloned_voice_name, is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCurrentVoiceId(data.preferred_voice_id ?? null);
        setSelectedVoiceId(data.preferred_voice_id ?? null);
        setIsAdmin(!!data.is_admin);
        if (data.cloned_voice_id) {
          setClonedVoice({ id: data.cloned_voice_id, name: data.cloned_voice_name ?? "My Clone" });
        }
      });
  }, [user?.id]);

  useEffect(() => {
    if (!session) return;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-previews`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    })
      .then(r => r.ok ? r.json() : {})
      .then(setVoicePreviews)
      .catch(() => {});
  }, [session?.access_token]);

  function handlePlayPreview(voiceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (playingVoiceId === voiceId) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }
    previewAudioRef.current?.pause();
    const url = voicePreviews[voiceId];
    if (!url) return;
    const audio = new Audio(url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.play().catch(() => {});
    previewAudioRef.current = audio;
    setPlayingVoiceId(voiceId);
  }

  const handleSwap = async (idx: number) => {
    if (!projectId || swapping.has(idx)) return;
    const prevUrl = clipUrls[idx]; // Save for P1 undo
    setSwapping(prev => new Set(prev).add(idx));
    setFailedClips(prev => { const n = new Set(prev); n.delete(idx); return n; }); // Clear failed on retry
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/regenerate-clip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ project_id: projectId, clip_index: idx }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Could not find a replacement clip");
        setFailedClips(prev => new Set(prev).add(idx));
        return;
      }
      const { url } = await res.json();
      setClipUrls(prev => prev.map((u, i) => i === idx ? url : u));
      setBrollCues(prev => prev.map(c => c.index === idx ? { ...c, url, source: "pexels" } : c));
      toast.success(`Clip ${idx + 1} replaced`);
      // P1: Show undo affordance for 8 seconds
      if (prevUrl) {
        setPreviousUrls(prev => new Map(prev).set(idx, prevUrl));
        setUndoVisible(prev => new Set(prev).add(idx));
        const timer = setTimeout(() => {
          setUndoVisible(prev => { const n = new Set(prev); n.delete(idx); return n; });
          undoTimersRef.current.delete(idx);
        }, 8000);
        if (undoTimersRef.current.has(idx)) clearTimeout(undoTimersRef.current.get(idx)!);
        undoTimersRef.current.set(idx, timer);
      }
    } catch {
      toast.error("Swap failed — please try again");
      setFailedClips(prev => new Set(prev).add(idx)); // P0: Mark as failed
    } finally {
      setSwapping(prev => { const n = new Set(prev); n.delete(idx); return n; });
    }
  };

  // P1: Undo the last swap for a specific clip
  const handleUndoSwap = (idx: number) => {
    const prevUrl = previousUrls.get(idx);
    if (!prevUrl) return;
    if (undoTimersRef.current.has(idx)) {
      clearTimeout(undoTimersRef.current.get(idx)!);
      undoTimersRef.current.delete(idx);
    }
    setClipUrls(prev => prev.map((u, i) => i === idx ? prevUrl : u));
    setUndoVisible(prev => { const n = new Set(prev); n.delete(idx); return n; });
    setPreviousUrls(prev => { const n = new Map(prev); n.delete(idx); return n; });
  };

  const linesDirty = !!draftLines && draftLines.some((l, i) => l.trim() !== (captions[i] ?? ""));
  const voiceDirty = selectedVoiceId !== currentVoiceId;

  // Re-records the voiceover with the chosen voice and/or the edited lines (free, ~20s)
  const handleSwapVoice = async () => {
    if (!projectId || swappingVoice || (!voiceDirty && !linesDirty)) return;
    if (linesDirty && draftLines!.some(l => !l.trim())) { toast.error("Lines can't be empty"); return; }
    setSwappingVoice(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/swap-voiceover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          project_id: projectId,
          voice_id: selectedVoiceId,
          ...(linesDirty ? { captions: draftLines!.map(l => l.trim()) } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Voice swap failed");
        return;
      }
      setCurrentVoiceId(selectedVoiceId);
      if (linesDirty) { setCaptions(draftLines!.map(l => l.trim())); setDraftLines(null); }
      setVoiceSwapped(true);
      setTimeout(() => setVoiceSwapped(false), 4000);
      toast.success("Voiceover updated — hit Render to use it");
    } catch {
      toast.error("Could not reach server");
    } finally {
      setSwappingVoice(false);
    }
  };

  function pollRender() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let pollAttempts = 0;
    pollingRef.current = setInterval(async () => {
      pollAttempts++;
      const { data } = await supabase
        .from("ai_generations")
        .select("status, stitched_video_url")
        .eq("project_id", projectId!)
        .maybeSingle();
      if (data?.stitched_video_url) {
        clearInterval(pollingRef.current!);
        navigate(`/results/${projectId}`);
      } else if (isFailedStatus(data?.status)) {
        clearInterval(pollingRef.current!);
        toast.error("Render failed — your credit was refunded. Please try again.");
        setRendering(false);
      } else if (pollAttempts >= 90) {
        // Stop the spinner only; the render keeps going server-side and emails on completion.
        clearInterval(pollingRef.current!);
        toast.message("Still rendering — we'll email you when it's done. It'll also appear in your Library.");
      }
    }, 8000);
  }

  const handleRender = async () => {
    if (!projectId || rendering) return;
    setRendering(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/trigger-render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.status === 402) { setShowUpgrade(true); setRendering(false); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Failed to start render");
        setRendering(false);
        return;
      }
      pollRender();
    } catch {
      toast.error("Could not reach the render server");
      setRendering(false);
    }
  };

  // P0: Two-stage render confirmation handler
  const handleRenderClick = () => {
    if (!allReady || rendering) return;
    if (!pendingRender) {
      setPendingRender(true);
    } else {
      setPendingRender(false);
      handleRender();
    }
  };

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    undoTimersRef.current.forEach(timer => clearTimeout(timer));
  }, []);

  // AI clips that fell back to stock (e.g. the AI video service was unavailable)
  const aiFallbackCount = brollCues.filter(c => c.requested === "kling" && c.source === "pexels").length;
  const readyCount = clipUrls.filter(Boolean).length;
  const failedCount = failedClips.size;
  const clipCount = captions.length || clipUrls.length || 5;
  // Edited lines must be recorded before rendering, or the audio wouldn't match the text
  const allReady = clipCount > 0 && readyCount >= clipCount && failedCount === 0 && !linesDirty;

  // Status indicator config
  const statusColor = failedCount > 0 ? C.red : allReady ? C.green : C.amber;
  const statusLabel = failedCount > 0
    ? `${readyCount} ready · ${failedCount} failed`
    : `${readyCount}/${clipCount} clips ready`;

  // P1: Dynamic h1 — gives arriving creator a clear "it worked" signal
  const pageTitle = dataLoaded && allReady
    ? `Your ${clipCount} clips are ready to review`
    : "Review your clips";

  return (
    <AppShell>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg, color: C.fg, fontFamily: '"Geist", system-ui, sans-serif', padding: "40px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, background: statusColor, borderRadius: "50%", boxShadow: `0 0 8px ${statusColor}` }} />
              <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {statusLabel}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", transition: "color 0.3s" }}>
                {pageTitle}
              </h1>
              <button
                onClick={() => navigate(`/studio/${projectId}`, {
                  state: {
                    result: { video_urls: clipUrls, caption_timings: captionTimings, word_timings: wordTimings },
                    captions,
                    captionStyle: renderParams?.captionStyle ?? "pill",
                    transitionStyle: renderParams?.transitionStyle ?? "fade",
                  },
                })}
                disabled={!allReady}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${C.strokeMed}`,
                  background: C.surface, color: C.fgMuted,
                  fontSize: 13, fontWeight: 600,
                  cursor: !allReady ? "not-allowed" : "pointer",
                  opacity: !allReady ? 0.4 : 1,
                  transition: "all 0.15s",
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                Preview
              </button>
            </div>
            <p style={{ color: C.fgDim, fontSize: 14, margin: "8px 0 0" }}>
              Edit any line, swap any clip, or change the voice before rendering.
            </p>
            {aiFallbackCount > 0 && (
              <div role="status" style={{
                marginTop: 14, padding: "10px 14px", borderRadius: 10,
                border: "1px solid oklch(75% 0.17 75 / 0.35)", background: "oklch(75% 0.17 75 / 0.08)",
                color: C.fg, fontSize: 13, lineHeight: 1.5,
              }}>
                AI footage was unavailable for {aiFallbackCount} {aiFallbackCount === 1 ? "clip" : "clips"}, so we used stock footage instead
                (marked <strong>Stock</strong>). Use “Try another” on any clip you'd like to change.
              </div>
            )}
          </div>

          {/* Clip grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
            {Array.from({ length: clipCount }, (_, i) => i).map(i => {
              const url = clipUrls[i];
              const cue = brollCues.find(c => c.index === i);
              const isSwapping = swapping.has(i);
              const isFailed = failedClips.has(i);
              const canUndo = undoVisible.has(i);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Video preview */}
                  <div style={{
                    position: "relative", aspectRatio: "9/16",
                    background: C.surface, borderRadius: 12,
                    border: `1px solid ${isFailed ? "oklch(65% 0.2 25 / 0.3)" : C.strokeMed}`,
                    overflow: "hidden",
                  }}>
                    {/* P0: Clip-level error state */}
                    {isFailed ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span style={{ fontSize: 10, color: C.fgMuted, textAlign: "center", lineHeight: 1.3 }}>Generation failed</span>
                      </div>
                    ) : url ? (
                      <video
                        src={url}
                        muted
                        loop
                        autoPlay
                        playsInline
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.fgDim, fontSize: 12 }}>
                        Loading…
                      </div>
                    )}
                    {/* Overlays hidden when clip failed */}
                    {!isFailed && (
                      <>
                        <div style={{ position: "absolute", top: 8, left: 8 }}>
                          <SourceBadge source={cue?.source ?? null} />
                        </div>
                        <div style={{
                          position: "absolute", top: 8, right: 8,
                          background: "oklch(0% 0 0 / 0.55)", borderRadius: 6,
                          padding: "2px 6px", fontSize: 10, fontWeight: 700, color: "#fff",
                        }}>
                          {i + 1}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Script line — editable; applied with the voiceover */}
                  <textarea
                    aria-label={`Line ${i + 1}`}
                    value={(draftLines ?? captions)[i] ?? ""}
                    onChange={e => {
                      const v = e.target.value;
                      setDraftLines(prev => (prev ?? captions).map((l, j) => (j === i ? v : l)));
                    }}
                    disabled={rendering || swappingVoice}
                    rows={3}
                    style={{
                      width: "100%", resize: "vertical", fontSize: 11, lineHeight: 1.4, fontFamily: "inherit",
                      color: C.fg, background: "transparent", borderRadius: 6, padding: "4px 6px",
                      border: `1px solid ${draftLines && draftLines[i] !== captions[i] ? C.accent : "transparent"}`,
                    }}
                  />

                  {/* Swap / Retry button */}
                  <button
                    type="button"
                    onClick={() => handleSwap(i)}
                    disabled={isSwapping || rendering}
                    style={{
                      padding: "7px 0", borderRadius: 8,
                      border: `1px solid ${isFailed ? "oklch(65% 0.2 25 / 0.3)" : C.strokeMed}`,
                      background: "none",
                      color: isSwapping ? C.fgDim : isFailed ? C.red : C.fgMuted,
                      fontSize: 12, fontWeight: 600,
                      cursor: isSwapping || rendering ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {isSwapping ? "Finding…" : isFailed ? "↺ Retry" : "↻ Try another"}
                  </button>

                  {/* P1: Undo affordance — visible for 8s after swap */}
                  {canUndo && (
                    <button
                      type="button"
                      onClick={() => handleUndoSwap(i)}
                      style={{
                        padding: "4px 0", borderRadius: 6,
                        border: "none", background: "none",
                        color: C.fgDim, fontSize: 11,
                        cursor: "pointer",
                        textDecoration: "underline",
                        textDecorationStyle: "dotted",
                        textUnderlineOffset: "2px",
                      }}
                    >
                      ↩ Undo swap
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Voice picker */}
          <div style={{ borderTop: `1px solid ${C.strokeSoft}`, paddingTop: 24, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.fg }}>Voice</p>
              {voiceSwapped && (
                <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>✓ Voice updated</span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {/* Default chip — no color dot (P2 fix) */}
              {(() => {
                const isSelected = selectedVoiceId === null;
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedVoiceId(null)}
                    disabled={rendering || swappingVoice}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 8,
                      border: `1px solid ${isSelected ? C.accent : C.strokeMed}`,
                      background: isSelected ? "oklch(72% 0.17 280 / 0.15)" : C.surface,
                      color: isSelected ? C.accent : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    Default
                  </button>
                );
              })()}
              {/* Preset voices — no color dot (P2 fix) */}
              {VOICES.filter(v => v.id !== OWNER_VOICE_ID || isAdmin).map(v => {
                const isSelected = selectedVoiceId === v.id;
                const isPlaying = playingVoiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVoiceId(v.id)}
                    disabled={rendering || swappingVoice}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 8,
                      border: `1px solid ${isSelected ? C.accent : C.strokeMed}`,
                      background: isSelected ? "oklch(72% 0.17 280 / 0.15)" : C.surface,
                      color: isSelected ? C.accent : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {v.name}
                    {voicePreviews[v.id] && (
                      <span
                        onClick={e => handlePlayPreview(v.id, e)}
                        title={isPlaying ? "Stop" : "Preview"}
                        style={{
                          marginLeft: 2, opacity: 0.55, display: "inline-flex",
                          alignItems: "center", transition: "opacity 0.1s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = isPlaying ? "1" : "0.55")}
                      >
                        {isPlaying ? (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                          </svg>
                        ) : (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Cloned voice — no color dot (P2 fix) */}
              {clonedVoice && (() => {
                const isSelected = selectedVoiceId === clonedVoice.id;
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedVoiceId(clonedVoice.id)}
                    disabled={rendering || swappingVoice}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 8,
                      border: `1px solid ${isSelected ? C.orange : C.strokeMed}`,
                      background: isSelected ? "oklch(72% 0.17 75 / 0.12)" : C.surface,
                      color: isSelected ? C.orange : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {clonedVoice.name} ★
                  </button>
                );
              })()}
            </div>
            {/* Apply bar — visible when the voice or any line changed */}
            {(voiceDirty || linesDirty) && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={handleSwapVoice}
                  disabled={swappingVoice || rendering}
                  style={{
                    padding: "8px 20px", borderRadius: 8,
                    background: swappingVoice ? C.surface : C.accent,
                    border: `1px solid ${swappingVoice ? C.strokeMed : "transparent"}`,
                    color: swappingVoice ? C.fgMuted : "oklch(14% 0.015 250)",
                    fontSize: 13, fontWeight: 700,
                    cursor: swappingVoice ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    transition: "all 0.15s",
                  }}>
                  {swappingVoice ? (
                    <>
                      <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Regenerating audio…
                    </>
                  ) : linesDirty ? "Update voiceover with your edits" : "Apply voice change"}
                </button>
                <span style={{ marginLeft: 12, fontSize: 11, color: C.fgDim }}>
                  ~20 sec · no credits charged
                </span>
              </div>
            )}
          </div>

          {/* Render section — P0: two-stage confirmation */}
          <div style={{ borderTop: `1px solid ${C.strokeSoft}`, paddingTop: 24 }}>
            {rendering ? (
              <div style={{ textAlign: "center" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  background: C.surface, border: `1px solid ${C.strokeMed}`,
                  borderRadius: 12, padding: "14px 24px",
                }}>
                  <svg className="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span style={{ color: C.fgMuted, fontSize: 14 }}>Rendering your video — usually {ESTIMATES.articleRender}…</span>
                </div>
                <p style={{ margin: "12px 0 0", color: C.fgDim, fontSize: 13 }}>
                  You can close this tab — we'll email {user?.email ?? "you"} when it's ready, and it'll be in your{" "}
                  <button type="button" onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", padding: 0, color: C.accent, cursor: "pointer", fontSize: 13 }}>Library</button>.
                </p>
              </div>
            ) : pendingRender ? (
              /* P0: Confirmation step */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <p style={{ margin: 0, color: C.fgMuted, fontSize: 13 }}>
                  This starts the final render (usually {ESTIMATES.articleRender}){renderCostsCredit && !isAdmin ? " and uses 1 credit" : ""}. Ready to go?
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={handleRenderClick}
                    style={{
                      padding: "12px 28px", borderRadius: 10,
                      background: "oklch(72% 0.17 280 / 0.12)",
                      border: `1px solid ${C.accent}`,
                      color: C.accent,
                      fontSize: 15, fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: "-0.01em", transition: "all 0.15s",
                    }}
                  >
                    ✓ Confirm render
                  </button>
                  <button
                    onClick={() => {
                      setPendingRender(false);
                    }}
                    style={{
                      background: "none", border: "none",
                      color: C.fgDim, fontSize: 13,
                      cursor: "pointer", padding: "4px 8px",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <p style={{ margin: 0, color: C.fgDim, fontSize: 13 }}>
                  {linesDirty
                    ? "Update the voiceover (above) to use your edited lines, then render."
                    : `Happy with all ${clipCount} clips? Render to get your final 9:16 MP4.`}
                </p>
                <button
                  onClick={handleRenderClick}
                  disabled={!allReady}
                  style={{
                    padding: "12px 28px", borderRadius: 10,
                    background: !allReady ? C.strokeMed : C.accent,
                    border: "none",
                    color: !allReady ? C.fgDim : "oklch(14% 0.015 250)",
                    fontSize: 15, fontWeight: 700,
                    cursor: !allReady ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em", transition: "all 0.15s",
                    boxShadow: allReady ? "0 3px 14px oklch(72% 0.17 280 / 0.35)" : "none",
                  }}
                >
                  Render Final Video →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </AppShell>
  );
}
