import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export default function UpgradeSuccess() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let attempts = 0;
    let initialCredits: number | null = null;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("credits_remaining")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        // Capture baseline on first poll, stop as soon as credits increase
        if (initialCredits === null) {
          initialCredits = data.credits_remaining;
        } else if (data.credits_remaining > initialCredits) {
          setCredits(data.credits_remaining);
          clearInterval(interval);
          return;
        }
        setCredits(data.credits_remaining);
      }
      if (++attempts >= 20) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <div style={{ minHeight: "100vh", background: "oklch(14% 0.015 250)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: '"Geist", system-ui, sans-serif' }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        {/* Check icon */}
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "oklch(72% 0.17 280 / 0.15)", border: "1px solid oklch(72% 0.17 280 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="oklch(72% 0.17 280)" strokeWidth="2.5">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: "oklch(96% 0.005 250)", letterSpacing: "-0.02em", marginBottom: 10 }}>
          You're all set!
        </h1>
        <p style={{ fontSize: 15, color: "oklch(65% 0.01 250)", lineHeight: 1.6, marginBottom: 8 }}>
          Your payment was successful.
        </p>
        {credits !== null ? (
          <p style={{ fontSize: 15, color: "oklch(72% 0.17 280)", fontWeight: 600, marginBottom: 32 }}>
            You now have {credits} credit{credits !== 1 ? "s" : ""} ready to use.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "oklch(55% 0.01 250)", marginBottom: 32 }}>
            Credits are being added — this usually takes a few seconds…
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => navigate("/")}
            style={{ padding: "13px 0", background: "oklch(72% 0.17 280)", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, color: "oklch(14% 0.015 250)", cursor: "pointer" }}
          >
            Create a video
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={{ padding: "13px 0", background: "transparent", border: "1px solid oklch(100% 0 0 / 0.1)", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "oklch(65% 0.01 250)", cursor: "pointer" }}
          >
            Go to Library
          </button>
        </div>
      </div>
    </div>
  );
}
