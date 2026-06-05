import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as tus from "tus-js-client";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const LOG_LINES = [
  { text: "$ Initializing AI pipeline...", color: "text-gray-400" },
  { text: "✓ Article fetched successfully", color: "text-emerald-400" },
  { text: "✓ Narrative structure analyzed", color: "text-emerald-400" },
  { text: "✓ Key moments extracted", color: "text-emerald-400" },
  { text: "› Generating script segments...", color: "text-amber-400" },
  { text: "› Optimizing for short-form...", color: "text-amber-400" },
  { text: "› Writing caption variations...", color: "text-amber-400" },
  { text: "⠦ Finalizing your content...", color: "text-gray-400" },
];

const FEATURES = [
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 2v3M9 13v3M2 9h3M13 9h3M4 4l2 2M12 12l2 2M4 14l2-2M12 6l2-2"/></svg>,
    title: "AI caption generation",
    desc: "Five hook options for every clip, across all five clips — different angles, tones, and energy. Pick the line that sounds like you.",
  },
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="7" y="2" width="4" height="9" rx="2"/><path d="M4 9a5 5 0 0 0 10 0M9 14v2M6 16h6"/></svg>,
    title: "Natural voiceover",
    desc: "A human-sounding voice, timed to the beat and synced to the captions. Pick from multiple presets.",
  },
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M2 7h14M6 4v10"/></svg>,
    title: "Cinematic B-roll",
    desc: "AI curates and generates visuals that match every caption. No stock library subscription needed.",
  },
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h8l-3-3M15 12H7l3 3"/></svg>,
    title: "Automatic stitching",
    desc: "Five clips, transitions, audio, captions — all synced into a single polished cut. No timeline, no keyframes.",
  },
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h8l-2-2M3 4l2 2M15 14H7l2 2M15 14l-2-2M2 9h14"/></svg>,
    title: "Inline editing",
    desc: "Fine-tune any caption, swap a hook, regenerate a clip — before anything hits the render queue.",
  },
  {
    icon: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M2 6l7 5 7-5"/></svg>,
    title: "Email delivery",
    desc: "Drop your URL and walk away. We'll ping you the moment the render lands — usually 3 minutes.",
  },
];

const TRANSITIONS = [
  { name: "Hard cut", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="6" y="10" width="14" height="24" rx="2"/><rect x="24" y="10" width="14" height="24" rx="2" opacity=".4"/></svg> },
  { name: "Whip pan", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 22h8M30 22h8M18 14l6 8-6 8M26 14l-6 8 6 8"/></svg> },
  { name: "Zoom", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="22" cy="22" r="6"/><circle cx="22" cy="22" r="12" opacity=".5"/><circle cx="22" cy="22" r="18" opacity=".2"/></svg> },
  { name: "Smooth", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 22c6-8 12-8 16 0s10 8 16 0"/></svg> },
  { name: "Glitch", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 22h6M18 16v12M22 22h6M30 16v12"/></svg> },
  { name: "Blur", icon: <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="22" cy="22" r="14" opacity=".4"/><circle cx="22" cy="22" r="10" opacity=".7"/><circle cx="22" cy="22" r="6"/></svg> },
];

const FAQ_ITEMS = [
  { q: "How long does a video take to render?", a: "About three minutes on average. You'll get an email the moment it's ready — no need to keep the tab open." },
  { q: "What kinds of articles work best?", a: "Anything with a clear narrative — news stories, blog posts, opinion pieces, newsletter editions. We've also had users feed in research paper abstracts with great results." },
  { q: "Can I edit the video after it's generated?", a: "Yes. You can re-pick a different hook for any clip, swap transition styles, or tweak the final IG caption — all before you download." },
  { q: "Does ClipFrom post to Instagram for me?", a: "Not yet — we deliver the video file and the caption as a copy-paste block. Direct publishing is on our roadmap." },
  { q: "What about TikTok and YouTube Shorts?", a: "Same 9:16 output works for all three. Paste, post, done." },
  { q: "Who owns the generated videos?", a: "You do. Full commercial rights on every plan." },
];

const C = {
  bg: "oklch(14% 0.015 250)",
  accent: "oklch(72% 0.17 280)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(65% 0.01 250)",
  fgDim: "oklch(45% 0.01 250)",
  strokeSoft: "oklch(100% 0 0 / 0.08)",
  strokeMed: "oklch(100% 0 0 / 0.13)",
  surface: "oklch(18% 0.015 250)",
  surfaceRaised: "oklch(21% 0.015 250)",
} as const;

const serif = '"Instrument Serif", Georgia, serif';
const mono = '"Geist Mono", monospace';

const TYPING_URLS = [
  "nytimes.com/ai-is-rewriting-work",
  "stratechery.com/apple-next-era",
  "every.to/4-day-week-data",
  "substack.com/p/great-work-playbook",
];

const VIDEO_LOG_LINES = [
  { text: "$ Uploading video to secure storage...", color: "text-gray-400" },
  { text: "✓ Upload complete", color: "text-emerald-400" },
  { text: "✓ Video received by transcription engine", color: "text-emerald-400" },
  { text: "› Analyzing speech patterns...", color: "text-amber-400" },
  { text: "› Extracting word-level timestamps...", color: "text-amber-400" },
  { text: "› Preparing caption overlay...", color: "text-amber-400" },
  { text: "⠦ Finalizing transcript...", color: "text-gray-400" },
];

const ArticleInput = () => {
  const [inputMode, setInputMode] = useState<"url" | "text" | "video">("url");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(180);
  const [visibleLines, setVisibleLines] = useState(0);
  const [typedUrl, setTypedUrl] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeTransition, setActiveTransition] = useState(0);

  const [credits, setCredits] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const navigate = useNavigate();
  const { user, session } = useAuth();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingStateRef = useRef({ idx: 0, charIdx: 0, typing: true });
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("credits_remaining, is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setCredits(data.credits_remaining); setIsAdmin(data.is_admin ?? false); }
      });
  }, [user?.id]);

  const stages = ["Analyzing your content…", "Extracting key insights…", "Generating captions…", "Polishing results…"];

  useEffect(() => {
    if (!isLoading) return;
    setProgress(0); setStage(0); setTimeRemaining(180); setVisibleLines(0);
    const p = setInterval(() => setProgress((v) => Math.min(v + 0.6, 95)), 1000);
    const s = setInterval(() => setStage((v) => (v + 1) % stages.length), 20000);
    const t = setInterval(() => setTimeRemaining((v) => Math.max(v - 1, 0)), 1000);
    const l = setInterval(() => setVisibleLines((v) => Math.min(v + 1, LOG_LINES.length)), 3000);
    return () => { clearInterval(p); clearInterval(s); clearInterval(t); clearInterval(l); };
  }, [isLoading]);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  useEffect(() => {
    if (isLoading) return;
    function tick() {
      const st = typingStateRef.current;
      const target = TYPING_URLS[st.idx];
      if (st.typing) {
        st.charIdx++;
        setTypedUrl(target.slice(0, st.charIdx));
        typingTimerRef.current = setTimeout(tick, st.charIdx >= target.length ? 2200 : 40 + Math.random() * 30);
        if (st.charIdx >= target.length) st.typing = false;
      } else {
        st.charIdx--;
        setTypedUrl(target.slice(0, st.charIdx));
        if (st.charIdx <= 0) { st.typing = true; st.idx = (st.idx + 1) % TYPING_URLS.length; typingTimerRef.current = setTimeout(tick, 400); }
        else typingTimerRef.current = setTimeout(tick, 18);
      }
    }
    typingTimerRef.current = setTimeout(tick, 1500);
    return () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current); };
  }, [isLoading]);

  const testMode = import.meta.env.VITE_TEST_MODE === "true";

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (user && !isAdmin && credits !== null && credits < 1) {
      toast.error("You're out of credits. Upgrade to generate more videos.");
      return;
    }

    // ── Video upload mode ──────────────────────────────────────────────────────
    if (inputMode === "video") {
      if (!videoFile) { toast.error("Please select a video file"); return; }
      if (!user) { navigate("/login?returnTo=/"); return; }
      // Supabase Pro tier — limit raised to 200 MB. TUS handles chunked upload.
      const MAX_SIZE_MB = 200;
      if (videoFile.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`Video is too large (${(videoFile.size / 1024 / 1024).toFixed(0)} MB). Maximum is ${MAX_SIZE_MB} MB.`);
        return;
      }

      setIsLoading(true);
      let projectId: string | null = null;
      let uploadedFilePath: string | null = null;
      try {
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .insert({ source_mode: "video", status: "processing", user_id: user.id })
          .select("id").single();
        if (projectError) throw new Error("Failed to create project");
        projectId = projectData.id;

        const safeFileName = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${user.id}/${projectId}/${safeFileName}`;
        const mimeType = videoFile.type.startsWith("video/") ? videoFile.type : "video/mp4";

        // Use TUS resumable upload — Supabase's standard endpoint caps at ~50MB
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const { data: { session: uploadSession } } = await supabase.auth.getSession();
        const accessToken = uploadSession?.access_token ?? supabaseAnonKey;

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(videoFile, {
            endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              authorization: `Bearer ${accessToken}`,
              "x-upsert": "true",
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
              bucketName: "user-videos",
              objectName: filePath,
              contentType: mimeType,
              cacheControl: "3600",
            },
            chunkSize: 6 * 1024 * 1024,
            onError: (err) => reject(new Error(`Upload failed: ${err.message}`)),
            onSuccess: () => resolve(),
          });
          upload.start();
        });
        uploadedFilePath = filePath;

        const { data: { publicUrl } } = supabase.storage.from("user-videos").getPublicUrl(filePath);

        const videoDurationFrames = await new Promise<number>((resolve) => {
          const vid = document.createElement("video");
          vid.preload = "metadata";
          vid.onloadedmetadata = () => { resolve(Math.round(vid.duration * 30)); URL.revokeObjectURL(vid.src); };
          vid.onerror = () => resolve(0);
          vid.src = URL.createObjectURL(videoFile);
        });

        const resolvedEmail = user.email ?? "";
        const transcribeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-video`;
        const res = await fetch(transcribeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ project_id: projectId, video_url: publicUrl, video_duration_frames: videoDurationFrames }),
        });
        if (!res.ok) throw new Error("Transcription request failed");

        // Poll for captions_ready
        const pollStart = Date.now();
        pollingRef.current = setInterval(async () => {
          if (Date.now() - pollStart > 3 * 60 * 1000) {
            clearInterval(pollingRef.current!); setIsLoading(false);
            toast.error("Transcription is taking too long. Please try again."); return;
          }
          try {
            const { data } = await supabase
              .from("ai_generations")
              .select("status, transcript_words")
              .eq("project_id", projectId!).maybeSingle();
            if (data?.status === "captions_ready") {
              clearInterval(pollingRef.current!);
              const wordCount = Array.isArray(data.transcript_words)
                ? (data.transcript_words as { type: string }[]).filter(w => w.type === "word").length
                : 0;
              navigate(`/video-style/${projectId}`, { state: { userEmail: resolvedEmail, wordCount } });
            }
          } catch { /* continue polling */ }
        }, 3000);
      } catch (error) {
        // Clean up orphaned DB row and storage file so the user can retry cleanly
        if (projectId) {
          await supabase.from("projects").delete().eq("id", projectId);
        }
        if (uploadedFilePath) {
          await supabase.storage.from("user-videos").remove([uploadedFilePath]);
        }
        toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
        setIsLoading(false);
      }
      return;
    }

    // ── Article mode ───────────────────────────────────────────────────────────
    let content: string;
    if (inputMode === "url") {
      content = articleUrl.trim();
      if (!content) { toast.error("Please enter an article URL"); return; }
      try { new URL(content); } catch { toast.error("Please enter a valid URL"); return; }
    } else {
      content = articleText.trim();
      if (!content) { toast.error("Please paste some article text"); return; }
      if (content.length < 50) { toast.error("Please paste more text — at least a paragraph"); return; }
    }

    // Test mode: skip auth + API, go straight to editor with fake captions
    if (testMode) {
      navigate("/editor", {
        state: {
          projectId: "test-project-id",
          userEmail: "test@example.com",
          content,
          inputMode,
          captions: {
            text1: "🚀 AI is rewriting the rules of work faster than anyone expected.",
            text2: "Three breakthroughs in six months have quietly changed everything we know. 🧠",
            text3: "Researchers are stunned. The results speak for themselves. 📊",
            text4: "This isn't science fiction anymore — it's your Monday morning news. ⚡",
            text5: "The question isn't whether this changes your industry. It's whether you'll be ready. 🎯",
          },
        },
      });
      return;
    }

    if (!user) { navigate("/login?returnTo=/"); return; }

    const resolvedEmail = user.email ?? userEmail.trim();
    if (!resolvedEmail) { toast.error("Could not determine email address"); return; }

    setIsLoading(true);
    try {
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-content`;

      const { data: projectData, error: projectError } = await supabase
        .from("projects").insert({ article_url: inputMode === "url" ? content : null, status: "processing", user_id: user.id }).select("id").single();
      if (projectError) throw new Error("Failed to initialize project. Please try again.");

      const projectId = projectData.id;
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`, "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ content, type: inputMode, project_id: projectId, user_email: resolvedEmail }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Pipeline failed: ${response.statusText}`);
      }

      const result = await response.json();
      const captionList: string[] = result.caption_options ?? [];
      if (captionList.length === 0) throw new Error("No captions returned — please try again.");
      const captionForEditor = captionList.reduce(
        (acc: Record<string, string>, text: string, i: number) => ({ ...acc, [`text${i + 1}`]: text }),
        {}
      );
      navigate("/editor", { state: { projectId, userEmail: resolvedEmail, content, inputMode, captions: captionForEditor } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process your content. Please try again.");
      setIsLoading(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ── Loading screen ── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, oklch(72% 0.17 280 / 0.08) 0%, transparent 70%)" }} />
        <div className="relative z-10 w-full max-w-lg text-center">
          <div className="text-7xl font-bold tabular-nums mb-2">{Math.round(progress)}%</div>
          <p className="text-gray-400 text-sm mb-1 h-5 transition-all">{stages[stage]}</p>
          <p className="text-gray-600 text-xs mb-8">Estimated {formatTime(timeRemaining)} remaining</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-10 overflow-hidden">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${progress}%`, boxShadow: "0 0 12px oklch(72% 0.17 280 / 0.8), 0 0 24px oklch(72% 0.17 280 / 0.3)" }} />
          </div>
          <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl overflow-hidden text-left">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-800 bg-[#111]">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" /><div className="w-3 h-3 rounded-full bg-[#febc2e]" /><div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-xs text-gray-500 font-medium select-none">{inputMode === "video" ? "AI Studio — Transcribing" : "AI Studio — Processing"}</span>
            </div>
            <div className="p-4 font-mono text-xs space-y-1.5 min-h-[160px]">
              {(inputMode === "video" ? VIDEO_LOG_LINES : LOG_LINES).slice(0, visibleLines).map((line, i) => (
                <div key={i} className={`${line.color} leading-relaxed`}>
                  {line.text}
                  {i === visibleLines - 1 && <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1 animate-pulse align-middle" />}
                </div>
              ))}
              {visibleLines === 0 && <div className="text-gray-600">&nbsp;<span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1 animate-pulse align-middle" /></div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Landing page ── */
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        .cf-hero-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 72px; align-items: center; }
        .cf-step-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; margin-bottom: 80px; }
        .cf-step-grid-last { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
        .cf-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 48px; }
        .cf-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
        .cf-nav-links { display: flex; align-items: center; gap: 24px; }
        @keyframes cf-float-l { 0%,100% { transform: rotate(-10deg) translateY(0px); } 50% { transform: rotate(-10deg) translateY(-10px); } }
        @keyframes cf-float-c { 0%,100% { transform: rotate(-1deg) translateY(0px); } 50% { transform: rotate(-1deg) translateY(-8px); } }
        @keyframes cf-float-r { 0%,100% { transform: rotate(8deg) translateY(0px); } 50% { transform: rotate(8deg) translateY(-12px); } }
        .cf-card-l { animation: cf-float-l 5.5s ease-in-out infinite; }
        .cf-card-c { animation: cf-float-c 5.5s ease-in-out infinite 0.7s; }
        .cf-card-r { animation: cf-float-r 5.5s ease-in-out infinite 1.4s; }
        .cf-scanlines { position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.45) 3px, rgba(255,255,255,0.45) 4px); opacity: 0.03; pointer-events: none; }
        @keyframes cf-badge-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .cf-badge { display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px; border-radius: 999px; border: 1px solid oklch(72% 0.17 280 / 0.28); background: oklch(72% 0.17 280 / 0.07); color: oklch(72% 0.17 280); font-size: 11px; font-family: "Geist Mono", monospace; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 32px; position: relative; overflow: hidden; }
        .cf-badge::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, oklch(72% 0.17 280 / 0.15) 50%, transparent 100%); background-size: 200% 100%; animation: cf-badge-shimmer 3s linear infinite; }
        .cf-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: oklch(72% 0.17 280); box-shadow: 0 0 6px oklch(72% 0.17 280); flex-shrink: 0; }
        .cf-h1-em { color: oklch(72% 0.17 280); font-style: italic; position: relative; display: inline-block; }
        .cf-h1-em::after { content: ''; position: absolute; left: 0; right: 0; bottom: -3px; height: 1.5px; background: linear-gradient(90deg, oklch(72% 0.17 280), transparent); opacity: 0.5; }
        .cf-card-stat { display: flex; align-items: center; gap: 3px; font-size: 8px; font-family: "Geist Mono", monospace; color: rgba(255,255,255,0.55); }
        @media (max-width: 1000px) {
          .cf-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .cf-reel-stack { display: none !important; }
          .cf-step-grid, .cf-step-grid-last { grid-template-columns: 1fr !important; gap: 32px !important; }
          .cf-flip { order: 0 !important; }
          .cf-features-grid { grid-template-columns: 1fr 1fr !important; }
          .cf-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
          .cf-nav-links { display: none !important; }
        }
        @media (max-width: 600px) {
          .cf-features-grid { grid-template-columns: 1fr !important; }
          .cf-footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ background: C.bg, color: C.fg, fontFamily: '"Geist", system-ui, sans-serif', minHeight: "100vh" }}>

        {/* ── Nav ── */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", background: "oklch(14% 0.015 250 / 0.85)", borderBottom: `1px solid ${C.strokeSoft}` }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="oklch(14% 0.015 250)"><polygon points="6,3 20,12 6,21"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>ClipFrom</span>
            </div>
            <div className="cf-nav-links">
              <button onClick={() => navigate("/features")} style={{ background: "none", border: "none", color: C.fgMuted, fontSize: 14, cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = C.fg)} onMouseLeave={e => (e.currentTarget.style.color = C.fgMuted)}>Features</button>
              {["Showcase", "Pricing"].map(l => (
                <span key={l} style={{ color: C.fgDim, fontSize: 14, opacity: 0.5, cursor: "not-allowed" }}>{l}</span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {user ? (
                <button onClick={() => navigate("/dashboard")} style={{ background: "none", border: "none", color: C.fgMuted, fontSize: 14, cursor: "pointer", padding: 0 }}>Dashboard</button>
              ) : (
                <button onClick={() => navigate("/login")} style={{ background: "none", border: "none", color: C.fgMuted, fontSize: 14, cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.fg)} onMouseLeave={e => (e.currentTarget.style.color = C.fgMuted)}>Login</button>
              )}
              <button onClick={() => user ? heroRef.current?.scrollIntoView({ behavior: "smooth" }) : navigate("/login")}
                style={{ padding: "7px 18px", background: C.accent, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "oklch(14% 0.015 250)", cursor: "pointer" }}>
                Get Started
              </button>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section ref={heroRef} style={{ position: "relative", paddingTop: 136, paddingBottom: 100, paddingLeft: 24, paddingRight: 24, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-30%)", width: 900, height: 600, pointerEvents: "none",
            background: "radial-gradient(ellipse at center, oklch(72% 0.17 280 / 0.09) 0%, oklch(72% 0.17 280 / 0.04) 40%, transparent 70%)" }} />
          <div style={{ position: "absolute", top: "20%", right: -100, width: 500, height: 500, pointerEvents: "none",
            background: "radial-gradient(ellipse at center, oklch(65% 0.15 240 / 0.06) 0%, transparent 65%)" }} />
          <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <div className="cf-hero-grid">

              {/* Left */}
              <div>
                <div className="cf-badge">
                  <span className="cf-badge-dot" />
                  Article → Reels in minutes
                </div>
                <h1 style={{ fontFamily: serif, fontSize: "clamp(3rem, 4.8vw, 4.4rem)", fontWeight: 400, lineHeight: 1.03, letterSpacing: "-0.025em", margin: "0 0 22px" }}>
                  Turn any article into<br /><span className="cf-h1-em">Reels that perform.</span>
                </h1>
                <p style={{ color: C.fgMuted, fontSize: 16, lineHeight: 1.65, maxWidth: 420, margin: "0 0 36px" }}>
                  Paste a URL, walk away. ClipFrom writes the script, records the voice, sources B-roll, and stitches five 9:16 clips — ready to post on Instagram.
                </p>

                <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
                  {/* Input card */}
                  <div style={{ background: C.surface, border: `1px solid ${C.strokeMed}`, borderRadius: 18, overflow: "hidden",
                    boxShadow: `0 0 0 1px oklch(72% 0.17 280 / 0.08), 0 32px 64px oklch(0% 0 0 / 0.5), 0 0 80px oklch(72% 0.17 280 / 0.07)` }}>
                    {/* Mode tabs — inside the card */}
                    <div style={{ display: "flex", gap: 3, padding: 5, background: `oklch(12% 0.015 255)`, borderBottom: `1px solid ${C.strokeSoft}` }}>
                      {([["url", "URL"], ["text", "Paste Text"], ["video", "Upload Video"]] as const).map(([mode, label]) => (
                        <button key={mode} type="button" onClick={() => setInputMode(mode)}
                          style={{ flex: 1, padding: "7px 12px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                            background: inputMode === mode ? C.accent : "transparent",
                            color: inputMode === mode ? "oklch(11% 0.018 255)" : C.fgMuted,
                            boxShadow: inputMode === mode ? "0 2px 8px oklch(72% 0.17 280 / 0.3)" : "none" }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.strokeSoft}` }}>
                      {inputMode === "url" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.fgMuted} strokeWidth="2" style={{ flexShrink: 0 }}>
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                          </svg>
                          <div style={{ position: "relative", flex: 1 }}>
                            <input type="text" value={articleUrl} onChange={e => setArticleUrl(e.target.value)}
                              style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.fg, fontSize: 14, fontFamily: mono, position: "relative", zIndex: 1 }} />
                            {!articleUrl && (
                              <div style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", fontFamily: mono, fontSize: 14, color: C.fgMuted, display: "flex", alignItems: "center", lineHeight: "normal" }}>
                                {typedUrl}<span style={{ display: "inline-block", width: 1.5, height: "1em", background: C.accent, marginLeft: 1, verticalAlign: "middle", opacity: 0.9 }} />
                              </div>
                            )}
                          </div>
                        </div>
                      ) : inputMode === "text" ? (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.fgMuted} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <textarea value={articleText} onChange={e => setArticleText(e.target.value)}
                            placeholder="Paste your article or content here…" rows={4}
                            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.fg, fontSize: 14, resize: "none", lineHeight: 1.6, fontFamily: '"Geist", system-ui, sans-serif' }} />
                        </div>
                      ) : (
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 16px", cursor: "pointer", textAlign: "center" }}>
                          <input type="file" accept="video/*" style={{ display: "none" }} onChange={e => setVideoFile(e.target.files?.[0] ?? null)} />
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={videoFile ? C.accent : C.fgMuted} strokeWidth="1.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          {videoFile ? (
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.fg }}>{videoFile.name}</p>
                              {videoFile.size > 200 * 1024 * 1024 ? (
                                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171", fontWeight: 600 }}>
                                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB — exceeds the 200 MB limit. Please trim or compress your video.
                                </p>
                              ) : (
                                <p style={{ margin: "4px 0 0", fontSize: 11, color: C.fgMuted }}>{(videoFile.size / 1024 / 1024).toFixed(1)} MB · click to change</p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.fg }}>Click to upload your video</p>
                              <p style={{ margin: "4px 0 0", fontSize: 11, color: C.fgMuted }}>MP4, MOV, WebM · max 200 MB</p>
                            </div>
                          )}
                        </label>
                      )}
                    </div>
                    {user ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.strokeSoft}` }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.fgMuted} strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <span style={{ flex: 1, fontSize: 14, color: C.fgMuted }}>Notification → <span style={{ color: C.fg }}>{user.email}</span></span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.strokeSoft}` }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.fgMuted} strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <input type="email" value={userEmail} onChange={e => setUserEmail(e.target.value)}
                          placeholder="your@email.com — we'll notify you when it's ready"
                          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.fg, fontSize: 14 }} />
                      </div>
                    )}
                    <div style={{ padding: 10 }}>
                      {(() => {
                        const outOfCredits = user && !isAdmin && credits !== null && credits < 1;
                        const videoTooLarge = inputMode === "video" && !!videoFile && videoFile.size > 200 * 1024 * 1024;
                        return (
                          <button
                            type="submit"
                            disabled={!!outOfCredits || videoTooLarge}
                            style={{
                              width: "100%", padding: "13px 0", background: outOfCredits || videoTooLarge ? "oklch(30% 0.01 250)" : C.accent,
                              border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
                              color: outOfCredits || videoTooLarge ? "oklch(55% 0.01 250)" : "oklch(11% 0.018 255)",
                              cursor: outOfCredits || videoTooLarge ? "not-allowed" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                              boxShadow: outOfCredits || videoTooLarge ? "none" : "0 4px 20px oklch(72% 0.17 280 / 0.35), inset 0 1px 0 oklch(100% 0 0 / 0.15)",
                              transition: "all 0.15s",
                            }}
                          >
                            {outOfCredits ? "No credits remaining" : videoTooLarge ? "Video too large (max 200 MB)" : inputMode === "video" ? "Upload & Transcribe" : "Generate my video"}
                            {!outOfCredits && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14 }}>
                    {(inputMode === "video"
                      ? ["9:16 vertical", "Auto captions", "B-roll added"]
                      : ["9:16 vertical", "AI voiceover", "~3 min render"]
                    ).map(item => (
                      <span key={item} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.fgMuted, fontFamily: mono }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
                        {item}
                      </span>
                    ))}
                  </div>
                </form>
              </div>

              {/* Right: reel stack — 3-card fan */}
              <div className="cf-reel-stack" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "relative", width: 460, height: 480 }}>

                  {/* Left card — dark red, rotated left */}
                  <div className="cf-card-l" style={{ position: "absolute", left: 0, top: 70, width: 178, height: 316, borderRadius: 20, overflow: "hidden", zIndex: 5,
                    background: "linear-gradient(160deg, oklch(32% 0.09 15), oklch(20% 0.05 10), oklch(12% 0.02 0))",
                    border: "1px solid oklch(100% 0 0 / 0.1)", boxShadow: "0 24px 48px oklch(0% 0 0 / 0.6), 0 0 0 1px oklch(100% 0 0 / 0.05)" }}>
                    <div className="cf-scanlines" />
                    {/* LIVE badge */}
                    <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 4, background: "oklch(0% 0 0 / 0.6)", borderRadius: 999, padding: "3px 8px" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff4444", display: "inline-block" }} />
                      <span style={{ fontFamily: mono, fontSize: 7, color: "#fff", fontWeight: 600, letterSpacing: "0.08em" }}>LIVE</span>
                    </div>
                    {/* Engagement stats */}
                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <div className="cf-card-stat">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                        <span>24.1k</span>
                      </div>
                      <div className="cf-card-stat">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        <span>847</span>
                      </div>
                    </div>
                    {/* Play */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "oklch(100% 0 0 / 0.1)", border: "1px solid oklch(100% 0 0 / 0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
                      </div>
                    </div>
                    {/* Caption */}
                    <div style={{ position: "absolute", bottom: 28, left: 10, right: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {["Most", "founders", "get", "this"].map(w => (
                          <span key={w} style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 5px", color: "#fff" }}>{w}</span>
                        ))}
                        <span style={{ background: "oklch(72% 0.17 280)", borderRadius: 4, padding: "2px 5px", color: "oklch(11% 0.018 255)", fontWeight: 800 }}>backwards</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ position: "absolute", bottom: 14, left: 10, right: 10 }}>
                      <div style={{ height: 2, background: "oklch(100% 0 0 / 0.1)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: "45%", height: "100%", background: "oklch(100% 0 0 / 0.45)", borderRadius: 999 }} />
                      </div>
                    </div>
                  </div>

                  {/* Center card — dark green, most prominent */}
                  <div className="cf-card-c" style={{ position: "absolute", left: 118, top: 0, width: 210, height: 374, borderRadius: 22, overflow: "hidden", zIndex: 10,
                    background: "linear-gradient(160deg, oklch(30% 0.08 160), oklch(21% 0.05 162), oklch(13% 0.02 165))",
                    border: "1px solid oklch(100% 0 0 / 0.13)", boxShadow: `0 0 0 1px oklch(72% 0.17 280 / 0.15), 0 40px 80px oklch(0% 0 0 / 0.7), 0 0 60px oklch(72% 0.17 280 / 0.1)` }}>
                    <div className="cf-scanlines" />
                    {/* Header row */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 13px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "oklch(0% 0 0 / 0.55)", borderRadius: 999, padding: "3px 8px" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff4444", display: "inline-block" }} />
                        <span style={{ fontFamily: mono, fontSize: 7, color: "#fff", fontWeight: 600, letterSpacing: "0.08em" }}>LIVE</span>
                      </div>
                      <div style={{ background: "oklch(72% 0.17 280 / 0.14)", border: "1px solid oklch(72% 0.17 280 / 0.28)", borderRadius: 999, padding: "3px 8px" }}>
                        <span style={{ fontFamily: mono, fontSize: 7, fontWeight: 600, color: C.accent, letterSpacing: "0.08em" }}>AI · CLIP 3/5</span>
                      </div>
                    </div>
                    {/* Side engagement buttons */}
                    <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                      {[
                        { icon: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>, fill: true, label: "48.2k" },
                        { icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>, fill: false, label: "1.4k" },
                        { icon: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>, fill: false, label: "Share" },
                      ].map(({ icon, fill, label }) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "oklch(100% 0 0 / 0.08)", border: "1px solid oklch(100% 0 0 / 0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={fill ? "white" : "none"} stroke={fill ? "none" : "white"} strokeWidth="2">{icon}</svg>
                          </div>
                          <span style={{ fontSize: 8, fontFamily: mono, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Play */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingRight: 40 }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "oklch(100% 0 0 / 0.1)", border: "1px solid oklch(100% 0 0 / 0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
                      </div>
                    </div>
                    {/* Caption */}
                    <div style={{ position: "absolute", bottom: 30, left: 12, right: 44 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.5, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {["AI", "isn't", "taking", "your", "job", "—"].map(w => (
                          <span key={w} style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 6px", color: "#fff" }}>{w}</span>
                        ))}
                        <span style={{ background: "oklch(72% 0.17 280)", borderRadius: 4, padding: "2px 6px", color: "oklch(11% 0.018 255)", fontWeight: 800 }}>it's</span>
                        <span style={{ background: "oklch(72% 0.17 280)", borderRadius: 4, padding: "2px 6px", color: "oklch(11% 0.018 255)", fontWeight: 800 }}>rewriting</span>
                        <span style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 6px", color: "#fff" }}>it</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ position: "absolute", bottom: 15, left: 13, right: 44 }}>
                      <div style={{ height: 2, background: "oklch(100% 0 0 / 0.1)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: "62%", height: "100%", background: C.accent, borderRadius: 999 }} />
                      </div>
                    </div>
                  </div>

                  {/* Right card — dark navy, rotated right */}
                  <div className="cf-card-r" style={{ position: "absolute", right: 0, top: 50, width: 178, height: 316, borderRadius: 20, overflow: "hidden", zIndex: 3,
                    background: "linear-gradient(160deg, oklch(26% 0.06 245), oklch(18% 0.04 248), oklch(12% 0.02 252))",
                    border: "1px solid oklch(100% 0 0 / 0.09)", boxShadow: "0 24px 48px oklch(0% 0 0 / 0.5)" }}>
                    <div className="cf-scanlines" />
                    {/* AI badge */}
                    <div style={{ position: "absolute", top: 12, right: 12, background: "oklch(72% 0.17 280 / 0.1)", border: "1px solid oklch(72% 0.17 280 / 0.22)", borderRadius: 7, padding: "3px 8px" }}>
                      <span style={{ fontFamily: mono, fontSize: 7, fontWeight: 600, color: C.accent, letterSpacing: "0.1em" }}>AI</span>
                    </div>
                    {/* Engagement stat */}
                    <div style={{ position: "absolute", top: 12, left: 12 }}>
                      <div className="cf-card-stat">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                        <span>18.7k</span>
                      </div>
                    </div>
                    {/* Play */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "oklch(100% 0 0 / 0.09)", border: "1px solid oklch(100% 0 0 / 0.13)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
                      </div>
                    </div>
                    {/* Caption */}
                    <div style={{ position: "absolute", bottom: 28, left: 10, right: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {["the", "rule"].map(w => (
                          <span key={w} style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 5px", color: "#fff" }}>{w}</span>
                        ))}
                        <span style={{ background: "oklch(72% 0.17 280)", borderRadius: 4, padding: "2px 5px", color: "oklch(11% 0.018 255)", fontWeight: 800 }}>that</span>
                        <span style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 5px", color: "#fff" }}>changed</span>
                        <span style={{ background: "oklch(0% 0 0 / 0.72)", borderRadius: 4, padding: "2px 5px", color: "#fff" }}>everything</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ position: "absolute", bottom: 14, left: 10, right: 10 }}>
                      <div style={{ height: 2, background: "oklch(100% 0 0 / 0.1)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: "75%", height: "100%", background: "oklch(100% 0 0 / 0.4)", borderRadius: 999 }} />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <div style={{ background: C.surface, borderTop: `1px solid ${C.strokeSoft}`, borderBottom: `1px solid ${C.strokeSoft}`, padding: "16px 24px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {["~3 min render", "5 clips", "4 voices", "6 transitions", "1080p", "0 code"].map((stat, i, arr) => (
              <span key={stat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 12, color: C.fgMuted }}>{stat}</span>
                {i < arr.length - 1 && <span style={{ color: C.fgDim }}>·</span>}
              </span>
            ))}
          </div>
        </div>

        {/* ── How It Works ── */}
        <section style={{ padding: "96px 24px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 80 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>— How it works</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(2rem, 3.5vw, 3rem)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>
                Three steps. One paste. <em>Done.</em>
              </h2>
            </div>

            {/* Step 01 */}
            <div className="cf-step-grid">
              <div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>STEP 01 / FETCH</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 16px" }}>Paste a URL.<br/>We fetch everything.</h3>
                <p style={{ color: C.fgMuted, fontSize: 15, lineHeight: 1.65, margin: "0 0 20px" }}>Drop any article link — blog post, news story, research paper. Our pipeline fetches the full text, finds the narrative arc, and generates hook variants before you close the tab.</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {["Works with any public URL", "Or paste the article text directly", "Multi-language support coming soon"].map(item => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.fgMuted }}>
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={C.accent} strokeWidth="2"><path d="M2 6l3 3 5-6"/></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ background: C.surface, border: `1px solid ${C.strokeMed}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 40px oklch(0% 0 0 / 0.3)" }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.strokeSoft}`, display: "flex", alignItems: "center", gap: 6 }}>
                    {["#ff5f57", "#febc2e", "#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, marginLeft: 8 }}>Processing article…</span>
                  </div>
                  <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Article fetched", val: "1,842 words", done: true },
                      { label: "Narrative parsed", val: "5 beats", done: true },
                      { label: "Hooks generated", val: "25 variants", done: true },
                      { label: "Matching B-roll", val: "rendering…", done: false },
                    ].map(({ label, val, done }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: done ? "oklch(72% 0.17 280 / 0.15)" : "oklch(60% 0.15 80 / 0.15)",
                          color: done ? C.accent : "oklch(80% 0.15 80)" }}>
                          {done
                            ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-6"/></svg>
                            : <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2"/></svg>}
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 12, color: C.fgMuted, flex: 1 }}>{label}</span>
                        <span style={{ fontFamily: mono, fontSize: 12, color: done ? C.accent : "oklch(80% 0.15 80)", fontWeight: 500 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 02 */}
            <div className="cf-step-grid">
              <div className="cf-flip" style={{ order: 2 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>STEP 02 / EDIT</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 16px" }}>Pick your hooks.<br/>Edit if you want.</h3>
                <p style={{ color: C.fgMuted, fontSize: 15, lineHeight: 1.65, margin: "0 0 20px" }}>Every clip gets five hook variants — different angles, tones, and energy. Lock the line that sounds like you, or rewrite in a tap.</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {["5 hooks × 5 clips", "Inline editing with keyword highlighting", "Regenerate until it's right"].map(item => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.fgMuted }}>
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={C.accent} strokeWidth="2"><path d="M2 6l3 3 5-6"/></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cf-flip" style={{ order: 1 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.strokeMed}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 40px oklch(0% 0 0 / 0.3)" }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.strokeSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.fgMuted }}>Clip 3 · Pick a hook</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.fgDim }}>5 options</span>
                  </div>
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { num: "01", text: "AI isn't taking your job — it's rewriting it.", selected: false },
                      { num: "02", text: "Most founders get this exactly backwards.", selected: true },
                      { num: "03", text: "What nobody tells you about AI and work.", selected: false },
                      { num: "04", text: "I tracked 200 AI rollouts. Here's what happened.", selected: false },
                    ].map(opt => (
                      <div key={opt.num} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8,
                        background: opt.selected ? "oklch(72% 0.17 280 / 0.08)" : C.surfaceRaised,
                        border: `1px solid ${opt.selected ? "oklch(72% 0.17 280 / 0.25)" : C.strokeSoft}` }}>
                        <span style={{ fontFamily: mono, fontSize: 10, color: opt.selected ? C.accent : C.fgDim, flexShrink: 0, marginTop: 2 }}>{opt.num}</span>
                        <span style={{ fontSize: 12, lineHeight: 1.5, color: opt.selected ? C.fg : C.fgMuted }}>{opt.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 03 */}
            <div className="cf-step-grid-last">
              <div>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>STEP 03 / POST</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 16px" }}>Download + caption.<br/>Paste into Reels.</h3>
                <p style={{ color: C.fgMuted, fontSize: 15, lineHeight: 1.65, margin: "0 0 20px" }}>Five clips, stitched with your chosen transition, voiceover, captions, and B-roll — delivered as one finished 9:16 video. Instagram caption included.</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {["9:16 vertical · 1080p · MP4", "Auto-generated IG caption with hashtags", "Email delivery — walk away while it renders"].map(item => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.fgMuted }}>
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke={C.accent} strokeWidth="2"><path d="M2 6l3 3 5-6"/></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ background: C.surface, border: `1px solid ${C.strokeMed}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 40px oklch(0% 0 0 / 0.3)" }}>
                  <div style={{ padding: 16, borderBottom: `1px solid ${C.strokeSoft}`, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 52, height: 88, borderRadius: 8, background: "linear-gradient(160deg, oklch(30% 0.05 155), oklch(18% 0.03 200))", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 500, marginBottom: 4 }}>ai-rewriting-work.mp4</div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, marginBottom: 12 }}>0:42 · 1080×1920 · 14.2 MB</div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: C.accent, borderRadius: 6, fontSize: 11, fontWeight: 600, color: "oklch(14% 0.015 250)", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>
                        Download video
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Instagram caption</span>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.accent, cursor: "pointer" }}>Copy</span>
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 1.7, color: C.fgMuted, margin: 0 }}>
                      Most founders get this exactly backwards ↓<br/><br/>
                      AI isn't replacing your team — it's changing what the team is for.{" "}
                      <span style={{ color: C.fgDim }}>#AI #Founders #Productivity #Startups</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" style={{ padding: "96px 24px", borderTop: `1px solid ${C.strokeSoft}` }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>— The full pipeline</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(2rem, 3.5vw, 3rem)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 16px" }}>
                Everything you'd normally <em>hire out</em>.
              </h2>
              <p style={{ color: C.fgMuted, fontSize: 16, maxWidth: 480, margin: "0 auto" }}>Script, voice, B-roll, captions, transitions, stitching. ClipFrom does all of it.</p>
            </div>
            <div className="cf-features-grid">
              {FEATURES.map(f => (
                <div key={f.title} style={{ background: C.surface, border: `1px solid ${C.strokeSoft}`, borderRadius: 14, padding: 24 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "oklch(72% 0.17 280 / 0.08)", border: "1px solid oklch(72% 0.17 280 / 0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, marginBottom: 14 }}>
                    {f.icon}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: C.fgMuted, lineHeight: 1.65 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            {/* Transitions band */}
            <div style={{ background: C.surface, border: `1px solid ${C.strokeSoft}`, borderRadius: 16, padding: 28 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Six transition styles, one click</div>
                <div style={{ fontSize: 13, color: C.fgMuted }}>Pick the one that matches your vibe.</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {TRANSITIONS.map((t, i) => (
                  <button key={t.name} onClick={() => setActiveTransition(i)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, cursor: "pointer", transition: "all 0.15s",
                      background: activeTransition === i ? "oklch(72% 0.17 280 / 0.1)" : C.surfaceRaised,
                      border: `1px solid ${activeTransition === i ? "oklch(72% 0.17 280 / 0.4)" : C.strokeSoft}`,
                      color: activeTransition === i ? C.accent : C.fgMuted }}>
                    <div style={{ width: 36, height: 36 }}>{t.icon}</div>
                    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.06em" }}>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "96px 24px", borderTop: `1px solid ${C.strokeSoft}` }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>— Common questions</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(2rem, 3.5vw, 3rem)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, margin: 0 }}>
                Answers, <em>upfront.</em>
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} style={{ background: C.surface, border: `1px solid ${C.strokeSoft}`, borderRadius: 12, overflow: "hidden" }}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{ width: "100%", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: C.fg }}>{item.q}</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={C.fgDim} strokeWidth="2" style={{ flexShrink: 0, transition: "transform 0.2s", transform: openFaq === i ? "rotate(180deg)" : "none" }}>
                      <path d="M4 6l4 4 4-4"/>
                    </svg>
                  </button>
                  {openFaq === i && (
                    <div style={{ padding: "0 20px 18px", fontSize: 14, color: C.fgMuted, lineHeight: 1.7 }}>{item.a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA band ── */}
        <section style={{ padding: "80px 24px", borderTop: `1px solid ${C.strokeSoft}` }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div style={{ background: "linear-gradient(135deg, oklch(18% 0.025 155), oklch(16% 0.015 250))",
              border: "1px solid oklch(72% 0.17 280 / 0.12)", borderRadius: 24, padding: "64px 48px", textAlign: "center",
              boxShadow: "0 0 60px oklch(72% 0.17 280 / 0.06)" }}>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(2rem, 3vw, 2.8rem)", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 16px" }}>
                Your next post is <em>one paste away</em>.
              </h2>
              <p style={{ color: C.fgMuted, fontSize: 16, margin: "0 0 32px" }}>Drop a URL. Walk away. Come back to a Reel you'd be proud to post.</p>
              <button onClick={() => heroRef.current?.scrollIntoView({ behavior: "smooth" })}
                style={{ padding: "14px 32px", background: C.accent, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700,
                  color: "oklch(14% 0.015 250)", cursor: "pointer", boxShadow: "0 0 30px oklch(72% 0.17 280 / 0.3)" }}>
                Generate my first video →
              </button>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, marginTop: 16 }}>Free to try · No credit card · ~3 min render</div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: `1px solid ${C.strokeSoft}`, padding: "56px 24px 40px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div className="cf-footer-grid">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 26, height: 26, background: C.accent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="oklch(14% 0.015 250)"><polygon points="6,3 20,12 6,21"/></svg>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>ClipFrom</span>
                </div>
                <p style={{ fontSize: 13, color: C.fgMuted, lineHeight: 1.7, maxWidth: 260, margin: 0 }}>Turn any article into short-form video that actually performs. Built for creators, newsletter writers, and content teams.</p>
              </div>
              {[
                { title: "Product", links: ["Features", "Showcase", "Pricing", "Changelog"] },
                { title: "Resources", links: ["Hook library", "Creator guide", "Blog", "Help center"] },
                { title: "Company", links: ["About", "Careers", "Contact", "Terms"] },
              ].map(col => (
                <div key={col.title}>
                  <h4 style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 16px" }}>{col.title}</h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {col.links.map(link => (
                      <li key={link}>
                        <a href="#" style={{ fontSize: 14, color: C.fgMuted, textDecoration: "none", transition: "color 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.color = C.fg)}
                          onMouseLeave={e => (e.currentTarget.style.color = C.fgMuted)}>{link}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.strokeSoft}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.06em" }}>© 2026 CLIPFROM · ALL RIGHTS RESERVED</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.06em" }}>MADE FOR CREATORS</span>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
};

export default ArticleInput;
