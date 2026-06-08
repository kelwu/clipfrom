import { createClient } from "npm:@supabase/supabase-js";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscriptWord {
  word: string;
  startFrame: number;
  endFrame: number;
  type: string;
  is_filler?: boolean;
}

const MIN_SEGMENT_FRAMES = 900;  // 30s at 30fps
const MAX_SEGMENT_FRAMES = 2700; // 90s at 30fps

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check
    const { data: project } = await supabaseAdmin
      .from("projects").select("id, user_id").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch transcript
    const { data: gen } = await supabaseAdmin
      .from("ai_generations")
      .select("id, transcript_words, video_duration_frames")
      .eq("project_id", project_id)
      .maybeSingle();

    if (!gen?.transcript_words) {
      return new Response(JSON.stringify({ error: "Transcript not ready" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcriptWords = gen.transcript_words as TranscriptWord[];
    const wordOnly = transcriptWords.filter(w => w.type === "word");
    const totalFrames = gen.video_duration_frames ??
      (wordOnly.length > 0 ? wordOnly[wordOnly.length - 1].endFrame + 60 : 5400);

    // Build compact transcript for Claude: index:word:startSec
    const indexed = wordOnly
      .map((w, i) => `${i}:${w.word.replace(/[^\w']/g, "")}:${(w.startFrame / 30).toFixed(1)}s`)
      .join(" ");

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are analyzing a podcast/talk transcript to find the best moments for short-form social media clips (Reels/TikToks/Shorts).

Pick 3-5 highlight moments that work as standalone 30-90 second videos. Each should:
- Stand alone — no context needed from before or after
- Have a clear hook: surprising insight, strong opinion, personal story, or memorable punchline
- Be between ${MIN_SEGMENT_FRAMES} and ${MAX_SEGMENT_FRAMES} frames (30-90 seconds at 30fps)
- Be spaced out — don't cluster all picks together

Return a JSON array ONLY, no other text:
[{"startFrame":0,"endFrame":1800,"title":"Punchy title (max 8 words)","summary":"Why this works as a short (1 sentence)"}]

Transcript (index:word:timestamp):
${indexed.slice(0, 4000)}`,
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Claude returned no valid JSON");

    type RawSegment = { startFrame: number; endFrame: number; title: string; summary: string };
    const rawSegments = JSON.parse(match[0]) as RawSegment[];

    const segments = rawSegments
      .filter(s => typeof s.startFrame === "number" && typeof s.endFrame === "number")
      .map(s => ({
        startFrame: Math.max(0, Math.round(s.startFrame)),
        endFrame: Math.min(totalFrames, Math.round(s.endFrame)),
        title: String(s.title ?? "").slice(0, 80),
        summary: String(s.summary ?? "").slice(0, 200),
      }))
      .filter(s => (s.endFrame - s.startFrame) >= MIN_SEGMENT_FRAMES)
      .slice(0, 5);

    if (segments.length === 0) throw new Error("No valid segments extracted");

    // Wipe previous segments for this project and insert fresh ones
    await supabaseAdmin.from("video_segments").delete().eq("project_id", project_id);

    const rows = segments.map((s, i) => ({
      project_id,
      ai_gen_id: gen.id,
      segment_index: i,
      start_frame: s.startFrame,
      end_frame: s.endFrame,
      title: s.title,
      summary: s.summary,
      status: "pending",
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("video_segments").insert(rows).select();
    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    return new Response(JSON.stringify({ segments: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-highlights]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
