import { Resend } from "npm:resend";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";
const APP_URL = "https://www.clipfrom.ai";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Shared email shell. Every interpolated value must already be HTML-escaped.
function emailHtml(o: { label: string; title: string; body: string; ctaHref?: string; ctaText?: string; footnote: string }) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;">
      <div style="max-width:480px;margin:40px auto;padding:0 20px;">
        <div style="background:#111;border:1px solid #222;border-radius:16px;overflow:hidden;">
          <div style="padding:28px 32px 24px;border-bottom:1px solid #1a1a1a;">
            <div style="margin-bottom:4px;">
              <span style="color:#a78bfa;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${o.label}</span>
            </div>
            <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">${o.title}</h1>
          </div>
          <div style="padding:28px 32px;">
            <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 24px;">${o.body}</p>
            ${o.ctaHref ? `<a href="${o.ctaHref}" style="display:inline-block;background:#8b7cf6;color:#0a0a0a;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">${o.ctaText}</a>` : ""}
          </div>
          <div style="padding:20px 32px;border-top:1px solid #1a1a1a;">
            <p style="color:#4b5563;font-size:11px;margin:0;">ClipFrom<br>${o.footnote}</p>
          </div>
        </div>
      </div>
    </body>
    </html>`;
}

function httpsUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin recipients are resolved server-side — never taken from the request.
async function adminEmails(): Promise<string[]> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: admins } = await admin.from("user_profiles").select("id").eq("is_admin", true);
  const emails: string[] = [];
  for (const a of admins ?? []) {
    const { data } = await admin.auth.admin.getUserById(a.id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Internal-only: called by the Railway render pipeline. Without this gate anyone holding
  // the public anon key could send mail from noreply@clipfrom.ai to any address.
  if (!PIPELINE_SECRET || req.headers.get("x-pipeline-secret") !== PIPELINE_SECRET) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const body = await req.json();
    const kind: string = body.kind ?? "video_ready";
    let to: string | string[];
    let subject: string;
    let html: string;

    if (kind === "video_ready") {
      const videoUrl = httpsUrl(body.video_url);
      if (!body.to || !videoUrl) return json({ error: "Missing or invalid: to, video_url (https)" }, 400);
      to = body.to;
      subject = "Your video is ready";
      html = emailHtml({
        label: "Video ready",
        title: "Your ClipFrom video is ready",
        body: "Your short-form video has finished rendering and is ready to download and share.",
        ctaHref: escapeHtml(videoUrl),
        ctaText: "Watch &amp; download",
        footnote: "Ready for Instagram Reels, TikTok, and YouTube Shorts.",
      });
    } else if (kind === "review_ready") {
      // Article clips pause for the user's review before the final render.
      if (!body.to || !UUID_RE.test(String(body.project_id ?? ""))) return json({ error: "Missing or invalid: to, project_id" }, 400);
      to = body.to;
      subject = "Your clips are ready to review";
      html = emailHtml({
        label: "Clips ready",
        title: "Your clips are ready to review",
        body: "Your voiceover and clips are done. Take a quick look, swap anything you don't like, then render the final video.",
        ctaHref: escapeHtml(`${APP_URL}/review/${body.project_id}`),
        ctaText: "Review clips",
        footnote: "Nothing is rendered until you approve it.",
      });
    } else if (kind === "admin_alert") {
      to = await adminEmails();
      if (to.length === 0) return json({ error: "No admin recipients" }, 500);
      const title = escapeHtml(String(body.title ?? "Pipeline alert").slice(0, 120));
      subject = `[ClipFrom alert] ${String(body.title ?? "Pipeline alert").slice(0, 120)}`;
      html = emailHtml({
        label: "Admin alert",
        title,
        body: escapeHtml(String(body.message ?? "").slice(0, 2000)).replace(/\n/g, "<br>"),
        footnote: "Sent by the render pipeline to ClipFrom admins.",
      });
    } else {
      return json({ error: `Unknown kind: ${kind}` }, 400);
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
    const { error } = await resend.emails.send({ from: "ClipFrom <noreply@clipfrom.ai>", to, subject, html });
    if (error) {
      console.error("Resend error:", error);
      return json({ error }, 500);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("send-notification-email error:", err);
    return json({ error: String(err) }, 500);
  }
});
