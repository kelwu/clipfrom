import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("cloned_voice_id, preferred_voice_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.cloned_voice_id) {
      await fetch(`https://api.elevenlabs.io/v1/voices/${profile.cloned_voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": elevenLabsKey },
      }).catch(() => { /* best effort */ });

      // Clear the cloned voice fields, and reset preferred if it was pointing here
      const updates: Record<string, unknown> = {
        cloned_voice_id: null,
        cloned_voice_name: null,
      };
      if (profile.preferred_voice_id === profile.cloned_voice_id) {
        updates.preferred_voice_id = null;
      }
      await supabase.from("user_profiles").update(updates).eq("id", user.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-cloned-voice error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
