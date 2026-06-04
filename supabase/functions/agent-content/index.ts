import { createClient } from "npm:@supabase/supabase-js";
import Anthropic from "npm:@anthropic-ai/sdk";
import type { ContentWebhookPayload } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AD_DOMAINS = /doubleclick\.net|googlesyndication|amazon-adsystem|adnxs|pubmatic|outbrain|taboola|adblade|criteo|moatads|rubiconproject|openx\.net|sharethrough|tribalfusion|yieldmanager|advertising\.com/i;
const AD_CLASSES = /\b(ad|ads|advertisement|banner|sponsor|promo|popup|leaderboard)\b/i;

function extractArticleImages(html: string): string[] {
  const images: string[] = [];

  // og:image first — publisher-chosen representative image
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1] && !ogMatch[1].startsWith("data:")) images.push(ogMatch[1]);

  // Body images from article/main content areas
  const contentMatch = html.match(/<(?:article|main|section)[^>]*>([\s\S]*?)<\/(?:article|main|section)>/i);
  const searchArea = contentMatch?.[1] ?? html;

  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(searchArea)) !== null && images.length < 6) {
    const src = m[1];
    const tag = m[0];
    if (src.startsWith("data:")) continue;
    if (AD_DOMAINS.test(src)) continue;
    if (AD_CLASSES.test(tag)) continue;
    if (/\/(pixel|track|beacon|imp)\b/i.test(src)) continue;
    if (!images.includes(src)) images.push(src);
  }

  return [...new Set(images)].slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: ContentWebhookPayload = await req.json();
    const { content, type, project_id } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller owns this project
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

    // Mark processing immediately
    await supabase.from("ai_generations").upsert(
      { project_id, status: "processing", caption_options: [] },
      { onConflict: "project_id" }
    );

    // Fetch article text if URL was given
    let articleText = content;
    let articleImages: string[] = [];
    if (type === "url") {
      // SSRF guard: only fetch public http/https URLs, block private ranges
      let parsedUrl: URL;
      try { parsedUrl = new URL(content); } catch { throw new Error("Invalid URL"); }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only http and https URLs are supported");
      }
      const privateRange = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1)/i;
      if (privateRange.test(parsedUrl.hostname)) {
        throw new Error("URL points to a private address");
      }

      const resp = await fetch(content, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ClipFrom/1.0)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`Article fetch failed: ${resp.status}`);

      // Cap at 2 MB — prevents memory exhaustion from large pages or binary files
      const MAX_BYTES = 2 * 1024 * 1024;
      const buffer = await resp.arrayBuffer();
      const html = new TextDecoder().decode(
        buffer.byteLength <= MAX_BYTES ? buffer : buffer.slice(0, MAX_BYTES)
      );
      // Extract images before stripping tags
      articleImages = extractArticleImages(html);
      // Extract main content: remove boilerplate then grab densest text block
      const cleaned = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // Take up to 12000 chars to give Claude more article context
      articleText = cleaned.slice(0, 12000);

      // Guard: if the page returned almost no text it's almost certainly
      // a JS-rendered page (React/Next.js) whose content requires a browser.
      if (articleText.trim().split(/\s+/).length < 80) {
        return new Response(
          JSON.stringify({
            error: "Could not extract article text from that URL — the page appears to be JavaScript-rendered and requires a browser to load. Try copying and pasting the article text directly into the text box instead.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate captions via Claude
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `You are the best short-form video scriptwriter on the internet. You write captions that make people stop scrolling and feel like they just discovered something they can't unlearn. You pull the single most surprising, specific, or counter-intuitive fact from the source material and build every caption around it. You never use filler phrases like "you need to see this" or "here's why." You never write generic summaries. Every word you write is earned.`,
      messages: [
        {
          role: "user",
          content: `Turn this article into a 5-part short-form video script and 1 Instagram caption.

Article:
${articleText}

Return ONLY valid JSON — no explanation, no markdown fences:
{
  "caption_options": ["caption 1", "caption 2", "caption 3", "caption 4", "caption 5"],
  "description": "instagram caption here"
}

The 5 captions tell one cohesive story across 5 clips. Each clip is 5 seconds of video with text overlaid. Think of them as 5 beats of a viral hook:

Clip 1 — THE HOOK: Open with the single most surprising or counter-intuitive claim from the article. Use a SPECIFIC number, name, or result if the article has one. Make the viewer think "wait, what?" Do NOT use a question — make a bold declarative statement.

Clip 2 — THE STAKES: Why does this matter to the viewer personally? What's the uncomfortable truth or consequence? Be direct and specific to THIS article, not generic.

Clip 3 — THE EVIDENCE: Name the specific finding, mechanism, or data point that proves the hook. Concrete > vague. "A Stanford 12-year study" beats "research shows."

Clip 4 — THE TWIST: The thing that flips conventional wisdom. What do most people get completely wrong about this topic? Start with "Most people think..." or "The problem isn't..."

Clip 5 — THE PAYOFF: The one thing to remember or do differently. Make it feel like the viewer just got insider knowledge. End with a sense of resolution.

Hard rules:
- Use ACTUAL details from the article — real numbers, real names, real findings. No placeholders like [X]% or generic examples.
- 10–18 words per caption. Specificity > brevity. A tight 15-word caption beats a vague 8-word one.
- Present tense, active voice, sentence case (not ALL CAPS)
- No hashtags, no emojis, no ellipses as a crutch
- Each caption must flow naturally from the one before it — this is a story, not 5 separate tweets
- Each caption must introduce NEW information not already stated. If you find yourself rephrasing something a previous caption already said, stop and find a different angle. A viewer watching all 5 should learn something new at each beat.
- At most ONE caption may start with the main subject's name (company, person, or product). The other 4 must open differently: a number, a verb, a consequence, a rhetorical pivot, or a surprising detail. Think like a screenwriter, not a journalist.

Rules for description:
- 150–200 words, conversational and direct
- Opens with the strongest hook from the article
- Explains the key insight or finding in plain language
- Ends with a call to action and 10–15 relevant hashtags`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Claude refused or couldn't generate — surface a clean user-facing error
      return new Response(
        JSON.stringify({
          error: "The article didn't have enough content for ClipFrom to work with. Try a different URL, or paste the article text directly.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = JSON.parse(jsonMatch[0]) as {
      caption_options: string[];
      description: string;
    };

    // Write captions (and article images if any) to DB
    await supabase
      .from("ai_generations")
      .update({
        caption_options: data.caption_options,
        description: data.description,
        status: "captions_ready",
        ...(articleImages.length > 0 ? { article_images: articleImages } : {}),
      })
      .eq("project_id", project_id);

    // Return captions directly — frontend can navigate immediately
    return new Response(
      JSON.stringify({ ok: true, project_id, caption_options: data.caption_options, description: data.description, article_images: articleImages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-content error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
