import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// The signed-in user's credit balance, so screens can check before a paid action
// instead of discovering "no credits" only after navigating away.
export function useCredits() {
  const { user } = useAuth();
  const [state, setState] = useState<{ credits: number | null; isAdmin: boolean; loaded: boolean }>({
    credits: null, isAdmin: false, loaded: false,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("credits_remaining, is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setState({
        credits: data?.credits_remaining ?? null,
        isAdmin: !!data?.is_admin,
        loaded: true,
      }));
  }, [user?.id]);

  const outOfCredits = state.loaded && !state.isAdmin && (state.credits ?? 0) < 1;
  return { ...state, outOfCredits };
}
