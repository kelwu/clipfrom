import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  perGen: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 12,
    credits: 5,
    perGen: "$2.40 / video",
    features: ["5 videos per month", "All caption styles", "AI + stock footage", "Your own talking-head videos"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    credits: 20,
    perGen: "$1.45 / video",
    highlight: true,
    features: ["20 videos per month", "All caption styles", "AI + stock footage", "Your own talking-head videos", "Priority generation"],
  },
  {
    id: "creator",
    name: "Creator",
    price: 59,
    credits: 50,
    perGen: "$1.18 / video",
    features: ["50 videos per month", "All caption styles", "AI + stock footage", "Your own talking-head videos", "Priority generation"],
  },
];

interface Props {
  onClose: () => void;
}

export default function UpgradeModal({ onClose }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    if (!session) { toast.error("Please log in first"); return; }
    setLoading(planId);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            plan: planId,
            success_url: `${window.location.origin}/upgrade/success`,
            cancel_url: `${window.location.origin}/`,
          }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not start checkout — please try again");
        setLoading(null);
      }
    } catch {
      toast.error("Could not reach server");
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(10% 0.015 250 / 0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Upgrade your plan</h2>
            <p className="text-sm text-gray-500 mt-0.5">Credits are added immediately after payment and roll over month to month.</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1 ml-4 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Plans */}
        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-4 ${
                plan.highlight
                  ? "border-violet-500/50 bg-violet-500/5"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span className="bg-violet-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Most popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${plan.highlight ? "text-violet-400" : "text-gray-500"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-white">${plan.price}</span>
                  <span className="text-sm text-gray-500 mb-0.5">/mo</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{plan.perGen}</p>
              </div>

              <ul className="space-y-1.5 mb-5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-gray-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`flex-shrink-0 mt-0.5 ${plan.highlight ? "text-violet-400" : "text-gray-600"}`}>
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={loading !== null}
                className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                  plan.highlight
                    ? "bg-violet-500 hover:bg-violet-600 text-white"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                }`}
              >
                {loading === plan.id ? "Redirecting…" : `Get ${plan.name}`}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-gray-700 pb-5">
          Billed monthly · Cancel anytime · Secured by Stripe
        </p>
      </div>
    </div>
  );
}
