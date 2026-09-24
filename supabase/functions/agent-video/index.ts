import { createClient } from "npm:@supabase/supabase-js";
import type { VideoWebhookPayload } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

// Platform voices anyone may use (must match the VOICES lists in Settings.tsx / ClipReview.tsx).
// A user's own cloned voice is also allowed; anything else (e.g. another user's clone) is ignored.
const PRESET_VOICE_IDS = new Set(["KXOzch1bNSOicTxNAakl", "EXAVITQu4vr4xnSDxMaL", "pNInz6obpgDQGcFmaJgB"]);

const MAX_CAPTIONS = 5;
const MAX_CAPTION_CHARS = 400;

async function refundCredit(supabaseAdmin: ReturnType<typeof createClient>, userId: string) {
  await supabaseAdmin.rpc("increment_credit", { uid: userId });
  console.log(`Refunded 1 credit to user ${userId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: VideoWebhookPayload = await req.json();
    const { project_id, captionStyle = "pill", transitionStyle = "cut", videoSource = "ai", showHookCard, captionFont, hookText, captions: editedCaptions } = payload as typeof payload & { showHookCard?: boolean; captionFont?: string; hookText?: string; captions?: unknown };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and check credits
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user: callingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("credits_remaining, is_admin, preferred_voice_id, cloned_voice_id")
      .eq("id", callingUser.id)
      .maybeSingle();

    if (!profile?.is_admin && (profile?.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({ error: "no_credits" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let creditDecremented = false;
    const userId = callingUser.id;

    if (!profile?.is_admin) {
      // Atomic decrement — returns NULL if credits hit 0 between the check above and now
      const { data: newCredits } = await supabaseAdmin.rpc("decrement_credit", { uid: userId });
      if (newCredits === null || newCredits === undefined) {
        return new Response(JSON.stringify({ error: "no_credits" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      creditDecremented = true;
    }

    // Verify caller owns this project (prevent cross-tenant IDOR)
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", project_id)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      if (creditDecremented) await refundCredit(supabaseAdmin, userId);
      return new Response(JSON.stringify({ error: "Not your project" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch captions + article images
    const { data: gen, error } = await supabaseAdmin
      .from("ai_generations")
      .select("id, caption_options, article_images")
      .eq("project_id", project_id)
      .single();

    if (error || !gen?.caption_options) {
      if (creditDecremented) await refundCredit(supabaseAdmin, userId);
      return new Response(JSON.stringify({ error: "No captions found for project" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let captions: string[] = (Array.isArray(gen.caption_options)
      ? gen.caption_options
      : Object.values(gen.caption_options)) as string[];

    // The caption editor sends the user's edited (and possibly reduced) set. Validate it and
    // persist it so the review and final render use exactly what the user approved.
    if (editedCaptions !== undefined) {
      const cleaned = Array.isArray(editedCaptions)
        ? editedCaptions.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean)
        : [];
      if (cleaned.length < 1 || cleaned.length > MAX_CAPTIONS || cleaned.some((c) => c.length > MAX_CAPTION_CHARS)) {
        if (creditDecremented) await refundCredit(supabaseAdmin, userId);
        return new Response(JSON.stringify({ error: `Provide 1-${MAX_CAPTIONS} captions of at most ${MAX_CAPTION_CHARS} characters` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      captions = cleaned;
      const { error: saveErr } = await supabaseAdmin
        .from("ai_generations").update({ caption_options: captions }).eq("id", gen.id);
      if (saveErr) {
        if (creditDecremented) await refundCredit(supabaseAdmin, userId);
        throw new Error(`Failed to save edited captions: ${saveErr.message}`);
      }
    }

    if (captions.length < 1 || captions.length > MAX_CAPTIONS) {
      if (creditDecremented) await refundCredit(supabaseAdmin, userId);
      return new Response(JSON.stringify({ error: `Expected 1-${MAX_CAPTIONS} captions, got ${captions.length}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const articleImages: string[] = Array.isArray(gen.article_images) ? gen.article_images : [];
    const typedProfile = profile as { preferred_voice_id?: string | null; cloned_voice_id?: string | null } | null;
    const requestedVoice = typedProfile?.preferred_voice_id ?? null;
    const voiceId: string | null =
      requestedVoice && (PRESET_VOICE_IDS.has(requestedVoice) || requestedVoice === typedProfile?.cloned_voice_id)
        ? requestedVoice
        : null;
    // Always notify the authenticated user — never an address supplied in the request body.
    const user_email = callingUser.email ?? "";

    // Hand off to Railway pipeline (fire and forget — Railway responds 202 immediately)
    const pipelineRes = await fetch(`${RAILWAY_URL}/generate-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        ai_gen_id: gen.id,
        captions,
        captionStyle,
        transitionStyle,
        videoSource,
        user_email,
        user_id: userId,
        secret: PIPELINE_SECRET,
        ...(articleImages.length > 0 ? { article_images: articleImages } : {}),
        ...(voiceId ? { voice_id: voiceId } : {}),
        ...(showHookCard ? { showHookCard: true } : {}),
        ...(captionFont ? { captionFont } : {}),
        ...(hookText ? { hookText } : {}),
        skipRender: true, // stop after clips_ready so user can review before render
      }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      if (creditDecremented) await refundCredit(supabaseAdmin, userId);
      throw new Error(`Pipeline start failed: ${pipelineRes.status} ${errText}`);
    }

    return new Response(
      JSON.stringify({ ok: true, project_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-video error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
