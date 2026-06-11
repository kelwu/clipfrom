import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Player } from "@remotion/player";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { StudioComposition, type CaptionStyle } from "@/components/studio/StudioComposition";

const CLIP_DURATION = 150;
const HOOK_DURATION = 45;

function totalFrames(clipCount: number, transitionDuration: number) {
  return HOOK_DURATION + CLIP_DURATION * clipCount + transitionDuration * Math.max(0, clipCount - 1);
}

const STYLE_OPTIONS: { value: CaptionStyle; label: string; desc: string }[] = [
  { value: "pill",        label: "Pill",        desc: "3-word sliding window" },
  { value: "bold",        label: "Bold",        desc: "Large centered words" },
  { value: "lower-third", label: "Lower Third", desc: "Subtitle bar at bottom" },
  { value: "none",        label: "None",        desc: "No captions" },
];

const TRANSITION_OPTIONS = [
  { value: "fade",  label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "wipe",  label: "Wipe" },
  { value: "cut",   label: "Cut" },
];

export default function Studio() {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { session } = useAuth();

  const stateResult = location.state?.result ?? {};
  const initialCaptions: string[] = location.state?.captions ?? ["", "", "", "", ""];
  const initialStyle: CaptionStyle = location.state?.captionStyle ?? "pill";
  const initialTransition: string = location.state?.transitionStyle ?? "fade";
  const captionTimings: number[] | undefined = stateResult.caption_timings ?? undefined;
  const wordTimings: number[][] | undefined = stateResult.word_timings ?? undefined;
  const stitchedVideoUrl: string = stateResult.stitched_video_url ?? "";

  const clips: string[] = Array.isArray(stateResult.video_urls) && stateResult.video_urls.length > 0
    ? stateResult.video_urls.map((u: string | null) => u ?? "")
    : [
        stateResult.video_url_1 ?? "",
        stateResult.video_url_2 ?? "",
        stateResult.video_url_3 ?? "",
        stateResult.video_url_4 ?? "",
        stateResult.video_url_5 ?? "",
      ].filter((_, i) => i < (initialCaptions.length || 5));

  const [captions, setCaptions] = useState<string[]>(initialCaptions.length > 0 ? initialCaptions : [""]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(initialStyle);
  const [transitionStyle, setTransitionStyle] = useState(initialTransition);
  const [expandedCaption, setExpandedCaption] = useState<number | null>(null);
  const [rerendering, setRerendering] = useState(false);

  const transitionDuration = transitionStyle === "cut" ? 5 : 35;
  const duration = totalFrames(clips.length || 5, transitionDuration);

  const handleRerender = async () => {
    setRerendering(true);
    try {
      const { data: projectData, error } = await supabase
        .from("projects")
        .insert({ status: "processing", article_url: null })
        .select("id").single();
      if (error) throw error;

      const newProjectId = projectData.id;
      const useAgentPipeline = import.meta.env.VITE_USE_AGENT_PIPELINE === "true";
      const webhook = useAgentPipeline ? import.meta.env.VITE_AGENT_VIDEO_FUNCTION_URL : import.meta.env.VITE_N8N_POLLING_WEBHOOK;
      if (webhook) {
        await fetch(webhook, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(useAgentPipeline && {
              "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            }),
          },
          body: JSON.stringify({
            project_id: newProjectId,
            captions: captions.map((text, i) => ({ id: i + 1, text })),
            captionStyle,
            transitionStyle,
          }),
        });
      }

      navigate(`/results/${newProjectId}`, {
        state: { projectId: newProjectId, captions: captions.map((text, i) => ({ id: i + 1, text })), captionStyle, transitionStyle },
      });
    } catch (err) {
      toast.error("Failed to start re-render");
      setRerendering(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-[#0d0d0d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Results
          </button>
          <div className="h-4 w-px bg-gray-800" />
          <span className="text-sm font-semibold text-white">Studio Editor</span>
          <span className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-full px-2.5 py-0.5 text-[10px] text-purple-400 font-semibold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Live Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRerender}
            disabled={rerendering}
            className="flex items-center gap-2 px-4 py-1.5 border border-amber-500/40 hover:border-amber-500/70 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
          >
            {rerendering ? (
              <>
                <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Starting…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                Re-render
              </>
            )}
          </button>
          {stitchedVideoUrl && (
            <a
              href={stitchedVideoUrl}
              download
              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition-colors"
            >
              Export
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — style & transition controls */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-5">

          {/* Caption style */}
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Caption Style</h3>
            <div className="space-y-1.5">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCaptionStyle(opt.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    captionStyle === opt.value
                      ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                      : "border-gray-800 hover:border-gray-600 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Transition */}
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Transition</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {TRANSITION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTransitionStyle(opt.value)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                    transitionStyle === opt.value
                      ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                      : "border-gray-800 hover:border-gray-600 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Center — Remotion Player */}
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] p-6 overflow-hidden">
          <div className="h-full" style={{ aspectRatio: "9/16", maxHeight: "100%" }}>
            <Player
              component={StudioComposition}
              inputProps={{
                clips,
                captions,
                captionStyle,
                transitionStyle,
                captionTimings,
                wordTimings,
              }}
              durationInFrames={duration}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{ width: "100%", height: "100%", borderRadius: "12px", overflow: "hidden" }}
              controls
              loop
            />
          </div>
        </div>

        {/* Right panel — caption text editor */}
        <div className="w-64 flex-shrink-0 border-l border-gray-800 overflow-y-auto p-4">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Captions</h3>
          <div className="space-y-2">
            {captions.map((text, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCaption(expandedCaption === i ? null : i)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-gray-600 flex-shrink-0">#{i + 1}</span>
                    <span className="text-xs text-gray-400 truncate">{text || "Empty caption"}</span>
                  </div>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`flex-shrink-0 text-gray-600 transition-transform ${expandedCaption === i ? "rotate-180" : ""}`}
                  >
                    <polyline points="6,9 12,15 18,9"/>
                  </svg>
                </button>
                {expandedCaption === i && (
                  <div className="px-3 pb-3">
                    <textarea
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-xs text-gray-200 resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
                      rows={4}
                      value={text}
                      onChange={(e) => {
                        const updated = [...captions];
                        updated[i] = e.target.value;
                        setCaptions(updated);
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
