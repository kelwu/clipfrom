import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "clipfrom_onboarded";

const STEPS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
      </svg>
    ),
    title: "Paste any article",
    desc: "Drop in a URL or paste text from any news story, blog post, or newsletter.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
    ),
    title: "AI writes the script",
    desc: "ClipFrom generates 5 caption hooks, records the voiceover, and sources cinematic B-roll — automatically.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
    title: "Download & post",
    desc: "Get a 9:16 MP4 ready for Instagram Reels, TikTok, and YouTube Shorts in minutes.",
  },
];

export default function OnboardingModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Only show for users with no projects yet
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        if ((count ?? 0) === 0) setVisible(true);
      });
  }, [user?.id]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const handleStart = () => {
    dismiss();
    navigate("/");
  };

  if (!visible) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "oklch(14% 0.015 250 / 0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div style={{ background: "oklch(18% 0.015 250)", border: "1px solid oklch(100% 0 0 / 0.1)", borderRadius: 20, padding: "40px 40px 32px", maxWidth: 460, width: "100%", position: "relative" }}>
        {/* Close */}
        <button
          onClick={dismiss}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "oklch(45% 0.01 250)", cursor: "pointer", padding: 4 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 44, height: 44, background: "oklch(72% 0.17 280)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="oklch(14% 0.015 250)"><polygon points="6,3 20,12 6,21"/></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "oklch(96% 0.005 250)", letterSpacing: "-0.02em", marginBottom: 8 }}>
            Welcome to ClipFrom
          </h2>
          <p style={{ fontSize: 14, color: "oklch(65% 0.01 250)", lineHeight: 1.6 }}>
            Turn any article into a short-form video in three steps.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 16, padding: "14px 16px", background: "oklch(21% 0.015 250)", borderRadius: 12 }}>
              <div style={{ width: 40, height: 40, background: "oklch(72% 0.17 280 / 0.12)", border: "1px solid oklch(72% 0.17 280 / 0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "oklch(72% 0.17 280)" }}>
                {step.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "oklch(96% 0.005 250)", marginBottom: 3 }}>{step.title}</p>
                <p style={{ fontSize: 12, color: "oklch(65% 0.01 250)", lineHeight: 1.55 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          style={{ width: "100%", padding: "13px 0", background: "oklch(72% 0.17 280)", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "oklch(14% 0.015 250)", cursor: "pointer", letterSpacing: "-0.01em" }}
        >
          Create my first video →
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "oklch(45% 0.01 250)", marginTop: 12 }}>
          Takes about 5–10 minutes end-to-end.
        </p>
      </div>
    </div>
  );
}
