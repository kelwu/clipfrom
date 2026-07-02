import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { video_url, caption } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "Missing required field: video_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller JWT — derive user identity from token, never from the request body
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken: string;
    let accountId: string;

    // Load credentials for the authenticated user only
    const { data: profile } = await adminSupabase
      .from("user_profiles")
      .select("instagram_access_token, instagram_account_id")
      .eq("id", user.id)
      .single();

    if (profile?.instagram_access_token && profile?.instagram_account_id) {
      accessToken = profile.instagram_access_token;
      accountId = profile.instagram_account_id;
    } else {
      // Fall back to shared env-var account (admin posting scenario)
      accessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN")!;
      accountId = Deno.env.get("INSTAGRAM_ACCOUNT_ID")!;
      if (!accessToken || !accountId) {
        return new Response(
          JSON.stringify({ error: "Instagram account not connected. Please connect your Instagram account first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 1 — Create media container
    const createRes = await fetch(
      `https://graph.instagram.com/v22.0/${accountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url,
          caption: caption ?? "",
          access_token: accessToken,
        }),
      }
    );

    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) {
      console.error("Instagram container creation failed:", createData);
      return new Response(
        JSON.stringify({ error: "Failed to create Instagram media container", details: createData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const containerId: string = createData.id;

    // Step 2 — Poll until container is FINISHED (up to 5 min)
    let statusCode = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 15_000));

      const statusRes = await fetch(
        `https://graph.instagram.com/v22.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      statusCode = statusData.status_code ?? "";

      if (statusCode === "FINISHED") break;
      if (statusCode === "ERROR") {
        return new Response(
          JSON.stringify({ error: "Instagram media processing failed", details: statusData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (statusCode !== "FINISHED") {
      return new Response(
        JSON.stringify({ error: "Instagram media container timed out", status_code: statusCode }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3 — Publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v22.0/${accountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    const publishData = await publishRes.json();

    if (!publishRes.ok || !publishData.id) {
      console.error("Instagram publish failed:", publishData);
      return new Response(
        JSON.stringify({ error: "Failed to publish to Instagram", details: publishData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, post_id: publishData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("post-to-instagram error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
