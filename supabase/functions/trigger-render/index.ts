import { createClient } from "npm:@supabase/supabase-js";

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
    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller owns the project
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
    const { data: project } = await supabase.from("projects").select("user_id").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not your project" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomically claim the render: only one request can move the job out of the ready state,
    // so a double-click or retry can't launch two Lambda renders.
    const { data: prior } = await supabase
      .from("ai_generations").select("status").eq("project_id", project_id).maybeSingle();
    const { data: claimed } = await supabase
      .from("ai_generations")
      .update({ status: "render_queued" })
      .eq("project_id", project_id)
      .in("status", ["videos_ready", "clips_ready"])
      .select("id");
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ error: "This video is already rendering or isn't ready to render" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hand off to Railway Phase 2
    const pipelineRes = await fetch(`${RAILWAY_URL}/render-clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id, secret: PIPELINE_SECRET }),
    });

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      // Release the claim so the user can try again.
      await supabase.from("ai_generations")
        .update({ status: prior?.status ?? "videos_ready" })
        .eq("project_id", project_id).eq("status", "render_queued");
      throw new Error(`render-clips failed: ${pipelineRes.status} ${errText}`);
    }

    return new Response(
      JSON.stringify({ ok: true, project_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("trigger-render error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
