import { createClient } from "npm:@supabase/supabase-js";

// Deletes one of the caller's projects: its uploaded source files in storage, then the
// project row (ai_generations and video_segments cascade). Refuses while work is still
// running, so a render isn't orphaned mid-flight (its refund would be lost with the row).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Statuses where a pipeline is actively working on the project.
const IN_FLIGHT = new Set([
  "processing", "transcribing", "generating_broll", "generating_videos",
  "ai_tasks_created", "ai_tasks_done", "render_queued", "remotion_rendering",
]);
// Past this age an in-flight status is treated as abandoned and may be deleted.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (typeof project_id !== "string" || !project_id) return json({ error: "project_id required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: project } = await admin
      .from("projects").select("id, user_id, source_mode").eq("id", project_id).maybeSingle();
    if (!project || project.user_id !== user.id) return json({ error: "Not found" }, 404);

    const { data: gen } = await admin
      .from("ai_generations").select("status, status_changed_at").eq("project_id", project_id).maybeSingle();
    const status = gen?.status ?? "";
    // For uploads, videos_ready means the final render is running
    const running = IN_FLIGHT.has(status) || (status === "videos_ready" && project.source_mode === "video");
    const changedAt = gen?.status_changed_at ? new Date(gen.status_changed_at).getTime() : 0;
    if (running && Date.now() - changedAt < STALE_AFTER_MS) {
      return json({ error: "still_processing" }, 409);
    }

    // Uploaded source video(s) live under user-videos/<user_id>/<project_id>/
    const folder = `${user.id}/${project_id}`;
    const { data: files } = await admin.storage.from("user-videos").list(folder, { limit: 100 });
    if (files && files.length > 0) {
      const { error: rmError } = await admin.storage.from("user-videos").remove(files.map((f) => `${folder}/${f.name}`));
      if (rmError) console.warn("[delete-project] storage cleanup failed:", rmError.message);
    }

    const { error: delError } = await admin.from("projects").delete().eq("id", project_id).eq("user_id", user.id);
    if (delError) throw delError;

    return json({ ok: true });
  } catch (err) {
    console.error("[delete-project]", err);
    return json({ error: String(err) }, 500);
  }
});
