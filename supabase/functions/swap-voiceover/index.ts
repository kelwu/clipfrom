import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, voice_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Auth + ownership
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: project }, { data: gen }] = await Promise.all([
      supabaseAdmin.from("projects").select("user_id").eq("id", project_id).maybeSingle(),
      supabaseAdmin.from("ai_generations").select("id, caption_options").eq("project_id", project_id).maybeSingle(),
    ]);

    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!gen?.id || !Array.isArray(gen.caption_options) || gen.caption_options.length === 0) {
      return new Response(JSON.stringify({ error: "No captions found for this project" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-generate voiceover with the chosen voice — reuses the existing function
    const voRes = await fetch(`${supabaseUrl}/functions/v1/generate-voiceover-and-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        ai_gen_id: gen.id,
        captions: gen.caption_options,
        ...(voice_id ? { voice_id } : {}),
      }),
    });

    if (!voRes.ok) {
      const errText = await voRes.text();
      throw new Error(`Voiceover generation failed: ${voRes.status} ${errText}`);
    }

    const { audio_url, caption_timings, word_timings, audio_duration_seconds } = await voRes.json();
    if (!audio_url) throw new Error("No audio_url returned from voiceover function");

    // Write new audio data to DB — renderFromClips reads these fields directly
    const { error: patchErr } = await supabaseAdmin
      .from("ai_generations")
      .update({
        audio_url,
        safe_caption_timings: caption_timings,
        word_timings,
        audio_duration_secs: audio_duration_seconds,
      })
      .eq("project_id", project_id);

    if (patchErr) throw new Error(`DB update failed: ${patchErr.message}`);

    return new Response(JSON.stringify({ ok: true, audio_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[swap-voiceover]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
