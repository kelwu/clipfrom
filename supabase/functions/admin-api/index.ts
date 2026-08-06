import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DAY_MS = 86_400_000;

interface Generation {
  id: string;
  status: string;
  source_mode: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── AuthN: verify the caller's JWT ──
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // ── AuthZ: confirm the caller is an admin (server-side, service-role read) ──
  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!callerProfile?.is_admin) return json({ error: "Forbidden" }, 403);

  let body: { action?: string; userId?: string; delta?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body;

  try {
    switch (action) {
      // ── List all users (auth + profile join) ──
      case "list-users": {
        const [{ data: authData }, { data: profiles }] = await Promise.all([
          supabase.auth.admin.listUsers({ perPage: 1000 }),
          supabase
            .from("user_profiles")
            .select("id, credits_remaining, is_admin, stripe_subscription_id, instagram_username, cloned_voice_id"),
        ]);
        const profileMap = Object.fromEntries(
          ((profiles as any[]) || []).map((p) => [p.id, p]),
        );
        const users = ((authData as any)?.users || []).map((u: any) => {
          const p: any = profileMap[u.id] || {};
          return {
            id: u.id,
            email: u.email || "(no email)",
            created_at: u.created_at,
            credits: p.credits_remaining ?? 0,
            is_admin: p.is_admin ?? false,
            has_sub: !!p.stripe_subscription_id,
            ig_username: p.instagram_username ?? null,
            has_voice: !!p.cloned_voice_id,
          };
        });
        users.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        return json({ users });
      }

      // ── Pipeline: last 500 generations ──
      case "pipeline": {
        const { data } = await supabase
          .from("ai_generations")
          .select("id, status, source_mode, created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        return json({ gens: (data as Generation[]) || [] });
      }

      // ── Stats: 30-day rollups ──
      case "stats": {
        const now = Date.now();
        const thirtyDaysAgo = new Date(now - 30 * DAY_MS).toISOString();
        const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();

        const [{ data: gens30d }, { data: projects30d }, { data: projects7d }, { data: profiles }] =
          await Promise.all([
            supabase
              .from("ai_generations")
              .select("id, status, source_mode, created_at")
              .gte("created_at", thirtyDaysAgo),
            supabase.from("projects").select("user_id").gte("created_at", thirtyDaysAgo),
            supabase.from("projects").select("user_id").gte("created_at", sevenDaysAgo),
            supabase.from("user_profiles").select("stripe_subscription_id, credits_remaining"),
          ]);

        const active30d = new Set(((projects30d as any[]) || []).map((p) => p.user_id)).size;
        const active7d = new Set(((projects7d as any[]) || []).map((p) => p.user_id)).size;
        const payingCount = ((profiles as any[]) || []).filter((p) => p.stripe_subscription_id).length;
        const freeCount = ((profiles as any[]) || []).length - payingCount;
        const totalCredits = ((profiles as any[]) || []).reduce(
          (sum, p) => sum + (p.credits_remaining || 0),
          0,
        );

        return json({
          gens30d: (gens30d as Generation[]) || [],
          payingCount,
          freeCount,
          totalCredits,
          active7d,
          active30d,
        });
      }

      // ── Adjust credits (server computes next value; never trusts client's "current") ──
      case "adjust-credits": {
        const { userId, delta } = body;
        if (!userId || typeof delta !== "number") {
          return json({ error: "userId and numeric delta required" }, 400);
        }
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("credits_remaining")
          .eq("id", userId)
          .maybeSingle();
        if (!profile) return json({ error: "User not found" }, 404);

        const next = Math.max(0, (profile.credits_remaining ?? 0) + delta);
        const { error } = await supabase
          .from("user_profiles")
          .update({ credits_remaining: next })
          .eq("id", userId);
        if (error) return json({ error: "Failed to update credits" }, 500);
        return json({ credits: next });
      }

      // ── Toggle admin (server reads current; blocks self-demotion lockout) ──
      case "toggle-admin": {
        const { userId } = body;
        if (!userId) return json({ error: "userId required" }, 400);

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();
        if (!profile) return json({ error: "User not found" }, 404);

        const next = !profile.is_admin;
        if (userId === user.id && !next) {
          return json({ error: "You cannot revoke your own admin access" }, 400);
        }

        const { error } = await supabase
          .from("user_profiles")
          .update({ is_admin: next })
          .eq("id", userId);
        if (error) return json({ error: "Failed to update admin status" }, 500);
        return json({ is_admin: next });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("admin-api error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
