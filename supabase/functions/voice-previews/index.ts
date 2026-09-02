import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TARGET_IDS = new Set([
  "KXOzch1bNSOicTxNAakl",
  "EXAVITQu4vr4xnSDxMaL",
  "pNInz6obpgDQGcFmaJgB",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "ElevenLabs API error" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await res.json();
  const previews: Record<string, string> = {};
  for (const voice of data.voices ?? []) {
    if (TARGET_IDS.has(voice.voice_id) && voice.preview_url) {
      previews[voice.voice_id] = voice.preview_url;
    }
  }

  return new Response(JSON.stringify(previews), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
