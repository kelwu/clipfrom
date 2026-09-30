import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// Defaults a user chose in Settings for new videos (user_profiles.preferences).
export interface Preferences {
  captionStyle?: "pill" | "bold" | "lower-third" | "none";
  brollLayout?: string;         // "auto" or a specific layout
  removeFillers?: boolean;
  articlePreset?: "viral" | "clean" | "cinematic" | "raw";
}

export function usePreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_profiles").select("preferences").eq("id", user.id).maybeSingle()
      .then(({ data }) => setPrefs((data?.preferences as Preferences) ?? {}));
  }, [user?.id]);

  const save = async (next: Preferences) => {
    if (!user) return false;
    setPrefs(next);
    const { error } = await supabase.from("user_profiles").update({ preferences: next }).eq("id", user.id);
    return !error;
  };

  return { prefs, save };
}
