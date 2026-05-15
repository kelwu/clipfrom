import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";

interface Profile {
  instagram_account_id: string | null;
  instagram_username: string | null;
  instagram_token_expires_at: string | null;
  caption_outro: string | null;
  credits_remaining: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  preferred_voice_id: string | null;
}

const VOICES = [
  { id: "KXOzch1bNSOicTxNAakl", name: "Kel",    gender: "Male",   tone: "Custom voice", color: "#e879f9" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "Female", tone: "Calm & clear", color: "#a78bfa" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",   gender: "Male",   tone: "Deep & warm",  color: "#60a5fa" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  gender: "Female", tone: "Soft & expressive", color: "#f472b6" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",   gender: "Male",   tone: "Authoritative", color: "#34d399" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "Male",   tone: "Conversational", color: "#fb923c" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",   gender: "Female", tone: "Energetic & young", color: "#facc15" },
] as const;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-800 pb-8 mb-8 last:border-0 last:mb-0 last:pb-0">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session, signOut } = useAuth();
  const billingPreview = new URLSearchParams(location.search).get("billing") === "preview";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [outro, setOutro] = useState("");
  const [editingOutro, setEditingOutro] = useState(false);
  const [savingOutro, setSavingOutro] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectingIg, setConnectingIg] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("instagram_account_id, instagram_username, instagram_token_expires_at, caption_outro, credits_remaining, stripe_customer_id, stripe_subscription_id, preferred_voice_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? { instagram_account_id: null, instagram_username: null, instagram_token_expires_at: null, caption_outro: null, credits_remaining: null, stripe_customer_id: null, stripe_subscription_id: null, preferred_voice_id: null });
        setOutro(data?.caption_outro ?? "");
      });
  }, [user?.id]);

  const handleSaveOutro = async () => {
    if (!user) return;
    setSavingOutro(true);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: user.id, caption_outro: outro, updated_at: new Date().toISOString() });
    setSavingOutro(false);
    if (error) { toast.error("Failed to save"); return; }
    setProfile(p => p ? { ...p, caption_outro: outro } : p);
    setEditingOutro(false);
    toast.success("Saved");
  };

  const handleSelectVoice = async (voiceId: string | null) => {
    if (!user) return;
    setSavingVoice(true);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: user.id, preferred_voice_id: voiceId, updated_at: new Date().toISOString() });
    setSavingVoice(false);
    if (error) { toast.error("Failed to save voice"); return; }
    setProfile(p => p ? { ...p, preferred_voice_id: voiceId } : p);
    const voiceName = VOICES.find(v => v.id === voiceId)?.name ?? "Default";
    toast.success(`Voice set to ${voiceId ? voiceName : "Default"}`);
  };

  const handleDisconnectInstagram = async () => {
    if (!user) return;
    setDisconnecting(true);
    const { error } = await supabase
      .from("user_profiles")
      .upsert({
        id: user.id,
        instagram_account_id: null,
        instagram_access_token: null,
        instagram_token_expires_at: null,
        instagram_username: null,
        updated_at: new Date().toISOString(),
      });
    setDisconnecting(false);
    if (error) { toast.error("Failed to disconnect"); return; }
    setProfile(p => p ? { ...p, instagram_account_id: null, instagram_username: null, instagram_token_expires_at: null } : p);
    toast.success("Instagram disconnected");
  };

  const handleConnectInstagram = async () => {
    if (!session) return;
    setConnectingIg(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-start`,
        { headers: { "Authorization": `Bearer ${session.access_token}`, "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY } }
      );
      const data = await res.json();
      if (data.url) {
        sessionStorage.setItem("ig_oauth_return_to", "/settings");
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

  const handleManageBilling = async () => {
    if (!session) return;
    setLoadingPortal(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ return_url: window.location.href }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Could not open billing portal");
        setLoadingPortal(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach server");
      setLoadingPortal(false);
    }
  };

  const tokenExpiresAt = profile?.instagram_token_expires_at
    ? new Date(profile.instagram_token_expires_at)
    : null;
  const daysUntilExpiry = tokenExpiresAt
    ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <AppShell activePage="Settings">
      {/* Top bar */}
      <div className="flex items-center px-6 py-3 border-b border-gray-800 bg-[#0d0d0d] flex-shrink-0">
        <span className="text-sm font-medium text-white">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto">

          {/* Account */}
          <Section title="Account" description="Your ClipFrom account details.">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Email</p>
                  <p className="text-sm text-white mt-0.5">{user?.email}</p>
                </div>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); navigate("/login"); }}
              className="mt-3 text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </Section>

          {/* Instagram */}
          <Section title="Instagram" description="Connect your Instagram Business or Creator account to post Reels directly from ClipFrom.">
            {profile === null ? (
              <div className="h-16 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ) : profile.instagram_account_id ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-pink-500/10 border border-pink-500/20 rounded-lg flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-400">
                        <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {profile.instagram_username ? `@${profile.instagram_username}` : "Connected"}
                      </p>
                      {daysUntilExpiry !== null && (
                        <p className={`text-xs mt-0.5 ${daysUntilExpiry < 7 ? "text-amber-400" : "text-gray-500"}`}>
                          Token expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnectInstagram}
                    disabled={disconnecting}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleConnectInstagram}
                disabled={connectingIg}
                className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 border border-gray-800 hover:border-pink-500/40 rounded-xl text-sm font-semibold text-gray-300 hover:text-pink-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
                {connectingIg ? "Connecting…" : "Connect Instagram Account"}
              </button>
            )}
          </Section>

          {/* Billing */}
          <Section title="Billing" description="Your current plan and credit balance.">
            {profile === null ? (
              <div className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Plan</p>
                    <p className="text-sm text-white mt-0.5">
                      {profile.stripe_subscription_id ? "Active subscription" : "Free"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Credits</p>
                    <p className="text-sm text-white mt-0.5">
                      {profile.credits_remaining ?? 0} remaining
                    </p>
                  </div>
                </div>
                {(profile.stripe_customer_id || billingPreview) ? (
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingPortal}
                    className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-lg text-xs font-semibold text-gray-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPortal ? "Opening portal…" : "Manage subscription"}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/?upgrade=true")}
                    className="w-full px-4 py-2.5 bg-violet-500 hover:bg-violet-600 rounded-lg text-xs font-semibold text-white transition-colors"
                  >
                    Upgrade plan
                  </button>
                )}
              </div>
            )}
          </Section>

          {/* Voice */}
          <Section title="Voiceover" description="Choose the voice used for all your videos. Generate a test video after selecting to hear it.">
            {profile === null ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Default option */}
                {(() => {
                  const isSelected = profile.preferred_voice_id === null;
                  return (
                    <button
                      key="default"
                      onClick={() => handleSelectVoice(null)}
                      disabled={savingVoice}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
                        isSelected
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-gray-800 bg-gray-900 hover:border-gray-600"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-gray-700 text-gray-300">
                        ★
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white leading-tight">Default</p>
                        <p className="text-[10px] text-gray-500 leading-tight truncate">Platform voice</p>
                      </div>
                      {isSelected && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })()}
                {VOICES.map(voice => {
                  const isSelected = profile.preferred_voice_id === voice.id;
                  return (
                    <button
                      key={voice.id}
                      onClick={() => handleSelectVoice(voice.id)}
                      disabled={savingVoice}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
                        isSelected
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-gray-800 bg-gray-900 hover:border-gray-600"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: `${voice.color}20`, color: voice.color }}
                      >
                        {voice.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white leading-tight">{voice.name}</p>
                        <p className="text-[10px] text-gray-500 leading-tight truncate">{voice.tone}</p>
                      </div>
                      {isSelected && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Caption Outro */}
          <Section title="Caption Outro" description="Text appended to the end of every Instagram caption you generate.">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {editingOutro ? (
                <div className="p-4 space-y-3">
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 resize-none focus:outline-none focus:border-violet-500 leading-relaxed"
                    rows={4}
                    placeholder={'e.g. "Comment LINK and I\'ll DM you the full guide 👇"'}
                    value={outro}
                    onChange={(e) => setOutro(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingOutro(false); setOutro(profile?.caption_outro ?? ""); }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveOutro}
                      disabled={savingOutro}
                      className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-60 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {savingOutro ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between p-4 gap-4">
                  <p className="text-xs text-gray-400 leading-relaxed flex-1">
                    {profile?.caption_outro || <span className="text-gray-600 italic">No outro set.</span>}
                  </p>
                  <button
                    onClick={() => setEditingOutro(true)}
                    className="text-xs text-gray-500 hover:text-white transition-colors flex-shrink-0"
                  >
                    {profile?.caption_outro ? "Edit" : "Add"}
                  </button>
                </div>
              )}
            </div>
          </Section>

        </div>
      </div>
    </AppShell>
  );
}
