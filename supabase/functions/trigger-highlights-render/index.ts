import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, captionStyle = "pill", broll_layout = null, user_email = "" } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!PIPELINE_SECRET) {
      return new Response(JSON.stringify({ error: "Server misconfigured: PIPELINE_SECRET not set" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Ownership + credit check
    const [{ data: project }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("projects").select("id, user_id").eq("id", project_id).maybeSingle(),
      supabaseAdmin.from("user_profiles").select("credits_remaining, is_admin").eq("id", user.id).maybeSingle(),
    ]);

    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = profile?.is_admin ?? false;
    if (!isAdmin && (profile?.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({ error: "no_credits" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let creditDecremented = false;
    if (!isAdmin) {
      const { data: newCredits } = await supabaseAdmin.rpc("decrement_credit", { uid: user.id });
      if (newCredits === null || newCredits === undefined) {
        return new Response(JSON.stringify({ error: "no_credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      creditDecremented = true;
    }

    // Fetch ai_gen_id
    const { data: gen } = await supabaseAdmin
      .from("ai_generations").select("id").eq("project_id", project_id).maybeSingle();
    if (!gen?.id) {
      if (creditDecremented) await supabaseAdmin.rpc("increment_credit", { uid: user.id });
      return new Response(JSON.stringify({ error: "No transcript found for project" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark pipeline as in-progress
    await supabaseAdmin
      .from("ai_generations")
      .update({ status: "generating_broll" })
      .eq("project_id", project_id);

    // Fire Railway (fire-and-forget from Railway's perspective)
    const pipelineRes = await fetch(`${RAILWAY_URL}/render-highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        ai_gen_id: gen.id,
        captionStyle,
        broll_layout,
        user_email,
        user_id: user.id,
        secret: PIPELINE_SECRET,
      }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      if (creditDecremented) await supabaseAdmin.rpc("increment_credit", { uid: user.id });
      throw new Error(`Railway rejected request: ${pipelineRes.status} ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true, project_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[trigger-highlights-render]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
