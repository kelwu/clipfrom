import { Resend } from "npm:resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
};

const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Internal-only: called by the Railway render pipeline. Without this gate anyone holding
  // the public anon key could send mail from noreply@clipfrom.ai to any address.
  if (!PIPELINE_SECRET || req.headers.get("x-pipeline-secret") !== PIPELINE_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { to, video_url: rawVideoUrl } = await req.json();

    if (!to || !rawVideoUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, video_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedUrl: URL;
    try { parsedUrl = new URL(String(rawVideoUrl)); } catch {
      return new Response(JSON.stringify({ error: "Invalid video_url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (parsedUrl.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "video_url must be https" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const video_url = escapeHtml(parsedUrl.toString());

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    const { error } = await resend.emails.send({
      from: "ClipFrom <noreply@clipfrom.ai>",
      to,
      subject: "Your video is ready",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;">
          <div style="max-width:480px;margin:40px auto;padding:0 20px;">
            <div style="background:#111;border:1px solid #222;border-radius:16px;overflow:hidden;">
              <!-- Header -->
              <div style="padding:28px 32px 24px;border-bottom:1px solid #1a1a1a;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:#10b981;"></div>
                  <span style="color:#10b981;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Video Ready</span>
                </div>
                <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0;line-height:1.3;">Your ClipFrom video is ready</h1>
              </div>

              <!-- Body -->
              <div style="padding:28px 32px;">
                <p style="color:#9ca3af;font-size:14px;line-height:1.7;margin:0 0 24px;">
                  Your AI-generated short-form video has finished rendering and is ready to download and share.
                </p>

                <!-- CTA Button -->
                <a href="${video_url}"
                   style="display:inline-block;background:#10b981;color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                  Watch &amp; Download
                </a>

                <p style="color:#4b5563;font-size:12px;line-height:1.6;margin:0;">
                  Ready for Instagram Reels, TikTok, and YouTube Shorts.<br>
                  The link above goes directly to your rendered video file.
                </p>
              </div>

              <!-- Footer -->
              <div style="padding:20px 32px;border-top:1px solid #1a1a1a;">
                <p style="color:#374151;font-size:11px;margin:0;">
                  ClipFrom — AI Video Generation<br>
                  You received this because you submitted an article for processing.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({ error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-notification-email error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
