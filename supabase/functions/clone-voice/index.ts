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

    // Verify caller
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

    // Parse the audio file from multipart form
    const formData = await req.formData();
    const file = formData.get("file");
    const requestedName = formData.get("name");
    const name = (typeof requestedName === "string" && requestedName.trim()) || user.email?.split("@")[0] || "My Voice";

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No audio file uploaded" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 10 MB cap — ElevenLabs accepts up to 10 MB per sample on Starter+
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "Audio sample too large (max 10 MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If the user already has a cloned voice, delete it first so we don't
    // pile up unused voices against their ElevenLabs quota
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("cloned_voice_id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.cloned_voice_id) {
      await fetch(`https://api.elevenlabs.io/v1/voices/${existing.cloned_voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": elevenLabsKey },
      }).catch(() => { /* best effort */ });
    }

    // POST sample to ElevenLabs /v1/voices/add
    const elFormData = new FormData();
    elFormData.append("name", `${name} — ClipFrom ${user.id.slice(0, 8)}`);
    elFormData.append("files", file, file.name || "sample.mp3");
    elFormData.append("description", "Voice cloned via ClipFrom");

    const elRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsKey },
      body: elFormData,
    });

    if (!elRes.ok) {
      const errText = await elRes.text();
      // Surface common errors cleanly
      if (elRes.status === 401) {
        throw new Error("ElevenLabs API key is invalid or missing");
      }
      if (elRes.status === 400 && errText.includes("voice_limit")) {
        throw new Error("ElevenLabs voice limit reached — upgrade your plan or delete unused voices");
      }
      throw new Error(`ElevenLabs error ${elRes.status}: ${errText.slice(0, 200)}`);
    }

    const { voice_id } = await elRes.json() as { voice_id: string };

    // Save to user_profiles + set as preferred voice
    await supabase
      .from("user_profiles")
      .update({
        cloned_voice_id: voice_id,
        cloned_voice_name: name,
        preferred_voice_id: voice_id,
      })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ success: true, voice_id, name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("clone-voice error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
