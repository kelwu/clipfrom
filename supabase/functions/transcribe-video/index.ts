import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FPS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let project_id: string | undefined;

  try {
    const body = await req.json();
    project_id = body.project_id;
    const video_url: string = body.video_url;
    const video_duration_frames: number = body.video_duration_frames ?? 0;

    if (!project_id || !video_url) {
      return new Response(JSON.stringify({ error: "project_id and video_url are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller owns this project
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
    const { data: projectRow } = await supabase.from("projects").select("user_id").eq("id", project_id).maybeSingle();
    if (!projectRow || projectRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not your project" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as transcribing (onConflict handles projects that already have an article-mode row)
    const { error: upsertError } = await supabase.from("ai_generations").upsert({
      project_id,
      source_mode: "video",
      user_video_url: video_url,
      status: "transcribing",
      ...(video_duration_frames > 0 ? { video_duration_frames } : {}),
    }, { onConflict: "project_id" });

    if (upsertError) throw new Error(`DB upsert failed: ${upsertError.message}`);

    // Download video from Supabase Storage, then POST binary to ElevenLabs Scribe
    const videoRes = await fetch(video_url);
    if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
    const videoBlob = await videoRes.blob();

    const formData = new FormData();
    formData.append("file", videoBlob, "video.mp4");
    formData.append("model_id", "scribe_v1");
    formData.append("timestamps_granularity", "word");
    formData.append("tag_audio_events", "false");

    const scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsKey },
      body: formData,
    });

    if (!scribeRes.ok) {
      const errText = await scribeRes.text();
      throw new Error(`ElevenLabs Scribe error ${scribeRes.status}: ${errText}`);
    }

    const scribeData = await scribeRes.json();

    // Convert seconds → frames, keep only word-type tokens
    const transcriptWords = (scribeData.words ?? []).map((w: {
      text: string;
      start: number;
      end: number;
      type: string;
    }) => ({
      word: w.text,
      startFrame: Math.round(w.start * FPS),
      endFrame: Math.round(w.end * FPS),
      type: w.type,
    }));

    const wordCount = transcriptWords.filter((w: { type: string }) => w.type === "word").length;

    await supabase.from("ai_generations").update({
      transcript_words: transcriptWords,
      status: "captions_ready",
    }).eq("project_id", project_id);

    return new Response(
      JSON.stringify({ success: true, word_count: wordCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("transcribe-video error:", error);
    if (project_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase.from("ai_generations").update({
          status: "transcription_error",
          debug_log: error.message,
        }).eq("project_id", project_id);
      } catch { /* best effort */ }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
