import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell";

interface Caption {
  id: number;
  text: string;
  enabled: boolean;
  wordCount: number;
}

const SAMPLE_TEXT = "AI is changing everything";

const PRESETS = [
  {
    id: "viral",
    label: "Viral",
    tag: "Most Popular",
    description: "Word-by-word highlights, zoom punches, hard cuts",
    captionStyle: "pill" as const,
    transitionStyle: "cut" as const,
    videoSource: "ai" as const,
    accent: "#E89054",
    ring: "ring-[#E89054]/60",
    border: "border-[#E89054]/30",
    bg: "bg-[#E89054]/5",
    previewCaption: (
      <div className="absolute bottom-4 left-0 right-0 flex justify-center px-2">
        <div className="flex gap-0.5">
          <div className="bg-[#E89054] rounded-md px-1.5 py-0.5">
            <span className="text-white text-[6px] font-black leading-tight">AI</span>
          </div>
          <div className="bg-black/70 rounded-md px-1.5 py-0.5">
            <span className="text-white/70 text-[6px] font-bold leading-tight">is changing</span>
          </div>
        </div>
      </div>
    ),
    attrs: ["Pill captions", "Hard cut", "AI footage"],
  },
  {
    id: "clean",
    label: "Clean",
    tag: null,
    description: "Bold karaoke text, smooth fades, real stock clips",
    captionStyle: "bold" as const,
    transitionStyle: "fade" as const,
    videoSource: "stock" as const,
    accent: "#60a5fa",
    ring: "ring-[#60a5fa]/60",
    border: "border-[#60a5fa]/30",
    bg: "bg-[#60a5fa]/5",
    previewCaption: (
      <div className="absolute bottom-4 left-0 right-0 flex justify-center px-3">
        <div>
          <span className="text-[#F5C518] text-[8px] font-black">AI </span>
          <span className="text-white text-[8px] font-black" style={{ textShadow: "0 1px 6px rgba(0,0,0,1)" }}>is changing</span>
        </div>
      </div>
    ),
    attrs: ["Bold text", "Fade", "Stock footage"],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    tag: null,
    description: "Subtitle bar, wipe transitions, AI + stock mix",
    captionStyle: "lower-third" as const,
    transitionStyle: "wipe" as const,
    videoSource: "mix" as const,
    accent: "#a78bfa",
    ring: "ring-[#a78bfa]/60",
    border: "border-[#a78bfa]/30",
    bg: "bg-[#a78bfa]/5",
    previewCaption: (
      <div className="absolute bottom-0 left-0 right-0 bg-black/65 px-2 py-1.5">
        <span className="text-[#E89054] text-[6px] font-bold">AI </span>
        <span className="text-white text-[6px] font-semibold">is changing</span>
      </div>
    ),
    attrs: ["Lower third", "Wipe", "AI + Stock"],
  },
  {
    id: "raw",
    label: "Raw",
    tag: null,
    description: "No captions, pure visuals, hard cuts",
    captionStyle: "none" as const,
    transitionStyle: "cut" as const,
    videoSource: "ai" as const,
    accent: "#6b7280",
    ring: "ring-gray-500/60",
    border: "border-gray-500/30",
    bg: "bg-gray-500/5",
    previewCaption: (
      <div className="absolute inset-0 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5">
          <path d="M2 2l20 20M9 9v11h11M4 4H2v16h5"/>
        </svg>
      </div>
    ),
    attrs: ["No captions", "Hard cut", "AI footage"],
  },
] as const;

type PresetId = typeof PRESETS[number]["id"];

export default function CaptionEditor() {
  const location = useLocation();
  const navigate = useNavigate();

  const captions_data = location.state?.captions || {};
  const projectId = location.state?.projectId;
  const userEmail = location.state?.userEmail;

  const initialCaptions: Caption[] = [1, 2, 3, 4, 5].map((i) => ({
    id: i,
    text: captions_data[`text${i}`] || `Caption ${i} will appear here after processing.`,
    enabled: true,
    wordCount: (captions_data[`text${i}`] || "").split(" ").filter(Boolean).length,
  }));

  const [captions, setCaptions] = useState<Caption[]>(initialCaptions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("viral");
  const [showHookCard, setShowHookCard] = useState(false);
  const [hookText, setHookText] = useState("");
  const [captionFont, setCaptionFont] = useState("Inter");

  const enabledCount = captions.filter((c) => c.enabled).length;

  const toggleCaption = (id: number) => {
    setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const updateCaptionText = (id: number, text: string) => {
    setCaptions((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, text, wordCount: text.split(" ").filter(Boolean).length } : c
      )
    );
  };

  const handleGenerate = async () => {
    const enabledCaptions = captions.filter((c) => c.enabled);
    if (enabledCaptions.length === 0) {
      toast.error("Please enable at least one caption to generate videos.");
      return;
    }
    const preset = PRESETS.find((p) => p.id === selectedPreset)!;
    setIsGenerating(true);
    toast.success("Generating your videos...");
    navigate(`/results/${projectId}`, {
      state: {
        projectId,
        userEmail,
        captions: enabledCaptions,
        captionStyle: preset.captionStyle,
        transitionStyle: preset.transitionStyle,
        videoSource: preset.videoSource,
        showHookCard,
        captionFont,
        ...(showHookCard && hookText.trim() ? { hookText: hookText.trim() } : {}),
      },
    });
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full bg-[#0a0a0a] text-white">
        {/* Top bar */}
        <div className="border-b border-gray-800 bg-[#0d0d0d] px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Dashboard
          </button>
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm text-gray-300 font-medium">Caption Review</span>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── Left column: captions ── */}
          <div className="flex-1 min-w-0 overflow-y-auto px-8 py-8">
            <div className="max-w-2xl mx-auto">

              {/* Heading */}
              <div className="mb-7">
                <h1 className="text-2xl font-bold mb-1">Edit Your Captions</h1>
                <p className="text-gray-400 text-sm">
                  Review and customize the AI-generated captions. Toggle off any you don't want included.
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6 bg-gray-900 rounded-xl px-5 py-4 border border-gray-800">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm text-gray-400">Selected for generation</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    {enabledCount} of {captions.length} captions
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(enabledCount / captions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Captions list */}
              <div className="space-y-3 mb-8">
                {captions.map((caption) => (
                  <div
                    key={caption.id}
                    className={`rounded-xl border transition-all ${
                      !caption.enabled
                        ? "border-gray-800 bg-gray-900/40 opacity-40"
                        : "border-gray-700 bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-emerald-500 uppercase tracking-widest">
                          Caption {caption.id}
                        </span>
                        <span className="text-xs text-gray-500">{caption.wordCount} words</span>
                      </div>
                      <div
                        onClick={() => toggleCaption(caption.id)}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                          {caption.enabled ? "Included" : "Excluded"}
                        </span>
                        <div
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            caption.enabled ? "bg-emerald-500" : "bg-gray-700"
                          }`}
                        >
                          <div
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                              caption.enabled ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <textarea
                        className={`w-full bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-emerald-500 focus:bg-gray-800 leading-relaxed transition-colors placeholder-gray-600 ${
                          !caption.enabled ? "pointer-events-none" : ""
                        }`}
                        rows={3}
                        value={caption.text}
                        onChange={(e) => updateCaptionText(caption.id, e.target.value)}
                        disabled={!caption.enabled}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || enabledCount === 0}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-base transition-colors"
              >
                {isGenerating ? "Generating..." : "Generate Video"}
              </button>
              {enabledCount === 0 && (
                <p className="text-center text-xs text-gray-500 mt-3">
                  Enable at least one caption to continue
                </p>
              )}
            </div>
          </div>

          {/* ── Right column: video style presets ── */}
          <div className="w-72 flex-shrink-0 border-l border-gray-800 overflow-y-auto">
            <div className="p-5">

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Video Style</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Pick a style — each bundles captions, transitions, and footage into one vibe.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 ${
                        isSelected
                          ? `ring-2 ${preset.ring} ${preset.border} ${preset.bg}`
                          : "border-gray-800 hover:border-gray-600 bg-gray-900/60"
                      }`}
                    >
                      {/* 9:16 mini preview */}
                      <div
                        className="relative flex-shrink-0 w-10 rounded-lg overflow-hidden border border-gray-700"
                        style={{ aspectRatio: "9/16", background: "linear-gradient(175deg, #1a1f2e 0%, #0d1014 60%, #080b0e 100%)" }}
                      >
                        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)" }} />
                        {preset.previewCaption}
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full shadow-sm" style={{ background: preset.accent }} />
                        )}
                      </div>

                      {/* Text content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-gray-300"}`}>
                            {preset.label}
                          </span>
                          {preset.tag && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${preset.accent}20`, color: preset.accent }}>
                              {preset.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed mb-2">{preset.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {preset.attrs.map((attr) => (
                            <span
                              key={attr}
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded border"
                              style={isSelected
                                ? { color: preset.accent, borderColor: `${preset.accent}40`, background: `${preset.accent}10` }
                                : { color: "#6b7280", borderColor: "#374151", background: "transparent" }
                              }
                            >
                              {attr}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Check */}
                      <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "border-transparent" : "border-gray-700"
                      }`} style={isSelected ? { background: preset.accent } : {}}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Summary bar */}
              {(() => {
                const preset = PRESETS.find((p) => p.id === selectedPreset)!;
                return (
                  <div className="mt-4 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800 space-y-1.5">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium block">Selected</span>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">Captions</span>
                      <span className="text-[10px] font-semibold text-gray-300 capitalize">
                        {preset.captionStyle === "lower-third" ? "Lower Third" : preset.captionStyle === "none" ? "Off" : preset.captionStyle}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">Transition</span>
                      <span className="text-[10px] font-semibold text-gray-300 capitalize">{preset.transitionStyle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">Footage</span>
                      <span className="text-[10px] font-semibold text-gray-300">
                        {preset.videoSource === "ai" ? "AI Generated" : preset.videoSource === "stock" ? "Stock" : "AI + Stock"}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Hook intro toggle + text editor */}
              <div className="mt-4 rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-3">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-300">Hook Intro</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">Full-screen text card for 2.5s before clips</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHookCard(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${showHookCard ? "bg-violet-500" : "bg-gray-700"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showHookCard ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {showHookCard && (
                  <div className="px-3 pb-3 border-t border-gray-800 pt-2.5">
                    <p className="text-[10px] text-gray-500 mb-1.5">Hook text <span className="text-gray-700">(leave blank to use caption 1)</span></p>
                    <input
                      type="text"
                      value={hookText}
                      onChange={e => setHookText(e.target.value)}
                      placeholder={captions[0]?.text || "Your hook here…"}
                      maxLength={120}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    {hookText.length > 80 && (
                      <p className="text-[10px] text-amber-500 mt-1">{hookText.length}/120 — shorter hooks perform better</p>
                    )}
                  </div>
                )}
              </div>

              {/* Caption font selector */}
              <div className="mt-3 px-3 py-3 rounded-lg bg-gray-900 border border-gray-800">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Caption Font</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: "Inter",       label: "Inter",     style: {} },
                    { id: "Montserrat",  label: "Montserrat",style: { fontFamily: "var(--font-montserrat, sans-serif)" } },
                    { id: "Bebas Neue",  label: "BEBAS",     style: { textTransform: "uppercase" as const, letterSpacing: "0.05em" } },
                    { id: "Oswald",      label: "Oswald",    style: {} },
                  ].map(({ id, label, style }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCaptionFont(id)}
                      className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                        captionFont === id
                          ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                          : "border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-400"
                      }`}
                      style={style}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
