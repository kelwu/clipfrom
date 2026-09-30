import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, captionStyle = "pill", broll_layout = null } = await req.json();
    if (!project_id) return json({ error: "project_id required" }, 400);
    if (!PIPELINE_SECRET) return json({ error: "Server misconfigured: PIPELINE_SECRET not set" }, 503);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Ownership + credit check
    const [{ data: project }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("projects").select("id, user_id").eq("id", project_id).maybeSingle(),
      supabaseAdmin.from("user_profiles").select("credits_remaining, is_admin").eq("id", user.id).maybeSingle(),
    ]);
    if (!project || project.user_id !== user.id) return json({ error: "Not found" }, 404);

    const isAdmin = profile?.is_admin ?? false;
    if (!isAdmin && (profile?.credits_remaining ?? 0) < 1) return json({ error: "no_credits" }, 402);

    // Checked before charging: a run already in progress is not started twice
    const { data: gen } = await supabaseAdmin
      .from("ai_generations").select("id, status").eq("project_id", project_id).maybeSingle();
    if (!gen?.id) return json({ error: "No transcript found for project" }, 400);
    if (gen.status === "generating_broll") return json({ error: "already_rendering" }, 409);

    let creditDecremented = false;
    if (!isAdmin) {
      const { data: newCredits } = await supabaseAdmin.rpc("decrement_credit", { uid: user.id });
      if (newCredits === null || newCredits === undefined) return json({ error: "no_credits" }, 402);
      creditDecremented = true;
    }

    // Atomic claim. credit_charged_at lets the refund trigger return this credit
    // exactly once if the run fails from here on (no manual refunds after this).
    const { data: claimed } = await supabaseAdmin
      .from("ai_generations")
      .update({
        status: "generating_broll",
        // Saved so "Retry failed shorts" reuses the user's choices
        render_params: { captionStyle, brollLayout: broll_layout ?? "auto" },
        ...(creditDecremented ? { credit_charged_at: new Date().toISOString() } : {}),
      })
      .eq("project_id", project_id)
      .neq("status", "generating_broll")
      .select("id");
    if (!claimed || claimed.length === 0) {
      if (creditDecremented) await supabaseAdmin.rpc("increment_credit", { uid: user.id });
      return json({ error: "already_rendering" }, 409);
    }

    // Fire Railway (fire-and-forget from Railway's perspective)
    const pipelineRes = await fetch(`${RAILWAY_URL}/render-highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        ai_gen_id: gen.id,
        captionStyle,
        broll_layout,
        user_email: user.email ?? "", // authenticated user only — never a body-supplied address
        user_id: user.id,
        secret: PIPELINE_SECRET,
      }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      // 'failed' → the refund trigger returns the credit (once) via credit_charged_at
      await supabaseAdmin
        .from("ai_generations")
        .update({ status: "failed", debug_log: `Railway rejected request: ${pipelineRes.status}` })
        .eq("project_id", project_id);
      throw new Error(`Railway rejected request: ${pipelineRes.status} ${errText}`);
    }

    return json({ ok: true, project_id });
  } catch (err) {
    console.error("[trigger-highlights-render]", err);
    return json({ error: String(err) }, 500);
  }
});
