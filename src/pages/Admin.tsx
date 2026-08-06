import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/layout/AppShell";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";

const C = {
  bg: "oklch(10% 0.018 255)",
  surface: "oklch(14% 0.018 255)",
  surface2: "oklch(17% 0.02 255)",
  border: "oklch(100% 0 0 / 0.07)",
  accent: "oklch(72% 0.17 280)",
  accentSubtle: "oklch(72% 0.17 280 / 0.09)",
  fg: "oklch(96% 0.005 250)",
  fgMuted: "oklch(82% 0.01 250)",
  fgDim: "oklch(60% 0.01 250)",
  success: "oklch(72% 0.17 145)",
  warning: "oklch(75% 0.17 75)",
  danger: "oklch(65% 0.2 25)",
};
const mono = '"Geist Mono", "Fira Mono", monospace';
const sans = '"Geist", system-ui, sans-serif';

type Tab = "users" | "pipeline" | "stats";

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  credits: number;
  is_admin: boolean;
  has_sub: boolean;
  ig_username: string | null;
  has_voice: boolean;
}

interface Generation {
  id: string;
  status: string;
  source_mode: string | null;
  created_at: string;
}

const STUCK_STATUSES = new Set(["processing", "generating_broll", "transcribing"]);
const ERROR_STATUSES = new Set(["all_clips_failed", "remotion_error", "transcription_error", "voiceover_error"]);
const STUCK_MS = 20 * 60 * 1000;

const isStuck = (g: Generation) =>
  STUCK_STATUSES.has(g.status) && Date.now() - new Date(g.created_at).getTime() > STUCK_MS;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });

function groupByDay(items: { created_at: string }[]) {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = item.created_at.slice(0, 10);
    map[key] = (map[key] || 0) + 1;
  }
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { day: key.slice(5).replace("-", "/"), count: map[key] || 0 };
  });
}

function Card({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 130 }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: color || C.fg, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "pipeline", label: "Pipeline" },
  { key: "stats", label: "Stats" },
];

const thStyle: React.CSSProperties = {
  fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.07em",
  textTransform: "uppercase", padding: "10px 14px", textAlign: "left",
  borderBottom: `1px solid ${C.border}`, fontWeight: 500,
};
const tdStyle: React.CSSProperties = {
  padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
  fontFamily: mono, fontSize: 12, color: C.fgMuted,
};

export default function Admin() {
  const { user, session } = useAuth();

  // All privileged data access goes through the admin-api edge function, which
  // re-verifies the caller's JWT + admin status server-side. The service-role
  // key never touches the browser.
  async function callAdmin(action: string, payload: Record<string, unknown> = {}) {
    if (!session) throw new Error("No session");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    return data;
  }

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("users");

  // Users tab state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Pipeline tab state
  const [gens, setGens] = useState<Generation[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineLoaded, setPipelineLoaded] = useState(false);

  // Stats tab state
  const [statsData, setStatsData] = useState<{
    gens30d: Generation[];
    payingCount: number;
    freeCount: number;
    totalCredits: number;
    active7d: number;
    active30d: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data?.is_admin);
        setChecking(false);
      });
  }, [user?.id]);

  useEffect(() => {
    if (isAdmin && session && !usersLoaded) loadUsers();
  }, [isAdmin, session]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const { users: rows } = await callAdmin("list-users");
      setUsers((rows as UserRow[]) || []);
      setUsersLoaded(true);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadPipeline() {
    if (pipelineLoaded) return;
    setPipelineLoading(true);
    try {
      const { gens: rows } = await callAdmin("pipeline");
      setGens((rows as Generation[]) || []);
      setPipelineLoaded(true);
    } catch {
      toast.error("Failed to load pipeline data");
    } finally {
      setPipelineLoading(false);
    }
  }

  async function loadStats() {
    if (statsLoaded) return;
    setStatsLoading(true);
    try {
      const data = await callAdmin("stats");
      setStatsData({
        gens30d: (data.gens30d as Generation[]) || [],
        payingCount: data.payingCount ?? 0,
        freeCount: data.freeCount ?? 0,
        totalCredits: data.totalCredits ?? 0,
        active7d: data.active7d ?? 0,
        active30d: data.active30d ?? 0,
      });
      setStatsLoaded(true);
    } catch {
      toast.error("Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    if (t === "pipeline") loadPipeline();
    if (t === "stats") loadStats();
  }

  async function adjustCredits(userId: string, delta: number, _current: number) {
    try {
      const { credits } = await callAdmin("adjust-credits", { userId, delta });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, credits } : u));
      toast.success(`Credits → ${credits}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update credits");
    }
  }

  async function toggleAdmin(userId: string, current: boolean) {
    try {
      const { is_admin } = await callAdmin("toggle-admin", { userId });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin } : u));
      toast.success(`Admin ${is_admin ? "granted" : "revoked"}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update admin status");
    }
  }

  function handleRefresh() {
    setUsersLoaded(false);
    setPipelineLoaded(false);
    setStatsLoaded(false);
    setGens([]);
    setStatsData(null);
    loadUsers();
    if (tab === "pipeline") { setPipelineLoaded(false); loadPipeline(); }
    if (tab === "stats") { setStatsLoaded(false); loadStats(); }
  }

  if (checking) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: mono, fontSize: 13, color: C.fgDim }}>Checking access…</span>
    </div>
  );

  if (!isAdmin) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <span style={{ fontFamily: mono, fontSize: 18, color: C.danger }}>Access denied</span>
      <span style={{ fontFamily: mono, fontSize: 12, color: C.fgDim }}>Admin privileges required</span>
    </div>
  );

  const filteredUsers = userSearch
    ? users.filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const stuckJobs = gens.filter(isStuck);
  const errorJobs = gens.filter(g => ERROR_STATUSES.has(g.status));
  const completeJobs = gens.filter(g => g.status === "complete");
  const errorBreakdown = Array.from(ERROR_STATUSES)
    .map(s => ({ status: s, count: gens.filter(g => g.status === s).length }))
    .filter(e => e.count > 0);

  const chartData = statsData ? groupByDay(statsData.gens30d) : [];
  const articleCount = statsData?.gens30d.filter(g => g.source_mode === "article").length ?? 0;
  const uploadCount = statsData ? statsData.gens30d.length - articleCount : 0;

  return (
    <AppShell activePage="Admin">
      <style>{`
        .admin-tab:hover { color: oklch(96% 0.005 250) !important; }
        .admin-btn:hover { opacity: 0.75 !important; }
        .admin-row:hover td { background: oklch(100% 0 0 / 0.018); }
        .admin-search:focus { outline: none; border-color: oklch(72% 0.17 280 / 0.4) !important; }
        .admin-search::placeholder { color: oklch(55% 0.01 250); }
      `}</style>

      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: `1px solid ${C.border}`,
        background: "oklch(11% 0.018 255)", flexShrink: 0,
      }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          ∞ Admin Console
        </span>
        <button
          className="admin-btn"
          onClick={handleRefresh}
          style={{
            fontFamily: mono, fontSize: 12, color: C.fgDim, background: "none",
            border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 14px",
            cursor: "pointer", transition: "opacity 0.1s",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px",
        borderBottom: `1px solid ${C.border}`, background: "oklch(11% 0.018 255)", flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className="admin-tab"
            onClick={() => handleTabChange(t.key)}
            style={{
              fontFamily: sans, fontSize: 14, fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? C.fg : C.fgDim, background: "none", border: "none",
              borderBottom: `2px solid ${tab === t.key ? C.accent : "transparent"}`,
              padding: "12px 18px", cursor: "pointer", transition: "all 0.12s",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            {t.label}
            {t.key === "users" && users.length > 0 && (
              <span style={{ fontFamily: mono, fontSize: 10, color: C.accent, background: C.accentSubtle, borderRadius: 4, padding: "2px 6px" }}>
                {users.length}
              </span>
            )}
            {t.key === "pipeline" && pipelineLoaded && stuckJobs.length > 0 && (
              <span style={{ fontFamily: mono, fontSize: 10, color: C.warning, background: "oklch(75% 0.17 75 / 0.1)", borderRadius: 4, padding: "2px 6px" }}>
                {stuckJobs.length} stuck
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          usersLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: mono, fontSize: 13, color: C.fgDim }}>Loading users…</div>
          ) : (
            <>
              <input
                className="admin-search"
                placeholder="Search by email…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{
                  marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "9px 14px", fontFamily: mono, fontSize: 13,
                  color: C.fg, width: "100%", maxWidth: 340, boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
              />
              <div style={{ overflowX: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Joined</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Credits</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Plan</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Admin</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Instagram</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Voice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: C.fgDim, padding: "40px" }}>
                          {userSearch ? "No users match that search" : "No users yet"}
                        </td>
                      </tr>
                    )}
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="admin-row">
                        <td style={{ ...tdStyle, color: C.fg, fontSize: 13 }}>{u.email}</td>
                        <td style={{ ...tdStyle, color: C.fgDim }}>{fmtDate(u.created_at)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <button
                              className="admin-btn"
                              onClick={() => adjustCredits(u.id, -10, u.credits)}
                              title="Remove 10 credits"
                              style={{
                                fontFamily: mono, fontSize: 11, cursor: "pointer",
                                background: "oklch(65% 0.2 25 / 0.12)", border: "1px solid oklch(65% 0.2 25 / 0.25)",
                                color: C.danger, borderRadius: 5, padding: "3px 7px", transition: "opacity 0.1s",
                              }}
                            >−10</button>
                            <span style={{ color: C.fg, fontWeight: 700, minWidth: 22, textAlign: "center" }}>{u.credits}</span>
                            <button
                              className="admin-btn"
                              onClick={() => adjustCredits(u.id, 10, u.credits)}
                              title="Add 10 credits"
                              style={{
                                fontFamily: mono, fontSize: 11, cursor: "pointer",
                                background: "oklch(72% 0.17 145 / 0.1)", border: "1px solid oklch(72% 0.17 145 / 0.25)",
                                color: C.success, borderRadius: 5, padding: "3px 7px", transition: "opacity 0.1s",
                              }}
                            >+10</button>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{
                            fontFamily: mono, fontSize: 10, padding: "3px 8px", borderRadius: 5,
                            background: u.has_sub ? "oklch(72% 0.17 145 / 0.09)" : "oklch(100% 0 0 / 0.04)",
                            color: u.has_sub ? C.success : C.fgDim,
                            border: `1px solid ${u.has_sub ? "oklch(72% 0.17 145 / 0.22)" : C.border}`,
                          }}>
                            {u.has_sub ? "Paying" : "Free"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <button
                            className="admin-btn"
                            onClick={() => toggleAdmin(u.id, u.is_admin)}
                            title={u.is_admin ? "Revoke admin" : "Grant admin"}
                            style={{
                              fontFamily: mono, fontSize: 10, padding: "3px 8px", borderRadius: 5,
                              background: u.is_admin ? C.accentSubtle : "oklch(100% 0 0 / 0.04)",
                              color: u.is_admin ? C.accent : C.fgDim,
                              border: `1px solid ${u.is_admin ? "oklch(72% 0.17 280 / 0.22)" : C.border}`,
                              cursor: "pointer", transition: "opacity 0.1s",
                            }}
                          >
                            {u.is_admin ? "Admin" : "User"}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontSize: 12, color: u.ig_username ? C.success : C.fgDim }}>
                          {u.ig_username ? `@${u.ig_username}` : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", color: u.has_voice ? C.success : C.fgDim }}>
                          {u.has_voice ? "✓" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* ── PIPELINE TAB ── */}
        {tab === "pipeline" && (
          pipelineLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: mono, fontSize: 13, color: C.fgDim }}>Loading pipeline…</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                <Card label="Sampled Renders" value={gens.length} sub="last 500" />
                <Card label="Complete" value={completeJobs.length} color={C.success} />
                <Card label="Errors" value={errorJobs.length} color={errorJobs.length > 0 ? C.danger : C.fgDim} />
                <Card label="Stuck" value={stuckJobs.length} color={stuckJobs.length > 0 ? C.warning : C.fgDim} sub="> 20 min" />
              </div>

              {errorBreakdown.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.fgDim, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                    Error Breakdown
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Error Type</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorBreakdown.map(e => (
                          <tr key={e.status}>
                            <td style={{ ...tdStyle, color: C.danger }}>{e.status}</td>
                            <td style={{ ...tdStyle, textAlign: "right", color: C.fg }}>{e.count}</td>
                            <td style={{ ...tdStyle, textAlign: "right", color: C.fgDim }}>
                              {gens.length ? `${((e.count / gens.length) * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {stuckJobs.length > 0 && (
                <div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.warning, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                    ⚠ Stuck Jobs
                  </div>
                  <div style={{ background: C.surface, border: `1px solid oklch(75% 0.17 75 / 0.18)`, borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Job ID</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Mode</th>
                          <th style={thStyle}>Started</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Elapsed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stuckJobs.map(j => {
                          const elapsed = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60000);
                          return (
                            <tr key={j.id}>
                              <td style={{ ...tdStyle, color: C.fgDim, fontSize: 11 }}>{j.id.slice(0, 8)}…</td>
                              <td style={{ ...tdStyle, color: C.warning }}>{j.status}</td>
                              <td style={{ ...tdStyle, color: C.fgMuted }}>{j.source_mode || "—"}</td>
                              <td style={{ ...tdStyle, color: C.fgDim }}>{fmtDate(j.created_at)}</td>
                              <td style={{ ...tdStyle, textAlign: "right", color: C.warning }}>{elapsed}m</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {pipelineLoaded && gens.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", fontFamily: mono, fontSize: 13, color: C.fgDim }}>No render data yet</div>
              )}
            </>
          )
        )}

        {/* ── STATS TAB ── */}
        {tab === "stats" && (
          statsLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: mono, fontSize: 13, color: C.fgDim }}>Loading stats…</div>
          ) : statsData ? (
            <>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px", marginBottom: 20 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: C.fgDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
                  Renders — Last 30 Days
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barSize={10}>
                    <CartesianGrid vertical={false} stroke="oklch(100% 0 0 / 0.04)" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontFamily: mono, fontSize: 10, fill: C.fgDim }}
                      axisLine={false} tickLine={false} interval={4}
                    />
                    <YAxis
                      tick={{ fontFamily: mono, fontSize: 10, fill: C.fgDim }}
                      axisLine={false} tickLine={false} allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: mono, fontSize: 12 }}
                      labelStyle={{ color: C.fgDim, marginBottom: 4 }}
                      itemStyle={{ color: C.accent }}
                      cursor={{ fill: "oklch(100% 0 0 / 0.03)" }}
                    />
                    <Bar dataKey="count" fill={C.accent} radius={[4, 4, 0, 0]} name="renders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <Card label="Total Renders (30d)" value={statsData.gens30d.length} />
                <Card
                  label="Article Mode"
                  value={articleCount}
                  sub={`${statsData.gens30d.length ? Math.round((articleCount / statsData.gens30d.length) * 100) : 0}% of renders`}
                />
                <Card
                  label="Upload Mode"
                  value={uploadCount}
                  sub={`${statsData.gens30d.length ? Math.round((uploadCount / statsData.gens30d.length) * 100) : 0}% of renders`}
                />
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Card label="Active Users (7d)" value={statsData.active7d} color={C.accent} />
                <Card label="Active Users (30d)" value={statsData.active30d} color={C.accent} />
                <Card label="Paying Users" value={statsData.payingCount} color={C.success} />
                <Card label="Free Users" value={statsData.freeCount} />
                <Card label="Credits in DB" value={statsData.totalCredits} sub="across all users" color={C.fgMuted} />
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: mono, fontSize: 13, color: C.fgDim }}>No stats available</div>
          )
        )}
      </div>
    </AppShell>
  );
}
