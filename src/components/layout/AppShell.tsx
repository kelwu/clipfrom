import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import UpgradeModal from "@/components/UpgradeModal";

interface AppShellProps {
  children: React.ReactNode;
  activePage?: string;
}

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
};

const mono = '"Geist Mono", "Fira Mono", monospace';
const sans = '"Geist", system-ui, sans-serif';

const navItems = [
  {
    label: "Library",
    clickable: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: "Assets",
    clickable: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      </svg>
    ),
  },
  {
    label: "Analytics",
    clickable: false,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
];

export default function AppShell({ children, activePage }: AppShellProps) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("credits_remaining, is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCredits(data.credits_remaining);
          setIsAdmin(data.is_admin ?? false);
        }
      });
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const creditColor =
    credits === 0
      ? "oklch(65% 0.2 25)"
      : credits !== null && credits <= 2
      ? "oklch(75% 0.17 75)"
      : C.accent;

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.fg, fontFamily: sans, overflow: "hidden" }}>
      <style>{`
        @keyframes shell-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .shell-new-btn:hover { box-shadow: 0 6px 24px oklch(72% 0.17 280 / 0.5) !important; transform: translateY(-1px); }
        .shell-nav-item:hover { background: oklch(100% 0 0 / 0.04) !important; }
        .shell-bottom-item:hover { background: oklch(100% 0 0 / 0.05) !important; }
        .shell-upgrade-btn:hover { background: oklch(72% 0.17 280 / 0.08) !important; border-color: oklch(72% 0.17 280 / 0.4) !important; }
        .shell-sidebar::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 200px;
          background: radial-gradient(ellipse at top left, oklch(72% 0.17 280 / 0.07) 0%, transparent 70%);
          pointer-events: none;
        }
      `}</style>

      {/* ── Sidebar ── */}
      <aside
        className="shell-sidebar"
        style={{
          width: 260, flexShrink: 0, display: "flex", flexDirection: "column",
          background: C.sidebar, borderRight: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "22px 18px 16px", borderBottom: `1px solid ${C.border}`, position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, background: C.accent, borderRadius: 9,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: "0 0 16px oklch(72% 0.17 280 / 0.45)",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={C.bg}>
                <polygon points="6,3 20,12 6,21"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em", color: C.fg }}>ClipFrom</span>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "4px 11px", borderRadius: 999,
            background: "oklch(72% 0.17 280 / 0.08)",
            border: "1px solid oklch(72% 0.17 280 / 0.2)",
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", background: C.accent,
              boxShadow: `0 0 6px ${C.accent}`,
              animation: "shell-pulse 2s ease-in-out infinite",
            }}/>
            <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              AI Engine Active
            </span>
          </div>
        </div>

        {/* New Video */}
        <div style={{ padding: "12px 14px", position: "relative", zIndex: 1 }}>
          <button
            className="shell-new-btn"
            onClick={() => navigate("/")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "10px 0", background: C.accent, border: "none", borderRadius: 10,
              fontSize: 15, fontWeight: 600, color: C.bg, cursor: "pointer",
              fontFamily: sans, boxShadow: "0 3px 14px oklch(72% 0.17 280 / 0.35)",
              transition: "all 0.15s",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Video
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "6px 12px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto", position: "relative", zIndex: 1 }}>
          {navItems.map((item) => {
            const isActive = activePage === item.label;
            if (item.clickable) {
              return (
                <button
                  key={item.label}
                  className={!isActive ? "shell-nav-item" : ""}
                  onClick={() => navigate("/dashboard")}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "10px 12px", borderRadius: 10, width: "100%", textAlign: "left",
                    border: `1px solid ${isActive ? "oklch(72% 0.17 280 / 0.2)" : "transparent"}`,
                    background: isActive ? C.accentSubtle : "none",
                    cursor: "pointer", fontFamily: sans, transition: "all 0.12s",
                  }}
                >
                  <span style={{ color: isActive ? C.accent : C.fgMuted, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: isActive ? 500 : 400, color: isActive ? C.accent : C.fgMuted }}>
                    {item.label}
                  </span>
                </button>
              );
            }
            return (
              <div
                key={item.label}
                style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "10px 12px", borderRadius: 10,
                  border: "1px solid transparent",
                  opacity: 0.72, cursor: "not-allowed", userSelect: "none",
                }}
              >
                <span style={{ color: C.fgMuted, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 15, color: C.fgMuted }}>{item.label}</span>
                <span style={{
                  marginLeft: "auto", fontFamily: mono, fontSize: 10, color: C.fgDim,
                  background: "oklch(100% 0 0 / 0.05)", border: "1px solid oklch(100% 0 0 / 0.08)",
                  borderRadius: 4, padding: "2px 6px", letterSpacing: "0.04em", textTransform: "uppercase",
                }}>soon</span>
              </div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, position: "relative", zIndex: 1 }}>
          {user && (
            <>
              {/* User info */}
              <div style={{ padding: "8px 10px 14px" }}>
                <p style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 }}>
                  Signed in as
                </p>
                <p style={{ fontSize: 13, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user.email}
                </p>
              </div>

              {/* Credits or admin badge */}
              {isAdmin ? (
                <div style={{ padding: "0 10px 12px" }}>
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.accent, fontWeight: 600 }}>∞ Admin</span>
                </div>
              ) : credits !== null && (
                <div style={{
                  background: "oklch(14% 0.018 255)", border: `1px solid ${C.border}`,
                  borderRadius: 11, padding: "12px 13px", marginBottom: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, color: C.fgMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Credits
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: creditColor }}>
                      {credits} left
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: "oklch(100% 0 0 / 0.07)", overflow: "hidden", marginBottom: 11 }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      width: `${Math.min(100, (credits / 5) * 100)}%`,
                      background: creditColor,
                      boxShadow: `0 0 8px ${creditColor}80`,
                      transition: "width 0.4s ease",
                    }}/>
                  </div>
                  {credits === 0 && (
                    <p style={{ fontFamily: mono, fontSize: 11, color: "oklch(65% 0.2 25)", marginBottom: 8 }}>
                      Upgrade to generate more videos
                    </p>
                  )}
                  <button
                    className="shell-upgrade-btn"
                    onClick={() => setShowUpgrade(true)}
                    style={{
                      width: "100%", padding: "8px 0", background: credits === 0 ? C.accent : "transparent",
                      border: `1px solid ${credits === 0 ? "transparent" : C.accentBorder}`,
                      borderRadius: 8, fontSize: 13, fontWeight: 600,
                      color: credits === 0 ? C.bg : C.accent,
                      cursor: "pointer", fontFamily: sans, transition: "all 0.15s",
                    }}
                  >
                    Upgrade plan
                  </button>
                </div>
              )}
            </>
          )}

          {/* Admin */}
          {isAdmin && (
            <button
              className={activePage !== "Admin" ? "shell-bottom-item" : ""}
              onClick={() => navigate("/admin")}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
                borderRadius: 9, width: "100%", textAlign: "left", border: "none",
                background: activePage === "Admin" ? C.accentSubtle : "none",
                cursor: "pointer", fontFamily: sans, transition: "background 0.12s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                style={{ color: activePage === "Admin" ? C.accent : C.fgMuted, flexShrink: 0 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span style={{ fontSize: 15, color: activePage === "Admin" ? C.accent : C.fgMuted, fontWeight: activePage === "Admin" ? 500 : 400 }}>
                Admin
              </span>
            </button>
          )}

          {/* Settings */}
          <button
            className={activePage !== "Settings" ? "shell-bottom-item" : ""}
            onClick={() => navigate("/settings")}
            style={{
              display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
              borderRadius: 9, width: "100%", textAlign: "left", border: "none",
              background: activePage === "Settings" ? C.accentSubtle : "none",
              cursor: "pointer", fontFamily: sans, transition: "background 0.12s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              style={{ color: activePage === "Settings" ? C.accent : C.fgMuted, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93l-1.41 1.41M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M12 20v2M19.07 19.07l-1.41-1.41M20 12h2"/>
            </svg>
            <span style={{ fontSize: 15, color: activePage === "Settings" ? C.accent : C.fgMuted, fontWeight: activePage === "Settings" ? 500 : 400 }}>
              Settings
            </span>
          </button>

          {/* Help (disabled) */}
          <div style={{
            display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
            borderRadius: 9, opacity: 0.4, cursor: "not-allowed", userSelect: "none",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: C.fgMuted, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize: 15, color: C.fgMuted }}>Help</span>
          </div>

          {/* Logout */}
          <button
            className="shell-bottom-item"
            onClick={handleSignOut}
            style={{
              display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
              borderRadius: 9, width: "100%", textAlign: "left", border: "none",
              background: "none", cursor: "pointer", fontFamily: sans, transition: "background 0.12s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: C.fgMuted, flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span style={{ fontSize: 15, color: C.fgMuted }}>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </main>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
