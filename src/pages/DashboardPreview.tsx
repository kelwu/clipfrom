const C = {
  bg: "oklch(10% 0.018 255)",
  sidebar: "oklch(12% 0.02 258)",
  border: "oklch(100% 0 0 / 0.07)",
  accent: "oklch(72% 0.17 280)",
  accentSubtle: "oklch(72% 0.17 280 / 0.09)",
  accentBorder: "oklch(72% 0.17 280 / 0.22)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(82% 0.01 250)",
  fgDim: "oklch(70% 0.01 250)",
  surface: "oklch(14% 0.018 255)",
  surfaceHover: "oklch(17% 0.018 255)",
  amber: "oklch(75% 0.17 75)",
  amberSubtle: "oklch(75% 0.17 75 / 0.08)",
  amberBorder: "oklch(75% 0.17 75 / 0.22)",
  red: "oklch(65% 0.2 25)",
  redSubtle: "oklch(65% 0.2 25 / 0.08)",
  redBorder: "oklch(65% 0.2 25 / 0.22)",
} as const;

const mono = '"Geist Mono", "Fira Mono", monospace';
const sans = '"Geist", system-ui, sans-serif';

const sampleProjects = [
  { id: "1", status: "complete",    caption: "AI isn't taking your job — it's rewriting it.",     source: "every.to",              time: "2h ago" },
  { id: "2", status: "complete",    caption: "Most founders get this exactly backwards.",           source: "stratechery.com",       time: "1d ago" },
  { id: "3", status: "complete",    caption: "What nobody tells you about the 4-day week.",         source: "nytimes.com",           time: "3d ago" },
  { id: "4", status: "processing",  caption: "The rule that changed how I think about work.",       source: "substack.com",          time: "5m ago" },
  { id: "5", status: "failed",      caption: "Three breakthroughs in six months changed everything.",source: "every.to",             time: "6d ago" },
];

const complete    = sampleProjects.filter(p => p.status === "complete");
const inProgress  = sampleProjects.filter(p => p.status === "processing");
const failed      = sampleProjects.filter(p => p.status === "failed");

function StatusBadge({ status }: { status: string }) {
  const config =
    status === "complete"
      ? { label: "Ready",      bg: C.accentSubtle, border: C.accentBorder, dot: C.accent,   text: C.accent,  pulse: false }
      : status === "processing"
      ? { label: "Generating", bg: C.amberSubtle,  border: C.amberBorder,  dot: C.amber,    text: C.amber,   pulse: true  }
      : { label: "Failed",     bg: C.redSubtle,    border: C.redBorder,    dot: C.red,      text: C.red,     pulse: false };

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 9px", borderRadius: 999,
      background: config.bg, border: `1px solid ${config.border}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: config.dot,
        animation: config.pulse ? "db-pulse 1.5s ease-in-out infinite" : "none",
      }}/>
      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: config.text, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
        {config.label}
      </span>
    </div>
  );
}

function VideoPlaceholder({ gradient }: { gradient: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: gradient,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: "oklch(100% 0 0 / 0.08)", border: "1px solid oklch(100% 0 0 / 0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
          <polygon points="6,3 20,12 6,21"/>
        </svg>
      </div>
    </div>
  );
}

const gradients = [
  "linear-gradient(160deg, oklch(20% 0.04 280), oklch(13% 0.02 255))",
  "linear-gradient(160deg, oklch(18% 0.04 220), oklch(13% 0.02 255))",
  "linear-gradient(160deg, oklch(20% 0.05 300), oklch(13% 0.02 265))",
  "linear-gradient(160deg, oklch(19% 0.04 260), oklch(13% 0.02 250))",
  "linear-gradient(160deg, oklch(20% 0.03 200), oklch(13% 0.02 240))",
];

function ProjectCard({ project, idx }: { project: typeof sampleProjects[0]; idx: number }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, overflow: "hidden", cursor: "pointer",
      transition: "all 0.15s",
    }}
      className="db-card"
    >
      {/* 9:16 thumbnail */}
      <div style={{ position: "relative", paddingBottom: "177.78%" }}>
        <VideoPlaceholder gradient={gradients[idx % gradients.length]} />
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, oklch(0% 0 0 / 0.5) 0%, transparent 50%)",
          }}/>
          <div style={{ position: "absolute", top: 10, left: 10 }}>
            <StatusBadge status={project.status} />
          </div>
          {/* Hover play overlay handled by CSS */}
          <div className="db-play-overlay" style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
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
          fontSize: 13, color: C.fgMuted, lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
          overflow: "hidden", marginBottom: 9, minHeight: "2.6rem",
        }}>
          {project.caption}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fgMuted }}>{project.source}</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.fgDim }}>{project.time}</span>
        </div>
        {project.status === "failed" && (
          <button style={{
            width: "100%", marginTop: 10, padding: "7px 0",
            background: "oklch(100% 0 0 / 0.04)", border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.fgMuted,
            cursor: "pointer", fontFamily: sans, transition: "all 0.15s",
          }}
            className="db-retry-btn"
          >
            ↺ Retry
          </button>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted,
      textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 16,
    }}>
      {children}
    </p>
  );
}

export default function DashboardPreview() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes shell-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        body { background: ${C.bg}; margin: 0; }
        * { box-sizing: border-box; }
        .db-card:hover { border-color: oklch(100% 0 0 / 0.14) !important; transform: translateY(-2px); box-shadow: 0 10px 30px oklch(0% 0 0 / 0.5); }
        .db-card:hover .db-play-overlay { opacity: 1 !important; }
        .db-retry-btn:hover { background: oklch(72% 0.17 280 / 0.08) !important; border-color: oklch(72% 0.17 280 / 0.25) !important; color: ${C.accent} !important; }
        .db-new-btn:hover { box-shadow: 0 6px 24px oklch(72% 0.17 280 / 0.5) !important; transform: translateY(-1px); }
        .shell-sidebar::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 200px;
          background: radial-gradient(ellipse at top left, oklch(72% 0.17 280 / 0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .shell-nav-item:hover { background: oklch(100% 0 0 / 0.04) !important; }
        .shell-bottom-item:hover { background: oklch(100% 0 0 / 0.05) !important; }
        .shell-upgrade-btn:hover { background: oklch(72% 0.17 280 / 0.08) !important; border-color: oklch(72% 0.17 280 / 0.4) !important; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.fg, fontFamily: sans, overflow: "hidden" }}>

        {/* ── Sidebar (static preview) ── */}
        <aside className="shell-sidebar" style={{
          width: 260, flexShrink: 0, display: "flex", flexDirection: "column",
          background: C.sidebar, borderRight: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
        }}>
          {/* Logo */}
          <div style={{ padding: "22px 18px 16px", borderBottom: `1px solid ${C.border}`, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, background: C.accent, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: "0 0 16px oklch(72% 0.17 280 / 0.45)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={C.bg}><polygon points="6,3 20,12 6,21"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", color: C.fg }}>ClipFrom</span>
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 11px",
              borderRadius: 999, background: "oklch(72% 0.17 280 / 0.08)", border: "1px solid oklch(72% 0.17 280 / 0.2)",
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, boxShadow: `0 0 6px ${C.accent}`, animation: "shell-pulse 2s ease-in-out infinite" }}/>
              <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>AI Engine Active</span>
            </div>
          </div>

          {/* New Video */}
          <div style={{ padding: "12px 14px", position: "relative", zIndex: 1 }}>
            <button className="db-new-btn" style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "10px 0", background: C.accent, border: "none", borderRadius: 10,
              fontSize: 15, fontWeight: 600, color: C.bg, cursor: "pointer",
              fontFamily: sans, boxShadow: "0 3px 14px oklch(72% 0.17 280 / 0.35)", transition: "all 0.15s",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Video
            </button>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "6px 12px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto", position: "relative", zIndex: 1 }}>
            {[
              { label: "Library", active: true, disabled: false, icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
              { label: "Assets",  active: false, disabled: true, icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg> },
              { label: "Analytics",active:false, disabled: true, icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
            ].map(item => (
              <div key={item.label} style={{
                display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${item.active ? "oklch(72% 0.17 280 / 0.2)" : "transparent"}`,
                background: item.active ? C.accentSubtle : "none",
                opacity: item.disabled ? 0.72 : 1,
                cursor: item.disabled ? "not-allowed" : "pointer",
              }}>
                <span style={{ color: item.active ? C.accent : C.fgMuted }}>{item.icon}</span>
                <span style={{ fontSize: 15, fontWeight: item.active ? 500 : 400, color: item.active ? C.accent : C.fgMuted }}>{item.label}</span>
                {item.disabled && (
                  <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: C.fgDim, background: "oklch(100% 0 0 / 0.05)", border: "1px solid oklch(100% 0 0 / 0.08)", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>soon</span>
                )}
              </div>
            ))}
          </nav>

          {/* Bottom */}
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, position: "relative", zIndex: 1 }}>
            <div style={{ padding: "8px 10px 14px" }}>
              <p style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 5 }}>Signed in as</p>
              <p style={{ fontSize: 13, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>kel@example.com</p>
            </div>
            <div style={{ background: "oklch(14% 0.018 255)", border: `1px solid ${C.border}`, borderRadius: 11, padding: "12px 13px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Credits</span>
                <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: C.accent }}>3 left</span>
              </div>
              <div style={{ height: 4, borderRadius: 999, background: "oklch(100% 0 0 / 0.07)", overflow: "hidden", marginBottom: 11 }}>
                <div style={{ height: "100%", borderRadius: 999, width: "60%", background: C.accent, boxShadow: `0 0 8px oklch(72% 0.17 280 / 0.55)` }}/>
              </div>
              <button className="shell-upgrade-btn" style={{
                width: "100%", padding: "8px 0", background: "transparent",
                border: `1px solid ${C.accentBorder}`, borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: C.accent, cursor: "pointer", fontFamily: sans, transition: "all 0.15s",
              }}>Upgrade plan</button>
            </div>
            {[
              { label: "Settings", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M12 20v2M19.07 19.07l-1.41-1.41M20 12h2"/></svg>, disabled: false },
              { label: "Help",     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, disabled: true },
              { label: "Logout",   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>, disabled: false },
            ].map(item => (
              <div key={item.label} className={item.disabled ? "" : "shell-bottom-item"} style={{
                display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 9,
                opacity: item.disabled ? 0.65 : 1, cursor: item.disabled ? "not-allowed" : "pointer",
                transition: "background 0.12s",
              }}>
                <span style={{ color: C.fgMuted }}>{item.icon}</span>
                <span style={{ fontSize: 15, color: C.fgMuted }}>{item.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Topbar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 28px", borderBottom: `1px solid ${C.border}`,
            background: "oklch(11% 0.018 255)", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 500, color: C.fg }}>Library</span>
              <span style={{ fontFamily: mono, fontSize: 13, color: C.fgMuted }}>
                {sampleProjects.length} videos
              </span>
            </div>
            <button className="db-new-btn" style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 18px",
              background: C.accent, border: "none", borderRadius: 9,
              fontSize: 14, fontWeight: 600, color: C.bg, cursor: "pointer",
              fontFamily: sans, boxShadow: "0 2px 12px oklch(72% 0.17 280 / 0.3)", transition: "all 0.15s",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Video
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
            <div style={{ maxWidth: 980, display: "flex", flexDirection: "column", gap: 36 }}>

              {/* Generating */}
              {inProgress.length > 0 && (
                <section>
                  <SectionLabel>Generating</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {inProgress.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} />)}
                  </div>
                </section>
              )}

              {/* Failed */}
              {failed.length > 0 && (
                <section>
                  <SectionLabel>Failed</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {failed.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} />)}
                  </div>
                </section>
              )}

              {/* Ready */}
              {complete.length > 0 && (
                <section>
                  <SectionLabel>Ready</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {complete.map((p, i) => <ProjectCard key={p.id} project={p} idx={i} />)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
