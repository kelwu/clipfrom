import { createClient } from "npm:@supabase/supabase-js";

// Results-page b-roll editor for talking-head videos. Changes the saved plan
// (ai_generations.broll_plan) and marks it locked, so the next render uses the
// user's choices instead of asking the AI director again.
//   { action: "layout",  index, layout }   change one moment's layout
//   { action: "remove",  index }           drop a moment
//   { action: "restore", index }           bring a dropped moment back
//   { action: "swap",    index, query? }   different clip (optionally a new search)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAILWAY_URL = Deno.env.get("RAILWAY_URL") ?? "https://clipfrom-remotion-production.up.railway.app";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LAYOUTS = new Set([
  "fullscreen", "top-three-quarters", "top-two-thirds", "top-half",
  "top-third", "bottom-third", "floating", "corner",
]);
const IN_FLIGHT = new Set(["transcribing", "generating_broll", "videos_ready", "remotion_rendering"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id, action, index, layout, query } = await req.json();
    if (typeof project_id !== "string" || !Number.isInteger(index)) return json({ error: "project_id and index required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: project } = await admin.from("projects").select("user_id").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) return json({ error: "Not found" }, 404);

    const { data: gen } = await admin
      .from("ai_generations").select("status, broll_plan").eq("project_id", project_id).maybeSingle();
    if (IN_FLIGHT.has(gen?.status ?? "")) return json({ error: "This video is rendering — edit it when it's done." }, 409);
    const plan = gen?.broll_plan as { moments?: Record<string, unknown>[]; locked?: boolean } | null;
    const moment = plan?.moments?.[index];
    if (!plan || !moment) return json({ error: "No such b-roll moment" }, 404);

    if (action === "swap") {
      const res = await fetch(`${RAILWAY_URL}/broll-alternative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id, moment_index: index,
          ...(typeof query === "string" && query.trim() ? { query: query.trim().slice(0, 80) } : {}),
          secret: PIPELINE_SECRET,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: body.error ?? "Couldn't find another clip" }, res.status === 404 ? 404 : 502);
      return json({ ok: true, clipUrl: body.clipUrl, query: body.query });
    }

    if (action === "layout") {
      if (typeof layout !== "string" || !LAYOUTS.has(layout)) return json({ error: "Unknown layout" }, 400);
      moment.layout = layout;
    } else if (action === "remove") {
      moment.removed = true;
    } else if (action === "restore") {
      delete moment.removed;
    } else {
      return json({ error: "Unknown action" }, 400);
    }
    plan.locked = true;
    const { error: updateError } = await admin.from("ai_generations").update({ broll_plan: plan }).eq("project_id", project_id);
    if (updateError) throw updateError;
    return json({ ok: true, moment });
  } catch (err) {
    console.error("[edit-broll]", err);
    return json({ error: "Could not save that change. Please try again." }, 500);
  }
});
