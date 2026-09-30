import { createClient } from "npm:@supabase/supabase-js";

// Applies the user's corrections to misheard words in an uploaded video's transcript.
// Only the text of existing words changes — timings, order and word count never do,
// so captions stay in sync. Refused while the video is being processed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const IN_FLIGHT = new Set(["transcribing", "generating_broll", "videos_ready", "remotion_rendering"]);
const MAX_EDITS = 1000;
const MAX_WORD_CHARS = 40;

interface TranscriptWord { word: string; type: string; [k: string]: unknown }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, edits } = await req.json();
    if (typeof project_id !== "string" || !Array.isArray(edits)) return json({ error: "project_id and edits required" }, 400);
    if (edits.length === 0) return json({ ok: true, changed: 0 });
    if (edits.length > MAX_EDITS) return json({ error: "Too many edits at once" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: project } = await admin.from("projects").select("user_id").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) return json({ error: "Not found" }, 404);

    const { data: gen } = await admin
      .from("ai_generations").select("status, transcript_words").eq("project_id", project_id).maybeSingle();
    if (!gen || !Array.isArray(gen.transcript_words)) return json({ error: "No transcript for this project" }, 400);
    if (IN_FLIGHT.has(gen.status ?? "")) return json({ error: "This video is being processed — try again when it's done." }, 409);

    const words = gen.transcript_words as TranscriptWord[];
    // Edits address words by their position among word-type tokens (what the UI shows)
    const wordPositions: number[] = [];
    words.forEach((w, i) => { if (w.type === "word") wordPositions.push(i); });

    let changed = 0;
    for (const e of edits) {
      const idx = Number(e?.index);
      const text = typeof e?.word === "string" ? e.word.trim().replace(/\s+/g, " ") : "";
      if (!Number.isInteger(idx) || idx < 0 || idx >= wordPositions.length) return json({ error: `Invalid word position: ${e?.index}` }, 400);
      if (!text || text.length > MAX_WORD_CHARS || /[\u0000-\u001f<>]/.test(text)) return json({ error: "Each word must be 1-40 plain characters" }, 400);
      const target = words[wordPositions[idx]];
      if (target.word !== text) { target.word = text; changed++; }
    }

    const { error: updateError } = await admin
      .from("ai_generations").update({ transcript_words: words }).eq("project_id", project_id);
    if (updateError) throw updateError;
    return json({ ok: true, changed });
  } catch (err) {
    console.error("[update-transcript]", err);
    return json({ error: "Could not save your fixes. Please try again." }, 500);
  }
});
