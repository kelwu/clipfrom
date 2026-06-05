import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";

interface ResultData {
  id?: string | null;
  stitched_video_url?: string | null;
  caption_options?: string[] | null;
  final_caption?: string | null;
  description?: string | null;
  video_urls?: string[] | null;
  video_url_1?: string | null;
  video_url_2?: string | null;
  video_url_3?: string | null;
  video_url_4?: string | null;
  video_url_5?: string | null;
  status?: string | null;
}

const Spinner = ({ size = 14 }: { size?: number }) => (
  <svg className="animate-spin" width={size} height={size} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

export default function VideoResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: projectIdParam } = useParams();

  const [result, setResult] = useState<ResultData>({});
  const [editingCaption, setEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState("");
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [captionOutro, setCaptionOutro] = useState("");
  const [editingOutro, setEditingOutro] = useState(false);
  const [savingOutro, setSavingOutro] = useState(false);
  const [outroSaved, setOutroSaved] = useState(false);
  const [igConnected, setIgConnected] = useState<boolean | null>(null);
  const [igUsername, setIgUsername] = useState("");
  const [connectingIg, setConnectingIg] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);

  const { session, user } = useAuth();

  const projectId = location.state?.projectId || projectIdParam;
  const userEmail = location.state?.userEmail;
  const content: string = location.state?.content || "";
  const approvedCaptions: { id: number; text: string }[] = location.state?.captions || [];
  const captionStyle: string = location.state?.captionStyle ?? "pill";
  const transitionStyle: string = location.state?.transitionStyle ?? "cut";
  const videoSource: string = location.state?.videoSource ?? "ai";
  const sourceMode: string = location.state?.sourceMode ?? "article";
  const showHookCard: boolean = location.state?.showHookCard ?? false;
  const captionFont: string | undefined = location.state?.captionFont;
  const hookText: string | undefined = location.state?.hookText;

  const clips = Array.isArray(result.video_urls) && result.video_urls.length > 0
    ? result.video_urls
    : [result.video_url_1, result.video_url_2, result.video_url_3, result.video_url_4, result.video_url_5].filter((_, i) => i < (result.caption_options?.length ?? 5));
  const totalClips = clips.length;
  const videoUrlsFilled = clips.filter(Boolean).length;
  const stitchedReady = !!result.stitched_video_url;
  const baseCaption = editedCaption || result.description || result.final_caption || "";
  const instagramCaption = captionOutro ? `${baseCaption}\n\n${captionOutro}` : baseCaption;
  const charCount = instagramCaption.length;

  // Process Observability: derive step states from DB status
  const status = result.status || "";
  const obsSteps = sourceMode === "video"
    ? [
        { label: "Transcript Ready", sub: "Word-level timestamps extracted", done: true, active: false },
        {
          label: "B-Roll",
          sub: "Sourcing stock clips per segment",
          done: ["videos_ready", "complete"].includes(status),
          active: status === "generating_broll",
        },
        {
          label: "Rendering",
          sub: "Compositing captions + B-roll",
          done: status === "complete",
          active: status === "videos_ready",
        },
      ]
    : [
        { label: "Scraping Article", sub: "Fetching and parsing source content", done: true, active: false },
        { label: "The Writer", sub: "Scripting captions from key insights", done: true, active: false },
        {
          label: "The Director",
          sub: "Generating clips",
          done: ["kling_tasks_done", "videos_ready", "complete"].includes(status),
          active: ["generating_videos", "kling_tasks_created"].includes(status),
        },
        {
          label: "Audio Synthesis",
          sub: "Generating voiceover",
          done: videoUrlsFilled > 0 || ["videos_ready", "complete"].includes(status),
          active: status === "kling_tasks_done",
        },
        {
          label: "Rendering",
          sub: "Stitching clips, voiceover & captions",
          done: status === "complete",
          active: status === "videos_ready",
        },
      ];

  const displayCaptions = approvedCaptions.length > 0
    ? approvedCaptions.map((c) => c.text)
    : Array.isArray(result.caption_options) ? result.caption_options : [];

  // Derive a rough progress % for the processing engine header
  const processingProgress = stitchedReady ? 100
    : status === "videos_ready" ? 90
    : status === "kling_tasks_done" ? 70
    : status === "kling_tasks_created" ? 50
    : status === "generating_videos" ? 30
    : videoUrlsFilled > 0 ? 40 + videoUrlsFilled * 8
    : 20;

  const testMode = import.meta.env.VITE_TEST_MODE === "true";

  useEffect(() => {
    if (!projectId && !testMode) { navigate("/"); return; }

    if (testMode) {
      setResult({
        status: "complete",
        stitched_video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        video_url_1: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        video_url_2: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        video_url_3: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        video_url_4: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        video_url_5: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        caption_options: [
          "The future of AI is being written right now — and it's moving faster than anyone predicted.",
          "Three breakthroughs in the last 6 months have quietly changed everything we thought we knew.",
          "Researchers are stunned. The results speak for themselves.",
          "This isn't science fiction anymore. This is your morning news.",
          "The question isn't whether this changes your industry. It's whether you'll be ready.",
        ],
        final_caption: "The future of AI is being written right now — and it's moving faster than anyone predicted. Three breakthroughs in the last 6 months have quietly changed everything we thought we knew. #AI #tech #futureofwork",
        description: "The future of AI is being written right now — and it's moving faster than anyone predicted. Three breakthroughs in the last 6 months have quietly changed everything we thought we knew. #AI #tech #futureofwork",
      });
      return;
    }

    const triggerVideoGeneration = async () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      const { data: existing } = await supabase
        .from("ai_generations").select("status").eq("project_id", projectId).maybeSingle();
      if (existing?.status && existing.status !== "captions_ready") return;

      try {
        let res: Response;

        if (sourceMode === "video") {
          // User-uploaded video: call trigger-caption-video
          const webhook = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trigger-caption-video`;
          res = await fetch(webhook, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ project_id: projectId, captionStyle, user_email: userEmail }),
          });
        } else {
          // Article mode: call agent-video → Railway pipeline
          const webhook = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-video`;
          res = await fetch(webhook, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ project_id: projectId, user_email: userEmail, captionStyle, transitionStyle, videoSource, ...(showHookCard ? { showHookCard: true } : {}), ...(captionFont ? { captionFont } : {}), ...(hookText ? { hookText } : {}) }),
          });
        }

        if (res.status === 402) {
          toast.error("You're out of credits. Upgrade to generate more videos.");
          navigate("/");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body?.error ?? "Failed to start video generation. Please try again.");
          navigate("/");
          return;
        }
      } catch (err) { console.warn("Could not trigger video generation:", err); }
    };

    const poll = async (isInitialCheck = false): Promise<boolean> => {
      try {
        const { data } = await supabase
          .from("ai_generations")
          .select("id, stitched_video_url, caption_options, final_caption, description, video_urls, video_url_1, video_url_2, video_url_3, video_url_4, video_url_5, status")
          .eq("project_id", projectId).maybeSingle();
        if (!data) return false;
        setResult(data);
        if (data.stitched_video_url) {
          clearInterval(pollingRef.current!);
          if (!isInitialCheck) {
            toast.success("Your video is ready!");
          }
          return true;
        }
        return false;
      } catch (err) { console.error("Polling error:", err); return false; }
    };

    triggerVideoGeneration();
    poll(true).then((alreadyComplete) => {
      if (!alreadyComplete) {
        pollingRef.current = setInterval(() => poll(false), 10000);
      }
    });
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [projectId, userEmail, navigate]);

  const handlePostToInstagram = async () => {
    if (!result.stitched_video_url) return;
    setPosting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-to-instagram`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            video_url: result.stitched_video_url,
            caption: instagramCaption,
            user_id: user?.id,
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        setPosted(true);
        toast.success("Posted to Instagram!");
      } else {
        toast.error(data.error ?? "Instagram post failed");
      }
    } catch (err) {
      toast.error("Could not reach Instagram");
    } finally {
      setPosting(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("caption_outro, instagram_account_id, instagram_username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.caption_outro) setCaptionOutro(data.caption_outro);
        setIgConnected(!!data?.instagram_account_id);
        if (data?.instagram_username) setIgUsername(data.instagram_username);
      });
  }, [user?.id]);

  const handleConnectInstagram = async () => {
    if (!session) return;
    setConnectingIg(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-start`,
        {
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );
      const data = await res.json();
      if (data.url) {
        sessionStorage.setItem("ig_oauth_return_to", window.location.pathname + window.location.search);
        window.location.href = data.url;
      } else {
        toast.error("Could not start Instagram connection");
        setConnectingIg(false);
      }
    } catch {
      toast.error("Could not reach server");
      setConnectingIg(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(instagramCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveOutro = async () => {
    if (!user) return;
    setSavingOutro(true);
    await supabase.from("user_profiles").upsert({ id: user.id, caption_outro: captionOutro, updated_at: new Date().toISOString() });
    setSavingOutro(false);
    setEditingOutro(false);
    setOutroSaved(true);
    setTimeout(() => setOutroSaved(false), 2000);
  };

  const contentPreview = content.length > 200 ? content.slice(0, 200) + "…" : content;
  const firstCaption = displayCaptions[0] || "";

  // ── Processing Engine (loading state) ───────────────────────────────────────
  if (!stitchedReady) {
    return (
      <AppShell>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-[#0d0d0d] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { clearInterval(pollingRef.current!); navigate("/"); }} className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back
            </button>
            <div className="h-4 w-px bg-gray-800" />
            <span className="text-sm font-medium text-white">Processing Engine</span>
            <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5 text-[10px] text-amber-400 font-semibold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              AI CORE ACTIVE
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex gap-5 p-6">
          {/* ── Main content ── */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold mb-1">Processing Engine</h1>
              {content && (
                <p className="text-gray-400 text-sm">
                  Converting <span className="text-white">"{contentPreview.slice(0, 60)}{contentPreview.length > 60 ? "…" : ""}"</span> into a cinematic short-form video
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl font-bold text-white">{processingProgress}%</span>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Est. time remaining</p>
                  <p className="text-sm font-semibold text-gray-300">5–10 min</p>
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
            </div>

            {/* Clip thumbnails — compact film strip */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Clip Generation</span>
                <span className="text-xs text-gray-600">{videoUrlsFilled} / {totalClips} ready</span>
              </div>
              <div className="flex gap-2">
                {clips.map((url, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden relative"
                      style={{ aspectRatio: "9/16", maxWidth: "54px", margin: "0 auto" }}
                    >
                      {url ? (
                        <>
                          <video src={url} className="w-full h-full object-cover" muted playsInline />
                          <div className="absolute inset-0 flex items-end justify-center pb-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Spinner size={10} />
                        </div>
                      )}
                    </div>
                    <span className={`text-[9px] font-medium tracking-wide uppercase ${url ? "text-emerald-500" : "text-gray-700"}`}>
                      {url ? "Ready" : `Clip ${i + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Source + Script cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
                  </svg>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Original Source</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">
                  {contentPreview || "No source content available."}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Script Summary</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">
                  {firstCaption || "Generating script…"}
                </p>
              </div>
            </div>

            {/* Email notification */}
            {userEmail && (
              <div className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400 flex-shrink-0 mt-0.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <div>
                  <p className="text-sm text-gray-200">This usually takes <span className="text-white font-medium">10–15 minutes</span>.</p>
                  <p className="text-xs text-gray-400 mt-0.5">We'll email <span className="text-gray-300">{userEmail}</span> when your video is ready — you can safely leave this page.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Process Observability sidebar ── */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-0">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Process Observability</h3>
              <div className="space-y-1">
                {obsSteps.map((step, i) => (
                  <div key={i} className="flex gap-3 py-2.5">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        step.done ? "bg-emerald-500" : step.active ? "bg-gray-800 border border-emerald-500/40" : "bg-gray-800 border border-gray-700"
                      }`}>
                        {step.done ? (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l2.5 2.5 5.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : step.active ? (
                          <Spinner size={10} />
                        ) : (
                          <span className="text-[9px] text-gray-600 font-bold">{i + 1}</span>
                        )}
                      </div>
                      {i < obsSteps.length - 1 && (
                        <div className={`w-px flex-1 min-h-[12px] ${step.done ? "bg-emerald-500/40" : "bg-gray-800"}`} />
                      )}
                    </div>
                    <div className="pb-1">
                      <p className={`text-sm font-medium leading-tight ${step.done ? "text-emerald-400" : step.active ? "text-white" : "text-gray-600"}`}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-gray-600 mt-0.5">{step.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { clearInterval(pollingRef.current!); navigate("/"); }}
                className="w-full mt-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-semibold transition-colors"
              >
                Stop Engine
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Preview Canvas (ready state) ────────────────────────────────────────────
  return (
    <AppShell>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-[#0d0d0d] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Dashboard
          </button>
          <div className="h-4 w-px bg-gray-800" />
          <span className="text-sm font-medium text-white">Preview Canvas</span>
          <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5 text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            AI Video Ready
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-1.5 border border-gray-700 hover:border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:text-white transition-colors">
            Refine Script
          </button>
          {igConnected === false ? (
            <button
              onClick={handleConnectInstagram}
              disabled={connectingIg}
              className="flex items-center gap-2 px-4 py-1.5 border border-pink-500/40 hover:border-pink-500/70 bg-pink-500/10 hover:bg-pink-500/20 rounded-lg text-sm font-semibold text-pink-400 hover:text-pink-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {connectingIg ? <><Spinner size={13} /> Connecting…</> : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
                  </svg>
                  Connect Instagram
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handlePostToInstagram}
              disabled={posting || posted || igConnected === null}
              className="flex items-center gap-2 px-4 py-1.5 border border-pink-500/40 hover:border-pink-500/70 bg-pink-500/10 hover:bg-pink-500/20 rounded-lg text-sm font-semibold text-pink-400 hover:text-pink-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title={igUsername ? `Connected as @${igUsername}` : undefined}
            >
              {posting ? (
                <><Spinner size={13} /> Posting…</>
              ) : posted ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Posted!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
                  </svg>
                  {igUsername ? `Post as @${igUsername}` : "Post to Instagram"}
                </>
              )}
            </button>
          )}
          <button
            onClick={() => navigate(`/studio/${projectId}`, {
              state: { result, captionStyle, transitionStyle, captions: displayCaptions, content },
            })}
            className="flex items-center gap-2 px-4 py-1.5 border border-gray-700 hover:border-gray-500 rounded-lg text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Open Editor
          </button>
          <a
            href={result.stitched_video_url!}
            download
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition-colors"
          >
            Export All
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex">
        {/* ── Scene segments sidebar ── */}
        <div className="w-72 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scene Segments</h3>
            <p className="text-[10px] text-gray-600 mt-0.5">AI Value Ready</p>
          </div>
          <div className="divide-y divide-gray-800/60">
            {displayCaptions.map((text, i) => {
              const start = `00:${String(i * 5).padStart(2, "0")}`;
              const end = `00:${String((i + 1) * 5).padStart(2, "0")}`;
              return (
                <div key={i} className="px-4 py-4 hover:bg-gray-900/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-600 font-medium uppercase tracking-wide">Segment {i + 1}</span>
                    <span className="text-[10px] text-gray-600">{start} — {end}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Center: video player ── */}
        <div className="flex-1 flex flex-col items-center justify-start py-8 px-6 overflow-y-auto">
          <div className="w-full max-w-xs space-y-5">
            {/* Video */}
            <div className="aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
              <video
                src={result.stitched_video_url!}
                controls
                autoPlay
                muted
                playsInline
                className="w-full h-full"
              />
            </div>
            {/* Download button — prominent, below the player */}
            <a
              href={result.stitched_video_url!}
              download
              className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-sm font-bold transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Video
            </a>

            {/* Instagram caption */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-800">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-pink-400">
                  <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/>
                </svg>
                <h3 className="font-semibold text-sm">Share on Instagram & TikTok</h3>
              </div>
              <div className="p-4">
                {instagramCaption ? (
                  <>
                    {editingCaption ? (
                      <textarea
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
                        rows={8}
                        value={editedCaption || instagramCaption}
                        onChange={(e) => setEditedCaption(e.target.value)}
                      />
                    ) : (
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{instagramCaption}</p>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                      <span className={`text-[10px] ${charCount > 2200 ? "text-red-400" : "text-gray-600"}`}>
                        {charCount.toLocaleString()} / 2,200
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingCaption(!editingCaption); if (editingCaption && !editedCaption) setEditedCaption(""); }}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors"
                        >
                          {editingCaption ? "Done" : "Edit"}
                        </button>
                        <button
                          onClick={handleCopy}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {copied ? "✓ Copied!" : "Copy Caption"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 py-1">
                    <Spinner size={14} />
                    <span className="text-xs">Generating caption…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Caption Outro */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div>
                  <h3 className="font-semibold text-sm">Caption Outro</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">Appended to every Instagram caption</p>
                </div>
                {!editingOutro && (
                  <button
                    onClick={() => setEditingOutro(true)}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    {captionOutro ? "Edit" : "Add"}
                  </button>
                )}
              </div>
              <div className="p-4">
                {editingOutro ? (
                  <>
                    <textarea
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
                      rows={4}
                      placeholder={'e.g. "Comment LINK and I\'ll DM you the full guide 👇"'}
                      value={captionOutro}
                      onChange={(e) => setCaptionOutro(e.target.value)}
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setEditingOutro(false)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveOutro}
                        disabled={savingOutro}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 rounded-lg text-xs font-semibold transition-colors"
                      >
                        {savingOutro ? "Saving…" : outroSaved ? "✓ Saved!" : "Save"}
                      </button>
                    </div>
                  </>
                ) : captionOutro ? (
                  <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{captionOutro}</p>
                ) : (
                  <p className="text-xs text-gray-600 italic">No outro set — click Add to create one.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="w-56 flex-shrink-0 border-l border-gray-800 p-4 space-y-3 overflow-y-auto">

          {/* Video stats */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-3">Video Details</span>
            <div className="space-y-2.5">
              {[
                { label: "Duration", value: "~25 sec" },
                { label: "Aspect Ratio", value: "9:16" },
                { label: "Resolution", value: "1080p" },
                { label: "Format", value: "MP4 H.264" },
                { label: "Clips", value: `${totalClips} segments` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-600">{label}</span>
                  <span className="text-[11px] font-medium text-gray-300">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Caption style used */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Caption Style</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold text-white capitalize">
                {captionStyle === "lower-third" ? "Lower Third" : captionStyle === "none" ? "Off" : captionStyle.charAt(0).toUpperCase() + captionStyle.slice(1)}
              </span>
            </div>
          </div>

          {/* Transition style used */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Transitions</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold text-white capitalize">{transitionStyle}</span>
            </div>
          </div>

          {/* Video source used */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Video Source</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-semibold text-white">
                {videoSource === "ai" ? "AI Generated" : videoSource === "stock" ? "Stock Footage" : "Mix (AI + Stock)"}
              </span>
            </div>
          </div>

          {/* Start over */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Create Another</span>
            <p className="text-[11px] text-gray-600 leading-relaxed mb-3">Turn a different article into a short-form video.</p>
            <button
              onClick={() => navigate("/")}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-semibold text-gray-300 hover:text-white transition-colors"
            >
              Start Over
            </button>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
