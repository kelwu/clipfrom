import { createClient } from "npm:@supabase/supabase-js";
import Anthropic from "npm:@anthropic-ai/sdk";

// Finds the best standalone moments in a long video's transcript and saves them as
// video_segments. Idempotent: reopening the picker returns the saved picks; only an
// explicit { regenerate: true } replaces them (and never while shorts are rendering).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface TranscriptWord {
  word: string;
  startFrame: number;
  endFrame: number;
  type: string;
}

const FPS = 30;
const MIN_SEGMENT_FRAMES = 20 * FPS;
const MAX_SEGMENT_FRAMES = 90 * FPS;
const MAX_WORDS = 25_000; // ~2.5h of speech; comfortably inside the model's context
const MODEL = "claude-sonnet-5";
const FALLBACK_MODEL = "claude-haiku-4-5";

const PICKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["highlights"],
  properties: {
    highlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start_word", "end_word", "title", "why"],
        properties: {
          start_word: { type: "integer" },
          end_word: { type: "integer" },
          title: { type: "string" },
          why: { type: "string" },
        },
      },
    },
  },
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, regenerate = false } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: project } = await admin.from("projects").select("id, user_id").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) return json({ error: "Not found" }, 404);

    const { data: gen } = await admin
      .from("ai_generations")
      .select("id, status, transcript_words, video_duration_frames")
      .eq("project_id", project_id)
      .maybeSingle();
    if (!gen?.transcript_words) return json({ error: "Transcript not ready" }, 400);

    // Reopening the picker must not wipe picks (or shorts that are rendering)
    const { data: existing } = await admin
      .from("video_segments").select("*").eq("project_id", project_id).order("segment_index");
    if (existing && existing.length > 0) {
      if (!regenerate) return json({ segments: existing });
      if (gen.status === "generating_broll" || existing.some((s) => s.status === "rendering")) {
        return json({ error: "Your shorts are rendering — wait for them to finish first." }, 409);
      }
    }

    const words = (gen.transcript_words as TranscriptWord[]).filter((w) => w.type === "word").slice(0, MAX_WORDS);
    if (words.length < 60) return json({ error: "This video doesn't have enough speech to find highlights." }, 400);
    const totalFrames = gen.video_duration_frames ?? words[words.length - 1].endFrame + 60;
    const minutes = totalFrames / FPS / 60;
    const [minPicks, maxPicks] = minutes < 4 ? [1, 2] : minutes < 10 ? [2, 4] : [3, 5];

    // index:word, with a [m:ss] marker every 40 words so the model can reason about length
    const transcript = words
      .map((w, i) => (i % 40 === 0 ? `[${fmt(w.startFrame / FPS)}] ` : "") + `${i}:${w.word}`)
      .join(" ");

    const prompt = `This is the transcript of a ${Math.round(minutes)}-minute podcast/interview/talk. Find ${minPicks}-${maxPicks} moments that work as standalone short-form videos (Reels, TikTok, Shorts).

Each highlight must:
- Make sense on its own, with no context from before it
- Open strong: a surprising claim, strong opinion, story, or punchline in the first sentence
- Last 25-75 seconds (use the [m:ss] markers)
- Start at the beginning of a sentence and end at the end of a sentence
- Not overlap another highlight; spread them across the whole recording

Give start_word and end_word as word indices, a punchy title (max 8 words), and why (one sentence).

<transcript>
${transcript}
</transcript>`;

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const ask = async (model: string) => {
      const msg = await client.messages.create({
        model,
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema: PICKS_SCHEMA } },
      } as Anthropic.MessageCreateParamsNonStreaming);
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return JSON.parse(text) as { highlights: { start_word: number; end_word: number; title: string; why: string }[] };
    };
    let picks;
    try { picks = await ask(MODEL); }
    catch (err) { console.warn("[extract-highlights] primary model failed:", err); picks = await ask(FALLBACK_MODEL); }

    // Word indices → frames, with a little air on each side; enforce length and no overlap
    const segments: { startFrame: number; endFrame: number; title: string; summary: string }[] = [];
    for (const h of [...(picks.highlights ?? [])].sort((a, b) => a.start_word - b.start_word)) {
      const s = Math.max(0, Math.min(words.length - 1, Math.round(h.start_word)));
      let e = Math.max(s, Math.min(words.length - 1, Math.round(h.end_word)));
      const startFrame = Math.max(0, words[s].startFrame - 6);
      // Too long: end at the last sentence-ending word within the limit
      if (words[e].endFrame - startFrame > MAX_SEGMENT_FRAMES) {
        let cut = e;
        while (cut > s && (words[cut].endFrame - startFrame > MAX_SEGMENT_FRAMES || !/[.!?]["')]?$/.test(words[cut].word))) cut--;
        e = cut > s ? cut : e;
      }
      const endFrame = Math.min(totalFrames, words[e].endFrame + 12);
      if (endFrame - startFrame < MIN_SEGMENT_FRAMES || endFrame - startFrame > MAX_SEGMENT_FRAMES + 30) continue;
      const prev = segments[segments.length - 1];
      if (prev && startFrame < prev.endFrame) continue;
      segments.push({
        startFrame, endFrame,
        title: String(h.title ?? "").slice(0, 80),
        summary: String(h.why ?? "").slice(0, 200),
      });
    }
    if (segments.length === 0) return json({ error: "We couldn't find a clear standalone moment in this video. Try a longer recording." }, 422);

    await admin.from("video_segments").delete().eq("project_id", project_id);
    const { data: inserted, error: insertError } = await admin
      .from("video_segments")
      .insert(segments.map((s, i) => ({
        project_id, ai_gen_id: gen.id, segment_index: i,
        start_frame: s.startFrame, end_frame: s.endFrame,
        title: s.title, summary: s.summary, status: "pending",
      })))
      .select();
    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    return json({ segments: inserted });
  } catch (err) {
    console.error("[extract-highlights]", err);
    return json({ error: "We couldn't analyze this video. Please try again." }, 500);
  }
});
