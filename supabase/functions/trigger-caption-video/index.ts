import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

async function refundCredit(supabaseAdmin: ReturnType<typeof createClient>, userId: string) {
  await supabaseAdmin.rpc("increment_credit", { uid: userId });
  console.log(`Refunded 1 credit to user ${userId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { project_id, captionStyle = "pill", user_email = "" } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("credits_remaining, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin && (profile?.credits_remaining ?? 0) < 1) {
      return new Response(JSON.stringify({ error: "no_credits" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let creditDecremented = false;
    const userId = user.id;

    if (!profile?.is_admin) {
      const { data: newCredits } = await supabaseAdmin.rpc("decrement_credit", { uid: userId });
      if (newCredits === null || newCredits === undefined) {
        return new Response(JSON.stringify({ error: "no_credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      creditDecremented = true;
    }

    // Fetch ai_gen_id
    const { data: gen, error: genError } = await supabaseAdmin
      .from("ai_generations")
      .select("id")
      .eq("project_id", project_id)
      .single();

    if (genError || !gen?.id) {
      if (creditDecremented) await refundCredit(supabaseAdmin, userId);
      return new Response(JSON.stringify({ error: "No transcript found for project" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as generating
    await supabaseAdmin
      .from("ai_generations")
      .update({ status: "generating_broll" })
      .eq("project_id", project_id);

    // Hand off to Railway pipeline (fire-and-forget)
    const pipelineRes = await fetch(`${RAILWAY_URL}/caption-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        ai_gen_id: gen.id,
        captionStyle,
        user_email,
        user_id: userId,
        secret: PIPELINE_SECRET,
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
    console.error("trigger-caption-video error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
