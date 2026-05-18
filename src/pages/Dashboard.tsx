import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import OnboardingModal from "@/components/OnboardingModal";

interface Project {
  id: string;
  article_url: string | null;
  created_at: string;
  ai_generations: {
    stitched_video_url: string | null;
    video_url_1: string | null;
    status: string | null;
    description: string | null;
    caption_options: string[] | null;
  } | null;
}

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
  amberSubtle: "oklch(75% 0.17 75 / 0.08)",
  amberBorder: "oklch(75% 0.17 75 / 0.22)",
  red: "oklch(65% 0.2 25)",
  redSubtle: "oklch(65% 0.2 25 / 0.08)",
  redBorder: "oklch(65% 0.2 25 / 0.22)",
} as const;

const mono = '"Geist Mono", "Fira Mono", monospace';
const sans = '"Geist", system-ui, sans-serif';

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "";
  const isComplete   = s === "complete";
  const isFailed     = s.includes("error") || s.includes("failed");
  const cfg = isComplete
    ? { label: "Ready",      bg: C.accentSubtle, border: C.accentBorder, dot: C.accent, text: C.accent, pulse: false }
    : isFailed
    ? { label: "Failed",     bg: C.redSubtle,    border: C.redBorder,    dot: C.red,    text: C.red,    pulse: false }
    : { label: "Generating", bg: C.amberSubtle,  border: C.amberBorder,  dot: C.amber,  text: C.amber,  pulse: true  };

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 9px", borderRadius: 999,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: cfg.dot,
        animation: cfg.pulse ? "db-pulse 1.5s ease-in-out infinite" : "none",
      }}/>
      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: cfg.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
        preload="auto"
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

function sourceLabel(url: string | null) {
  if (!url) return "Text input";
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 40); }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
      {children}
    </p>
  );
}

function ProjectCard({ project, onClick, onRetry, retrying }: {
  project: Project;
  onClick: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const gen = project.ai_generations;
  const caption = Array.isArray(gen?.caption_options) ? gen.caption_options[0] : null;

  return (
    <div
      className="db-card"
      onClick={onClick}
      style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, overflow: "hidden", cursor: "pointer",
        transition: "all 0.15s", fontFamily: sans,
      }}
    >
      {/* 9:16 thumbnail */}
      <div style={{ position: "relative", paddingBottom: "177.78%" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <VideoThumbnail url={gen?.stitched_video_url ?? gen?.video_url_1 ?? null} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, oklch(0% 0 0 / 0.5) 0%, transparent 50%)" }}/>
          <div style={{ position: "absolute", top: 10, left: 10 }}>
            <StatusBadge status={gen?.status ?? null} />
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
          {caption ?? gen?.description ?? "Processing…"}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fgMuted }}>{sourceLabel(project.article_url)}</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fgDim }}>{timeAgo(project.created_at)}</span>
        </div>
        {onRetry && (
          <button
            className="db-retry-btn"
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            disabled={retrying}
            style={{
              width: "100%", marginTop: 10, padding: "7px 0",
              background: "oklch(100% 0 0 / 0.04)", border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.fgMuted,
              cursor: retrying ? "not-allowed" : "pointer", fontFamily: sans,
              transition: "all 0.15s", opacity: retrying ? 0.5 : 1,
            }}
          >
            {retrying ? "Retrying…" : "↺ Retry"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select(`id, article_url, created_at, ai_generations ( stitched_video_url, video_url_1, status, description, caption_options )`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setProjects((data as unknown as Project[]) ?? []);
        setLoading(false);
      });
  }, [user?.id]);

  const handleRetry = async (projectId: string) => {
    if (!user || !session) return;
    setRetrying(projectId);
    try {
      await supabase
        .from("ai_generations")
        .update({
          status: "captions_ready", debug_log: null, stitched_video_url: null,
          video_url_1: null, video_url_2: null, video_url_3: null,
          video_url_4: null, video_url_5: null, kling_task_ids: null,
        })
        .eq("project_id", projectId);

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ project_id: projectId, user_email: user.email, captionStyle: "pill", transitionStyle: "cut", videoSource: "stock" }),
      });

      toast.success("Retrying video generation…");
      navigate(`/results/${projectId}`);
    } catch {
      toast.error("Could not retry — please try again");
      setRetrying(null);
    }
  };

  const complete    = projects.filter(p => p.ai_generations?.status === "complete");
  const inProgress  = projects.filter(p => {
    const s = p.ai_generations?.status;
    return s !== "complete" && !s?.includes("error") && !s?.includes("failed");
  });
  const failed      = projects.filter(p => {
    const s = p.ai_generations?.status;
    return s?.includes("error") || s?.includes("failed");
  });

  return (
    <AppShell activePage="Library">
      <style>{`
        @keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .db-card:hover { border-color: oklch(100% 0 0 / 0.14) !important; transform: translateY(-2px); box-shadow: 0 10px 30px oklch(0% 0 0 / 0.5); }
        .db-card:hover .db-play-overlay { opacity: 1 !important; }
        .db-retry-btn:hover:not(:disabled) { background: oklch(72% 0.17 280 / 0.08) !important; border-color: oklch(72% 0.17 280 / 0.25) !important; color: oklch(72% 0.17 280) !important; }
        .db-new-btn:hover { box-shadow: 0 6px 24px oklch(72% 0.17 280 / 0.5) !important; transform: translateY(-1px); }
      `}</style>
      <OnboardingModal />

      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: `1px solid ${C.border}`,
        background: "oklch(11% 0.018 255)", flexShrink: 0, fontFamily: sans,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: C.fg }}>Library</span>
          {!loading && (
            <span style={{ fontFamily: mono, fontSize: 13, color: C.fgMuted }}>
              {projects.length} video{projects.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          className="db-new-btn"
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
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", fontFamily: sans }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 192, color: C.fgDim, fontSize: 14 }}>
            Loading…
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
            <p style={{ fontSize: 14, color: C.fgMuted, maxWidth: 280, lineHeight: 1.6, marginBottom: 24 }}>
              Paste an article URL and ClipFrom will turn it into a short-form video in minutes.
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
          <div style={{ maxWidth: 980, display: "flex", flexDirection: "column", gap: 36 }}>
            {inProgress.length > 0 && (
              <section>
                <SectionLabel>Generating</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {inProgress.map(p => (
                    <ProjectCard key={p.id} project={p} onClick={() => navigate(`/results/${p.id}`)} />
                  ))}
                </div>
              </section>
            )}
            {failed.length > 0 && (
              <section>
                <SectionLabel>Failed</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {failed.map(p => (
                    <ProjectCard key={p.id} project={p} onClick={() => navigate(`/results/${p.id}`)} onRetry={() => handleRetry(p.id)} retrying={retrying === p.id} />
                  ))}
                </div>
              </section>
            )}
            {complete.length > 0 && (
              <section>
                <SectionLabel>Ready</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  {complete.map(p => (
                    <ProjectCard key={p.id} project={p} onClick={() => navigate(`/results/${p.id}`)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
