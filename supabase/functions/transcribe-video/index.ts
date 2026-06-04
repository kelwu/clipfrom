import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FPS = 30;

// Words that, when spoken in isolation, are almost always verbal pauses rather than
// meaningful content. Conservative list — we err on the side of keeping content.
const FILLER_SINGLE = new Set([
  "um", "umm", "uh", "uhh", "uhm", "er", "erm",
  "mhm", "hmm", "ah", "ahh", "oh",
]);

// Multi-word fillers detected via lookahead. Each entry is exactly two words.
const FILLER_DOUBLE = new Set([
  "you know", "i mean", "kind of", "sort of", "you see",
]);

function normalizeForFiller(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

interface ScribeWord { word: string; startFrame: number; endFrame: number; type: string; is_filler?: boolean; }

function detectFillers(words: ScribeWord[]): ScribeWord[] {
  return words.map((w, i) => {
    if (w.type !== "word") return w;
    const lower = normalizeForFiller(w.word);
    if (!lower) return w;

    // Single-word filler check
    if (FILLER_SINGLE.has(lower)) return { ...w, is_filler: true };

    // Two-word lookahead — only checks the immediately next "word" token
    const next = words[i + 1];
    if (next && next.type === "word") {
      const nextLower = normalizeForFiller(next.word);
      if (nextLower && FILLER_DOUBLE.has(`${lower} ${nextLower}`)) {
        return { ...w, is_filler: true };
      }
    }
    // If the previous word formed a multi-word filler with us, we're the trailing half — also filler
    const prev = words[i - 1];
    if (prev && prev.type === "word") {
      const prevLower = normalizeForFiller(prev.word);
      if (prevLower && FILLER_DOUBLE.has(`${prevLower} ${lower}`)) {
        return { ...w, is_filler: true };
      }
    }

    return { ...w, is_filler: false };
  });
}

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

    // Convert seconds → frames, then detect filler words
    const rawWords: ScribeWord[] = (scribeData.words ?? []).map((w: {
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

    const transcriptWords = detectFillers(rawWords);
    const wordCount = transcriptWords.filter(w => w.type === "word").length;
    const fillers = transcriptWords.filter(w => w.is_filler);
    const fillerCount = fillers.length;
    const fillerSeconds = fillers.reduce(
      (sum, w) => sum + (w.endFrame - w.startFrame) / FPS, 0
    );

    await supabase.from("ai_generations").update({
      transcript_words: transcriptWords,
      status: "captions_ready",
    }).eq("project_id", project_id);

    return new Response(
      JSON.stringify({
        success: true,
        word_count: wordCount,
        filler_count: fillerCount,
        filler_seconds: Math.round(fillerSeconds * 10) / 10,
      }),
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
