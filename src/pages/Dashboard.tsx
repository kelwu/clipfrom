import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import OnboardingModal from "@/components/OnboardingModal";
import { isFailedStatus } from "@/lib/status";

interface Project {
  id: string;
  article_url: string | null;
  created_at: string;
  source_mode: string | null;
  ai_generations: {
    stitched_video_url: string | null;
    video_url_1: string | null;
    user_video_url: string | null;
    status: string | null;
    status_changed_at: string | null;
    description: string | null;
    caption_options: string[] | null;
    source_mode: string | null;
    render_params: { captionStyle?: string; transitionStyle?: string; captionFont?: string; videoSource?: string; showHookCard?: boolean; hookText?: string } | null;
  } | null;
}

type Mode = "article" | "video" | "long_video";
const projectMode = (p: Project): Mode => {
  const m = p.source_mode ?? p.ai_generations?.source_mode ?? "article";
  return m === "video" || m === "long_video" ? m : "article";
};
const MODE_LABEL: Record<Mode, string> = { article: "Article", video: "Talking head", long_video: "Highlights" };

// Statuses where a pipeline is actively working. After STALE_AFTER_MS without a status
// change the job is considered abandoned (e.g. a crash before the sweeper existed).
const IN_FLIGHT = new Set([
  "processing", "transcribing", "generating_broll", "generating_videos",
  "ai_tasks_created", "ai_tasks_done", "render_queued", "remotion_rendering",
]);
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const UPLOAD_ABANDONED_MS = 60 * 60 * 1000;
const PAGE_SIZE = 24;
const FETCH_LIMIT = 500;

type Health = "ready" | "working" | "draft" | "review" | "failed" | "stalled" | "incomplete";

function projectHealth(p: Project): Health {
  const gen = p.ai_generations;
  if (!gen) {
    // The project row exists but the upload never finished (tab closed mid-upload)
    return Date.now() - new Date(p.created_at).getTime() > UPLOAD_ABANDONED_MS ? "incomplete" : "working";
  }
  const s = gen.status ?? "";
  const mode = projectMode(p);
  if (s === "complete") return "ready";
  if (isFailedStatus(s)) return "failed";
  if (s === "captions_ready") return "draft";
  if (s === "videos_ready" && mode === "article") return "review";
  const running = IN_FLIGHT.has(s) || s === "videos_ready";
  if (running) {
    const changed = gen.status_changed_at ? new Date(gen.status_changed_at).getTime() : new Date(p.created_at).getTime();
    return Date.now() - changed > STALE_AFTER_MS ? "stalled" : "working";
  }
  return "working";
}

const needsAttention = (h: Health) => h === "failed" || h === "stalled" || h === "incomplete";
const isDeletable = (h: Health) => h !== "working";

const C = {
  bg: "oklch(10% 0.018 255)",
  border: "oklch(100% 0 0 / 0.07)",
  accent: "oklch(72% 0.17 280)",
  accentSubtle: "oklch(72% 0.17 280 / 0.09)",
  accentBorder: "oklch(72% 0.17 280 / 0.22)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(82% 0.01 250)",
  fgDim: "oklch(70% 0.01 250)",
  surface: "oklch(14% 0.018 255)",
  amber: "oklch(75% 0.17 75)",
  amberBorder: "oklch(75% 0.17 75 / 0.35)",
  red: "oklch(65% 0.2 25)",
  redSubtle: "oklch(65% 0.2 25 / 0.08)",
  redBorder: "oklch(65% 0.2 25 / 0.35)",
  // Solid chip background so badges stay readable on top of video thumbnails
  chip: "oklch(12% 0.02 258 / 0.92)",
} as const;

const mono = '"Geist Mono", "Fira Mono", monospace';
const sans = '"Geist", system-ui, sans-serif';

const BADGE: Record<Health, { label: string; color: string; border: string; pulse: boolean }> = {
  ready:      { label: "Ready",          color: C.accent, border: C.accentBorder, pulse: false },
  working:    { label: "Working",        color: C.amber,  border: C.amberBorder,  pulse: true  },
  draft:      { label: "Draft",          color: C.fgMuted, border: C.border,      pulse: false },
  review:     { label: "Needs review",   color: C.accent, border: C.accentBorder, pulse: false },
  failed:     { label: "Failed",         color: C.red,    border: C.redBorder,    pulse: false },
  stalled:    { label: "Didn't finish",  color: C.red,    border: C.redBorder,    pulse: false },
  incomplete: { label: "Upload incomplete", color: C.red, border: C.redBorder,    pulse: false },
};

function StatusBadge({ health }: { health: Health }) {
  const cfg = BADGE[health];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 9px", borderRadius: 999,
      background: C.chip, border: `1px solid ${cfg.border}`, backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: cfg.color,
        animation: cfg.pulse ? "db-pulse 1.5s ease-in-out infinite" : "none",
      }}/>
      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {cfg.label}
      </span>
    </div>
  );
}

function VideoThumbnail({ url }: { url: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  if (!url) {
    return (
      <div style={{ width: "100%", height: "100%", background: "oklch(16% 0.018 255)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "oklch(35% 0.01 250)" }}>
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", background: "oklch(16% 0.018 255)" }}>
      <video
        ref={ref}
        src={url}
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={() => { if (ref.current) ref.current.currentTime = 0.5; }}
        onSeeked={() => setVisible(true)}
        onError={() => setVisible(false)}
      />
    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Where the video came from: the article's site, or the uploaded file's name
function sourceLabel(p: Project) {
  if (p.article_url) {
    try { return new URL(p.article_url).hostname.replace(/^www\./, ""); }
    catch { return p.article_url.slice(0, 40); }
  }
  const upload = p.ai_generations?.user_video_url;
  if (upload) {
    try { return decodeURIComponent(upload.split("/").pop() ?? "").replace(/_/g, " ").slice(0, 40); }
    catch { return "Uploaded video"; }
  }
  return projectMode(p) === "article" ? "Pasted text" : "Uploaded video";
}

function projectTitle(p: Project, health: Health) {
  const gen = p.ai_generations;
  const caption = Array.isArray(gen?.caption_options) ? gen.caption_options[0] : null;
  const title = caption ?? gen?.description;
  if (title) return title;
  if (projectMode(p) !== "article") return sourceLabel(p);
  return health === "working" ? "Processing…" : "Untitled video";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
      {children}
    </p>
  );
}

function ProjectCard({ project, health, onOpen, onRetry, retrying, onDelete, deleting }: {
  project: Project;
  health: Health;
  onOpen: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const gen = project.ai_generations;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = gen?.status ?? "";
  const retryLabel = status === "transcription_error" || health === "incomplete" ? "Re-upload" : "↺ Retry";

  return (
    <div
      className="db-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${projectTitle(project, health)}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden", cursor: "pointer",
        transition: "all 0.15s", fontFamily: sans, opacity: deleting ? 0.4 : 1,
      }}
    >
      {/* 9:16 thumbnail */}
      <div style={{ position: "relative", paddingBottom: "177.78%" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <VideoThumbnail url={gen?.stitched_video_url ?? gen?.video_url_1 ?? null} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, oklch(0% 0 0 / 0.5) 0%, transparent 50%)" }}/>
          <div style={{ position: "absolute", top: 10, left: 10 }}>
            <StatusBadge health={health} />
          </div>
          <div className="db-play-overlay" style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity 0.15s",
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "oklch(100% 0 0 / 0.18)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
                <polygon points="6,3 20,12 6,21"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ padding: "13px 13px 12px" }}>
        <p style={{
          fontSize: 13, color: C.fgMuted, lineHeight: 1.5, fontFamily: sans,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", marginBottom: 9, minHeight: "2.6rem",
        } as React.CSSProperties}>
          {projectTitle(project, health)}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {projectMode(project) === "article" ? sourceLabel(project) : MODE_LABEL[projectMode(project)]}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: C.fgDim }}>{timeAgo(project.created_at)}</span>
            {onDelete && !onRetry && !confirmDelete && (
              <button type="button" className="db-icon-btn" aria-label="Delete video" title="Delete"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "-2px" }}>
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
                    </svg>
              </button>
            )}
          </span>
        </div>

        {(onRetry || confirmDelete) && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <>
                <button type="button" className="db-small-btn db-danger" disabled={deleting}
                  onClick={() => { setConfirmDelete(false); onDelete?.(); }}>
                  {deleting ? "Deleting…" : "Delete for good"}
                </button>
                <button type="button" className="db-small-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <>
                {onRetry && (
                  <button type="button" className="db-small-btn" disabled={retrying} onClick={onRetry} style={{ flex: 1 }}>
                    {retrying ? "Retrying…" : retryLabel}
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="db-small-btn" aria-label="Delete video" title="Delete"
                    onClick={() => setConfirmDelete(true)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "-2px" }}>
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Filter = "all" | "working" | "ready" | "attention";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select(`id, article_url, created_at, source_mode, ai_generations ( stitched_video_url, video_url_1, user_video_url, status, status_changed_at, description, caption_options, source_mode, render_params )`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) setLoadError(true);
    else { setLoadError(false); setProjects((data as unknown as Project[]) ?? []); }
    setLoading(false);
  };

  useEffect(() => { load(true); }, [user?.id]);

  const withHealth = useMemo(() => projects.map(p => ({ p, h: projectHealth(p) })), [projects]);

  // Keep in-progress cards current without a manual refresh
  const anyWorking = withHealth.some(x => x.h === "working");
  useEffect(() => {
    if (!anyWorking) return;
    const t = setInterval(() => load(false), 20_000);
    return () => clearInterval(t);
  }, [anyWorking, user?.id]);

  // Open a project on the screen that matches its mode and where it is in the flow.
  // Opening a card never starts a paid render by itself.
  const openProject = (p: Project) => {
    const mode = projectMode(p);
    const status = p.ai_generations?.status ?? "";
    if (status === "captions_ready") {
      if (mode === "video") return navigate(`/video-style/${p.id}`);
      if (mode === "long_video") return navigate(`/highlight-picker/${p.id}`);
      return navigate("/editor", { state: { projectId: p.id, userEmail: user?.email } });
    }
    if (mode === "article" && status === "videos_ready") return navigate(`/review/${p.id}`);
    navigate(`/results/${p.id}`, { state: { projectId: p.id, sourceMode: mode } });
  };

  const handleRetry = async (p: Project) => {
    if (!user || !session) return;
    const mode = projectMode(p);
    const status = p.ai_generations?.status ?? "";
    if (!p.ai_generations || status === "transcription_error") {
      toast.message("That upload didn't finish — upload the video again.");
      navigate("/");
      return;
    }
    if (status === "caption_error") {
      // Captions were never generated, so there's nothing to render — start over from the article.
      toast.error("We couldn't write captions for that article — try it again or paste the text directly.");
      navigate("/");
      return;
    }
    setRetrying(p.id);
    try {
      const { error: resetError } = await supabase
        .from("ai_generations")
        .update({
          status: "captions_ready", debug_log: null, stitched_video_url: null,
          video_url_1: null, video_url_2: null, video_url_3: null,
          video_url_4: null, video_url_5: null, kling_task_ids: null,
        })
        .eq("project_id", p.id);
      if (resetError) throw resetError;

      // Uploads go back to their style screen so the user's own settings are reused.
      if (mode === "video") { navigate(`/video-style/${p.id}`); return; }
      if (mode === "long_video") { navigate(`/highlight-picker/${p.id}`); return; }

      // Article: re-run with the settings the user originally chose (defaults if unknown).
      const rp = p.ai_generations?.render_params ?? {};
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          project_id: p.id,
          captionStyle: rp.captionStyle ?? "pill",
          transitionStyle: rp.transitionStyle ?? "cut",
          // Reuse the footage the user chose (saved since Sep 2026); "ai" matches the default preset
          videoSource: rp.videoSource ?? "ai",
          ...(rp.captionFont ? { captionFont: rp.captionFont } : {}),
          ...(rp.showHookCard ? { showHookCard: true } : {}),
          ...(rp.hookText ? { hookText: rp.hookText } : {}),
        }),
      });
      if (res.status === 402) { toast.error("You're out of credits. Upgrade to retry."); setRetrying(null); return; }
      if (!res.ok) throw new Error(`Retry failed (${res.status})`);

      toast.success("Retrying video generation…");
      navigate(`/results/${p.id}`, { state: { projectId: p.id, sourceMode: "article" } });
    } catch {
      toast.error("Could not retry — please try again");
      setRetrying(null);
    }
  };

  const handleDelete = async (p: Project) => {
    if (!session) return;
    setDeleting(p.id);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-project`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ project_id: p.id }),
      });
      if (res.status === 409) { toast.error("This video is still being made — you can delete it once it finishes."); return; }
      if (!res.ok) throw new Error(String(res.status));
      setProjects(prev => prev.filter(x => x.id !== p.id));
      toast.success("Video deleted");
    } catch {
      toast.error("Could not delete — please try again");
    } finally {
      setDeleting(null);
    }
  };

  // Search + filter, then group into sections in a stable order
  const q = query.trim().toLowerCase();
  const filtered = withHealth.filter(({ p, h }) => {
    if (filter === "working" && !(h === "working" || h === "draft" || h === "review")) return false;
    if (filter === "ready" && h !== "ready") return false;
    if (filter === "attention" && !needsAttention(h)) return false;
    if (!q) return true;
    return `${projectTitle(p, h)} ${sourceLabel(p)} ${MODE_LABEL[projectMode(p)]}`.toLowerCase().includes(q);
  });
  const sectionOf = (h: Health) => (h === "ready" ? 2 : needsAttention(h) ? 1 : 0);
  const ordered = [...filtered].sort((a, b) => sectionOf(a.h) - sectionOf(b.h));
  const visible = ordered.slice(0, visibleCount);
  const sections = [
    { label: "In progress", items: visible.filter(x => sectionOf(x.h) === 0) },
    { label: "Needs attention", items: visible.filter(x => sectionOf(x.h) === 1) },
    { label: "Ready", items: visible.filter(x => sectionOf(x.h) === 2) },
  ];
  const counts = {
    all: withHealth.length,
    working: withHealth.filter(x => x.h === "working" || x.h === "draft" || x.h === "review").length,
    ready: withHealth.filter(x => x.h === "ready").length,
    attention: withHealth.filter(x => needsAttention(x.h)).length,
  };
  const totalLabel = projects.length >= FETCH_LIMIT ? `${FETCH_LIMIT}+` : String(projects.length);

  return (
    <AppShell activePage="Library">
      <style>{`
        @keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .db-card:hover, .db-card:focus-visible { border-color: oklch(100% 0 0 / 0.14) !important; transform: translateY(-2px); box-shadow: 0 10px 30px oklch(0% 0 0 / 0.5); outline: none; }
        .db-card:focus-visible { border-color: oklch(72% 0.17 280 / 0.6) !important; }
        .db-card:hover .db-play-overlay { opacity: 1 !important; }
        .db-small-btn { padding: 7px 10px; background: oklch(100% 0 0 / 0.04); border: 1px solid oklch(100% 0 0 / 0.07); border-radius: 8px; font-size: 12px; font-weight: 600; color: oklch(82% 0.01 250); cursor: pointer; font-family: ${sans}; transition: all 0.15s; }
        .db-small-btn:hover:not(:disabled) { background: oklch(72% 0.17 280 / 0.08); border-color: oklch(72% 0.17 280 / 0.25); color: oklch(72% 0.17 280); }
        .db-small-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .db-icon-btn { display: inline-flex; padding: 3px; border: none; background: none; color: oklch(70% 0.01 250); cursor: pointer; border-radius: 6px; opacity: 0.55; transition: all 0.15s; }
        .db-card:hover .db-icon-btn, .db-icon-btn:focus-visible { opacity: 1; }
        .db-icon-btn:hover { color: oklch(65% 0.2 25); background: oklch(65% 0.2 25 / 0.1); }
        @media (hover: none) { .db-icon-btn { opacity: 1; } }
        .db-danger { flex: 1; color: oklch(65% 0.2 25) !important; border-color: oklch(65% 0.2 25 / 0.35) !important; }
        .db-new-btn:hover { box-shadow: 0 6px 24px oklch(72% 0.17 280 / 0.5) !important; transform: translateY(-1px); }
        .db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
        .db-chip { padding: 6px 12px; border-radius: 999px; border: 1px solid oklch(100% 0 0 / 0.08); background: none; color: oklch(82% 0.01 250); font-size: 13px; cursor: pointer; font-family: ${sans}; white-space: nowrap; }
        .db-chip[aria-pressed="true"] { background: oklch(72% 0.17 280 / 0.12); border-color: oklch(72% 0.17 280 / 0.35); color: oklch(72% 0.17 280); }
        .db-search { flex: 1; min-width: 160px; max-width: 320px; padding: 8px 12px; border-radius: 9px; border: 1px solid oklch(100% 0 0 / 0.1); background: oklch(14% 0.018 255); color: oklch(96% 0.005 250); font-size: 14px; font-family: ${sans}; }
        .db-search:focus { outline: none; border-color: oklch(72% 0.17 280 / 0.5); }
        @media (max-width: 480px) { .db-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
        /* The app shell top bar already has a New button on small screens */
        @media (max-width: 899px) { .db-new-btn.db-topbar-new { display: none !important; } }
      `}</style>
      <OnboardingModal />

      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "14px clamp(16px, 3vw, 28px)", borderBottom: `1px solid ${C.border}`,
        background: "oklch(11% 0.018 255)", flexShrink: 0, fontFamily: sans,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 17, fontWeight: 500, color: C.fg, margin: 0 }}>Library</h1>
          {!loading && !loadError && (
            <span style={{ fontFamily: mono, fontSize: 13, color: C.fgMuted }}>
              {totalLabel} video{projects.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          className="db-new-btn db-topbar-new"
          onClick={() => navigate("/")}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 18px",
            background: C.accent, border: "none", borderRadius: 9,
            fontSize: 14, fontWeight: 600, color: C.bg, cursor: "pointer",
            fontFamily: sans, boxShadow: "0 2px 12px oklch(72% 0.17 280 / 0.3)", transition: "all 0.15s",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Video
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px clamp(16px, 3vw, 32px)", fontFamily: sans }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 192, color: C.fgDim, fontSize: 14 }}>
            Loading…
          </div>
        ) : loadError ? (
          <div style={{ textAlign: "center", padding: "96px 0", color: C.fgMuted, fontSize: 14 }}>
            <p style={{ marginBottom: 16 }}>We couldn't load your videos.</p>
            <button className="db-small-btn" onClick={() => load(true)}>Try again</button>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "96px 0" }}>
            <div style={{
              width: 56, height: 56, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: C.fgDim }}>
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.fg, marginBottom: 8 }}>No videos yet</h2>
            <p style={{ fontSize: 14, color: C.fgMuted, maxWidth: 300, lineHeight: 1.6, marginBottom: 24 }}>
              Paste an article or upload a video of yourself — ClipFrom turns it into a short-form video in minutes.
            </p>
            <button
              className="db-new-btn"
              onClick={() => navigate("/")}
              style={{
                padding: "11px 22px", background: C.accent, border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 600, color: C.bg, cursor: "pointer",
                fontFamily: sans, boxShadow: "0 2px 12px oklch(72% 0.17 280 / 0.3)", transition: "all 0.15s",
              }}
            >
              Create your first video
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: 1100, display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Search + filters */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <input
                className="db-search"
                type="search"
                placeholder="Search videos…"
                aria-label="Search videos"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label="Filter videos">
                {([
                  ["all", "All"], ["working", "In progress"], ["ready", "Ready"], ["attention", "Needs attention"],
                ] as [Filter, string][]).map(([key, label]) => (
                  <button key={key} type="button" className="db-chip" aria-pressed={filter === key}
                    onClick={() => { setFilter(key); setVisibleCount(PAGE_SIZE); }}>
                    {label} <span style={{ opacity: 0.6 }}>{counts[key]}</span>
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 && (
              <p style={{ color: C.fgMuted, fontSize: 14 }}>No videos match{q ? ` “${query}”` : ""}.</p>
            )}

            {sections.map(section => section.items.length > 0 && (
              <section key={section.label}>
                <SectionLabel>{section.label}</SectionLabel>
                <div className="db-grid">
                  {section.items.map(({ p, h }) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      health={h}
                      onOpen={() => openProject(p)}
                      onRetry={needsAttention(h) ? () => handleRetry(p) : undefined}
                      retrying={retrying === p.id}
                      onDelete={isDeletable(h) ? () => handleDelete(p) : undefined}
                      deleting={deleting === p.id}
                    />
                  ))}
                </div>
              </section>
            ))}

            {ordered.length > visibleCount && (
              <button className="db-small-btn" style={{ alignSelf: "center", padding: "10px 22px" }}
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                Show more ({ordered.length - visibleCount} left)
              </button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
