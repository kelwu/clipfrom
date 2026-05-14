import { createClient } from "npm:@supabase/supabase-js";
import type { VideoWebhookPayload } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: VideoWebhookPayload = await req.json();
    const { project_id, user_email = "", captionStyle = "pill", transitionStyle = "cut", videoSource = "ai" } = payload;

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
      .select("credits_remaining, is_admin")
      .eq("id", callingUser.id)
      .maybeSingle();

    if (!profile?.is_admin && (profile?.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({ error: "no_credits" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!profile?.is_admin) {
      await supabaseAdmin
        .from("user_profiles")
        .update({ credits_remaining: profile!.credits_remaining - 1 })
        .eq("id", callingUser.id);
    }

    // Fetch captions + article images
    const { data: gen, error } = await supabaseAdmin
      .from("ai_generations")
      .select("id, caption_options, article_images")
      .eq("project_id", project_id)
      .single();

    if (error || !gen?.caption_options) {
      return new Response(JSON.stringify({ error: "No captions found for project" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const captions: string[] = Array.isArray(gen.caption_options)
      ? gen.caption_options
      : Object.values(gen.caption_options);

    const articleImages: string[] = Array.isArray(gen.article_images) ? gen.article_images : [];

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
        secret: PIPELINE_SECRET,
        ...(articleImages.length > 0 ? { article_images: articleImages } : {}),
      }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
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
