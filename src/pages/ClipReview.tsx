import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";

interface BrollCue { index: number; source: "kling" | "pexels" | null; url: string | null; }

const VOICES = [
  { id: "KXOzch1bNSOicTxNAakl", name: "Kel",    tone: "Custom",      color: "#e879f9" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", tone: "Calm",        color: "#a78bfa" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",   tone: "Deep",        color: "#60a5fa" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  tone: "Soft",        color: "#f472b6" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",   tone: "Authoritative", color: "#34d399" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", tone: "Conversational", color: "#fb923c" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",   tone: "Energetic",   color: "#facc15" },
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
      {source === "kling" ? "AI" : "Stock"}
    </span>
  );
};

export default function ClipReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { session, user } = useAuth();

  const [captions, setCaptions] = useState<string[]>([]);
  const [clipUrls, setClipUrls] = useState<(string | null)[]>([null, null, null, null, null]);
  const [brollCues, setBrollCues] = useState<BrollCue[]>([]);
  const [captionTimings, setCaptionTimings] = useState<number[] | undefined>(undefined);
  const [wordTimings, setWordTimings] = useState<number[][] | undefined>(undefined);
  const [renderParams, setRenderParams] = useState<{ captionStyle?: string; transitionStyle?: string } | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [rendering, setRendering] = useState(false);
  const [status, setStatus] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice swap state
  const [currentVoiceId, setCurrentVoiceId] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [clonedVoice, setClonedVoice] = useState<{ id: string; name: string } | null>(null);
  const [swappingVoice, setSwappingVoice] = useState(false);
  const [voiceSwapped, setVoiceSwapped] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    supabase
      .from("ai_generations")
      .select("caption_options, video_urls, video_url_1, video_url_2, video_url_3, video_url_4, video_url_5, broll_cues, status, safe_caption_timings, word_timings, render_params")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCaptions(Array.isArray(data.caption_options) ? data.caption_options : []);
        const urls = Array.isArray(data.video_urls) && data.video_urls.some(Boolean)
          ? data.video_urls
          : [data.video_url_1, data.video_url_2, data.video_url_3, data.video_url_4, data.video_url_5];
        setClipUrls(urls);
        setBrollCues(Array.isArray(data.broll_cues) ? data.broll_cues : []);
        setStatus(data.status ?? "");
        if (Array.isArray(data.safe_caption_timings)) setCaptionTimings(data.safe_caption_timings);
        if (Array.isArray(data.word_timings)) setWordTimings(data.word_timings);
        if (data.render_params) setRenderParams(data.render_params);
      });
  }, [projectId]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("preferred_voice_id, cloned_voice_id, cloned_voice_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCurrentVoiceId(data.preferred_voice_id ?? null);
        setSelectedVoiceId(data.preferred_voice_id ?? null);
        if (data.cloned_voice_id) {
          setClonedVoice({ id: data.cloned_voice_id, name: data.cloned_voice_name ?? "My Clone" });
        }
      });
  }, [user?.id]);

  const handleSwap = async (idx: number) => {
    if (!projectId || swapping.has(idx)) return;
    setSwapping(prev => new Set(prev).add(idx));
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
        return;
      }
      const { url } = await res.json();
      setClipUrls(prev => prev.map((u, i) => i === idx ? url : u));
      setBrollCues(prev => prev.map(c => c.index === idx ? { ...c, url, source: "pexels" } : c));
      toast.success(`Clip ${idx + 1} replaced`);
    } catch (err) {
      toast.error("Swap failed — please try again");
    } finally {
      setSwapping(prev => { const n = new Set(prev); n.delete(idx); return n; });
    }
  };

  const handleSwapVoice = async () => {
    if (!projectId || swappingVoice || selectedVoiceId === currentVoiceId) return;
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
        body: JSON.stringify({ project_id: projectId, voice_id: selectedVoiceId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Voice swap failed");
        return;
      }
      setCurrentVoiceId(selectedVoiceId);
      setVoiceSwapped(true);
      setTimeout(() => setVoiceSwapped(false), 4000);
      toast.success("Voice updated — hit Render to use it");
    } catch {
      toast.error("Could not reach server");
    } finally {
      setSwappingVoice(false);
    }
  };

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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Failed to start render");
        setRendering(false);
        return;
      }
      // Poll for completion then navigate to results
      pollingRef.current = setInterval(async () => {
        const { data } = await supabase
          .from("ai_generations")
          .select("status, stitched_video_url")
          .eq("project_id", projectId!)
          .maybeSingle();
        if (data?.stitched_video_url) {
          clearInterval(pollingRef.current!);
          navigate(`/results/${projectId}`);
        } else if (data?.status === "remotion_error") {
          clearInterval(pollingRef.current!);
          toast.error("Render failed — please try again");
          setRendering(false);
        }
      }, 8000);
    } catch {
      toast.error("Could not reach the render server");
      setRendering(false);
    }
  };

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const readyCount = clipUrls.filter(Boolean).length;

  return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: C.bg, color: C.fg, fontFamily: '"Geist", system-ui, sans-serif', padding: "40px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, background: C.green, borderRadius: "50%", boxShadow: `0 0 8px ${C.green}` }} />
              <span style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {readyCount}/5 clips ready
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                Review your clips
              </h1>
              <button
                onClick={() => navigate(`/studio/${projectId}`, {
                  state: {
                    result: {
                      video_urls: clipUrls,
                      caption_timings: captionTimings,
                      word_timings: wordTimings,
                    },
                    captions,
                    captionStyle: renderParams?.captionStyle ?? "pill",
                    transitionStyle: renderParams?.transitionStyle ?? "fade",
                  },
                })}
                disabled={clipUrls.filter(Boolean).length < 5}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${C.strokeMed}`,
                  background: C.surface, color: C.fgMuted,
                  fontSize: 13, fontWeight: 600,
                  cursor: clipUrls.filter(Boolean).length < 5 ? "not-allowed" : "pointer",
                  opacity: clipUrls.filter(Boolean).length < 5 ? 0.4 : 1,
                  transition: "all 0.15s",
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                Preview
              </button>
            </div>
            <p style={{ color: C.fgDim, fontSize: 14, margin: "8px 0 0" }}>
              Not happy with a clip? Swap it for a fresh one before rendering. Each swap is instant and free.
            </p>
          </div>

          {/* Clip grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, marginBottom: 32 }}>
            {[0, 1, 2, 3, 4].map(i => {
              const url = clipUrls[i];
              const cue = brollCues.find(c => c.index === i);
              const isSwapping = swapping.has(i);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Video preview */}
                  <div style={{
                    position: "relative", aspectRatio: "9/16",
                    background: C.surface, borderRadius: 12,
                    border: `1px solid ${C.strokeMed}`, overflow: "hidden",
                  }}>
                    {url ? (
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
                    {/* Source badge */}
                    <div style={{ position: "absolute", top: 8, left: 8 }}>
                      <SourceBadge source={cue?.source ?? null} />
                    </div>
                    {/* Clip number */}
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      background: "rgba(0,0,0,0.55)", borderRadius: 6,
                      padding: "2px 6px", fontSize: 10, fontWeight: 700, color: "#fff",
                    }}>
                      {i + 1}
                    </div>
                  </div>

                  {/* Caption */}
                  <p style={{ fontSize: 11, color: C.fgMuted, lineHeight: 1.4, margin: 0 }}>
                    {captions[i] ?? ""}
                  </p>

                  {/* Swap button */}
                  <button
                    type="button"
                    onClick={() => handleSwap(i)}
                    disabled={isSwapping || rendering}
                    style={{
                      padding: "7px 0", borderRadius: 8,
                      border: `1px solid ${C.strokeMed}`,
                      background: "none", color: isSwapping ? C.fgDim : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: isSwapping || rendering ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {isSwapping ? "Finding…" : "↻ Try another"}
                  </button>
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
              {/* Default / null voice */}
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
                      background: isSelected ? `oklch(72% 0.17 280 / 0.15)` : C.surface,
                      color: isSelected ? C.accent : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e879f9", flexShrink: 0 }} />
                    Default
                  </button>
                );
              })()}
              {/* Preset voices */}
              {VOICES.map(v => {
                const isSelected = selectedVoiceId === v.id;
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
                      background: isSelected ? `oklch(72% 0.17 280 / 0.15)` : C.surface,
                      color: isSelected ? C.accent : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                    {v.name}
                  </button>
                );
              })}
              {/* Cloned voice */}
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
                      background: isSelected ? "rgba(232,144,84,0.15)" : C.surface,
                      color: isSelected ? C.orange : C.fgMuted,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.orange, flexShrink: 0 }} />
                    {clonedVoice.name} ★
                  </button>
                );
              })()}
            </div>
            {/* Apply button — only visible when selection differs from current */}
            {selectedVoiceId !== currentVoiceId && (
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
                  ) : "Apply voice change"}
                </button>
                <span style={{ marginLeft: 12, fontSize: 11, color: C.fgDim }}>
                  ~20 sec · no credits charged
                </span>
              </div>
            )}
          </div>

          {/* Render button */}
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
                  <span style={{ color: C.fgMuted, fontSize: 14 }}>Rendering your video — usually 2–4 minutes…</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <p style={{ margin: 0, color: C.fgDim, fontSize: 13 }}>
                  Happy with all {readyCount} clips? Render to get your final 9:16 MP4.
                </p>
                <button
                  onClick={handleRender}
                  disabled={readyCount < 5}
                  style={{
                    padding: "12px 28px", borderRadius: 10,
                    background: readyCount < 5 ? C.strokeMed : C.accent,
                    border: "none",
                    color: readyCount < 5 ? C.fgDim : "oklch(14% 0.015 250)",
                    fontSize: 15, fontWeight: 700,
                    cursor: readyCount < 5 ? "not-allowed" : "pointer",
                    letterSpacing: "-0.01em", transition: "all 0.15s",
                  }}
                >
                  Render Final Video →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
