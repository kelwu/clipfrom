import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const FPS = 30;

function stripEmojis(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ai_gen_id, captions, voice_id } = await req.json();
    const resolvedVoiceId = voice_id ?? Deno.env.get("ELEVENLABS_VOICE_ID") ?? "KXOzch1bNSOicTxNAakl";

    // Strip emojis for TTS — emojis are skipped by ElevenLabs and break character offset math
    const cleanCaptions: string[] = Array.isArray(captions) ? captions.map(stripEmojis) : [];
    const cleanScript = cleanCaptions.join(" ");

    // Use the with-timestamps endpoint to get character-level timing data
    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanScript,
          model_id: "eleven_monolingual_v1",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!elevenResponse.ok) {
      const errText = await elevenResponse.text();
      throw new Error(`ElevenLabs error ${elevenResponse.status}: ${errText}`);
    }

    const elevenData = await elevenResponse.json();

    // Decode base64 audio to binary
    const base64Audio: string = elevenData.audio_base64;
    const binaryStr = atob(base64Audio);
    const audioBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      audioBytes[i] = binaryStr.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fileName = `voiceover-${ai_gen_id}.mp3`;
    const { error } = await supabase.storage
      .from("voiceovers")
      .upload(fileName, audioBytes, { contentType: "audio/mpeg", upsert: true });

    if (error) throw new Error(error.message);

    const { data: { publicUrl } } = supabase.storage
      .from("voiceovers")
      .getPublicUrl(fileName);

    // Derive per-caption and per-word frame offsets from ElevenLabs character timestamps
    let caption_timings: number[] = [0, 0, 0, 0, 0];
    let word_timings: number[][] = [[], [], [], [], []];

    const alignment = elevenData.alignment;
    if (cleanCaptions.length === 5 && alignment?.character_start_times_seconds) {
      const startTimes: number[] = alignment.character_start_times_seconds;

      // Use emoji-stripped caption lengths — ElevenLabs skips emojis so raw .length would be off
      let charOffset = 0;
      for (let i = 0; i < 5; i++) {
        if (i === 0) {
          caption_timings[0] = 0;
        } else {
          const idx = Math.min(charOffset, startTimes.length - 1);
          caption_timings[i] = Math.round(startTimes[idx] * FPS);
        }

        // Per-word timings: find the char offset of each word within this caption
        const words = cleanCaptions[i].split(" ").filter(Boolean);
        let wordCharOffset = charOffset;
        word_timings[i] = words.map((word) => {
          const idx = Math.min(wordCharOffset, startTimes.length - 1);
          const frame = Math.round(startTimes[idx] * FPS);
          wordCharOffset += word.length + 1; // +1 for space after word
          return frame;
        });

        charOffset += cleanCaptions[i].length + 1; // +1 for the joining space
      }
    }

    const endTimes: number[] = alignment?.character_end_times_seconds ?? [];
    const audio_duration_seconds = endTimes.length > 0 ? endTimes[endTimes.length - 1] : null;

    // Validate caption_timings are strictly increasing — charOffset can drift if ElevenLabs
    // normalizes characters differently than .length counts. Fall back to even distribution.
    const isMonotonic = caption_timings.every((v, i) => i === 0 || v > caption_timings[i - 1]);
    if (!isMonotonic) {
      const totalFrames = Math.round((audio_duration_seconds ?? 30) * FPS);
      caption_timings = Array.from({ length: 5 }, (_, j) => Math.round((j / 5) * totalFrames));
      // Reset word_timings to empty so the renderer falls back to uniform distribution
      word_timings = [[], [], [], [], []];
    }

    return new Response(
      JSON.stringify({ success: true, audio_url: publicUrl, caption_timings, word_timings, audio_duration_seconds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
