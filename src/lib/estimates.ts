// One source of truth for the wait times shown in the UI. Keep these honest —
// measured on production renders (Sep 2026), not aspirational.
export const ESTIMATES = {
  /** Article: script lines → AI/stock clips + voiceover, before the review step */
  articleClips: "3–8 min",
  /** Final Remotion render of an article after review */
  articleRender: "3–10 min",
  /** Uploaded talking-head: AI edit plan + b-roll + render */
  talkingHeadRender: "3–6 min",
  /** Upload → transcript for a short video */
  transcription: "1–3 min",
  /** Each highlight short from a long video */
  perHighlight: "about 3 min",
} as const;
