import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";
// Must match agent-video's PRESET_VOICE_IDS and the VOICES lists in the UI.
const PRESET_VOICE_IDS = new Set(["KXOzch1bNSOicTxNAakl", "EXAVITQu4vr4xnSDxMaL", "pNInz6obpgDQGcFmaJgB"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // captions (optional): the user's edited script lines, one per clip
    const { project_id, voice_id, captions } = await req.json();
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
      supabaseAdmin.from("ai_generations").select("id, caption_options, status").eq("project_id", project_id).maybeSingle(),
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

    // The audio can't change under a render that's already using it
    if (gen.status !== "videos_ready" && gen.status !== "clips_ready") {
      return new Response(JSON.stringify({ error: "This video is rendering or already finished — changes aren't possible now." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Edited lines: same count as the clips (they map 1:1), non-empty, reasonable length
    let lines: string[] = gen.caption_options as string[];
    if (captions !== undefined) {
      const cleaned = Array.isArray(captions) ? captions.map((c) => (typeof c === "string" ? c.trim() : "")) : [];
      if (cleaned.length !== lines.length || cleaned.some((c) => !c || c.length > 400)) {
        return new Response(JSON.stringify({ error: `Provide ${lines.length} non-empty lines of at most 400 characters` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      lines = cleaned;
    }

    // Only platform voices or the caller's own cloned voice — never another user's clone.
    if (voice_id && !PRESET_VOICE_IDS.has(voice_id)) {
      const { data: prof } = await supabaseAdmin
        .from("user_profiles").select("cloned_voice_id").eq("id", user.id).maybeSingle();
      if (prof?.cloned_voice_id !== voice_id) {
        return new Response(JSON.stringify({ error: "Voice not available" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Re-generate voiceover with the chosen voice — reuses the existing function
    // (internal endpoint gated by PIPELINE_SECRET; without the header it returns 403).
    const voRes = await fetch(`${supabaseUrl}/functions/v1/generate-voiceover-and-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "x-pipeline-secret": PIPELINE_SECRET,
      },
      body: JSON.stringify({
        ai_gen_id: gen.id,
        captions: lines,
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
        ...(captions !== undefined ? { caption_options: lines } : {}),
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
